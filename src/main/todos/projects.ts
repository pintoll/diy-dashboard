import type Database from "better-sqlite3";
import { nanoid } from "nanoid";
import { getTodosDb } from "./db";
import { emitTodosChanged } from "./events";
import { recordOp, rowChanged } from "./journal";
import { createDefaultNotesDoc, removeDocsForProject } from "./project-docs";
import {
  normalizeKind,
  normalizeOutcome,
  normalizeProjectTitle,
  normalizeStatus,
  normalizeTargetDate,
  resolveArchivedAt,
} from "./project-fields";
import {
  NotFoundError,
  ValidationError,
  rowToProject,
  rowToTodo,
  type Project,
  type ProjectCreateInput,
  type ProjectListFilter,
  type ProjectPatch,
  type ProjectRow,
  type ProjectStatus,
  type ProjectTodos,
  type TodoRow,
  type WriteContext,
} from "./types";

// The steering layer above the day (docs/design/projects-para.md). Projects
// answer "is the right work moving at all"; todos still answer "finish today".
// Nothing here executes: the only path from a project into doing is pulling one
// of its backlog todos onto a date, which is an ordinary todo update.
//
// Field rules live in project-fields.ts so they are testable without a
// connection; this file is SQL, journaling and broadcast.
//
// Every write broadcasts todos:changed with reason "project" after its
// transaction commits. The renderer's todo store ignores that reason — project
// rows are not todo rows — so deleteProject, which does move todos, emits a
// second "update" alongside.

function getProjectRow(db: Database.Database, id: string): ProjectRow {
  const row = db
    .prepare("SELECT * FROM projects WHERE id = ?")
    .get(id) as ProjectRow | undefined;
  if (!row) throw new NotFoundError(`No project with id "${id}"`);
  return row;
}

export function listProjects(filter: ProjectListFilter = {}): Project[] {
  const db = getTodosDb();
  const rows = (
    filter.status !== undefined
      ? db
          .prepare(
            "SELECT * FROM projects WHERE status = ? ORDER BY sort_order, created_at"
          )
          .all(normalizeStatus(filter.status))
      : db.prepare("SELECT * FROM projects ORDER BY sort_order, created_at").all()
  ) as ProjectRow[];
  return rows.map(rowToProject);
}

export function getProject(id: string): Project {
  return rowToProject(getProjectRow(getTodosDb(), id));
}

export function createProject(input: ProjectCreateInput, ctx: WriteContext): Project {
  const db = getTodosDb();
  const title = normalizeProjectTitle(input.title);
  const kind = input.kind !== undefined ? normalizeKind(input.kind) : "project";
  const outcome = normalizeOutcome(input.outcome);
  const status = input.status !== undefined ? normalizeStatus(input.status) : "active";
  const targetDate = normalizeTargetDate(input.targetDate);
  const archivedAt = resolveArchivedAt(null, status, null, () => new Date().toISOString());
  const id = nanoid();

  const row = db.transaction((): ProjectRow => {
    const { next } = db
      .prepare("SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM projects")
      .get() as { next: number };
    db.prepare(
      `INSERT INTO projects (id, kind, title, outcome, status, target_date, sort_order, archived_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, kind, title, outcome, status, targetDate, next, archivedAt);

    // Re-read: created_at and updated_at come from SQL defaults, and the
    // journal snapshot must be the row as stored.
    const created = getProjectRow(db, id);
    recordOp(db, ctx, {
      entity: "project",
      entityId: id,
      op: "create",
      before: null,
      after: created,
    });
    // The default doc is part of this intent — same context, so same reason and
    // same `at` stamp — and is journaled after the project it belongs to, so a
    // rewind's reverse replay removes the doc before the project.
    createDefaultNotesDoc(db, id, ctx);
    return created;
  })();

  emitTodosChanged({ reason: "project", id });
  return rowToProject(row);
}

export function updateProject(id: string, patch: ProjectPatch, ctx: WriteContext): Project {
  const db = getTodosDb();

  const updated = db.transaction((): ProjectRow => {
    const row = getProjectRow(db, id);
    const title = patch.title !== undefined ? normalizeProjectTitle(patch.title) : row.title;
    // A kind change is a real PARA move: an area that grows an end becomes a
    // project, and back. `outcome`/`target_date` are left alone — "projects
    // only" is advice about what to fill in, not an invariant to enforce.
    const kind = patch.kind !== undefined ? normalizeKind(patch.kind) : row.kind;
    const outcome = patch.outcome !== undefined ? normalizeOutcome(patch.outcome) : row.outcome;
    const status = patch.status !== undefined ? normalizeStatus(patch.status) : row.status;
    const targetDate =
      patch.targetDate !== undefined ? normalizeTargetDate(patch.targetDate) : row.target_date;
    if (patch.sortOrder !== undefined && !Number.isInteger(patch.sortOrder)) {
      throw new ValidationError("sortOrder must be an integer");
    }
    const sortOrder = patch.sortOrder ?? row.sort_order;
    const archivedAt = resolveArchivedAt(row.status, status, row.archived_at, () =>
      new Date().toISOString()
    );

    db.prepare(
      `UPDATE projects
       SET kind = ?, title = ?, outcome = ?, status = ?, target_date = ?,
           sort_order = ?, archived_at = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run(kind, title, outcome, status, targetDate, sortOrder, archivedAt, id);

    const after = getProjectRow(db, id);
    if (rowChanged(row, after)) {
      recordOp(db, ctx, {
        entity: "project",
        entityId: id,
        op: "update",
        before: row,
        after,
      });
    }
    return after;
  })();

  emitTodosChanged({ reason: "project", id });
  return rowToProject(updated);
}

/**
 * Detaches every todo filed under a project, one journaled todo update per row.
 * Joins the caller's transaction and shares its reason, like plan.ts's sweep.
 * Returns how many rows moved, so the caller knows whether the todo surfaces
 * need a broadcast of their own.
 */
function detachTodosFromProject(
  db: Database.Database,
  projectId: string,
  ctx: WriteContext
): number {
  const rows = db
    .prepare("SELECT * FROM todos WHERE project_id = ? ORDER BY rowid")
    .all(projectId) as TodoRow[];
  for (const row of rows) {
    db.prepare(
      "UPDATE todos SET project_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).run(row.id);
    const after = db.prepare("SELECT * FROM todos WHERE id = ?").get(row.id) as TodoRow;
    recordOp(db, ctx, {
      entity: "todo",
      entityId: row.id,
      op: "update",
      before: row,
      after,
    });
  }
  return rows.length;
}

/**
 * Deletes a project. Archiving is the recommended way to retire one — an
 * archived project keeps its history, which is the point of the archive tab —
 * but a mistyped project has to be removable, so this exists and journals
 * every consequence.
 *
 * Order inside the transaction is chosen for rewind: todos are detached and
 * docs removed before the project row goes, so a reverse replay recreates the
 * project before anything that points at it.
 */
export function deleteProject(id: string, ctx: WriteContext): void {
  const db = getTodosDb();
  const detached = db.transaction((): number => {
    const row = getProjectRow(db, id);
    const count = detachTodosFromProject(db, id, ctx);
    removeDocsForProject(db, id, ctx);
    db.prepare("DELETE FROM projects WHERE id = ?").run(id);
    recordOp(db, ctx, {
      entity: "project",
      entityId: id,
      op: "delete",
      before: row,
      after: null,
    });
    return count;
  })();

  emitTodosChanged({ reason: "project", id });
  // Detached todos are todo-surface news; "project" alone would leave the day
  // and inbox lists showing a project chip for a project that no longer exists.
  if (detached > 0) emitTodosChanged({ reason: "update" });
}

/**
 * A project's undated open work in pull order, plus what it has finished.
 * Dated open todos are deliberately absent: they were consciously scheduled and
 * belong to their day, not to a second execution surface here.
 */
export function listProjectTodos(id: string): ProjectTodos {
  const db = getTodosDb();
  getProjectRow(db, id);
  const backlog = db
    .prepare(
      `SELECT * FROM todos
       WHERE project_id = ? AND date IS NULL AND done = 0
       ORDER BY sort_order, created_at`
    )
    .all(id) as TodoRow[];
  const completed = db
    .prepare(
      `SELECT * FROM todos
       WHERE project_id = ? AND done = 1
       ORDER BY completed_on DESC, sort_order`
    )
    .all(id) as TodoRow[];
  return { backlog: backlog.map(rowToTodo), completed: completed.map(rowToTodo) };
}

/** Narrows an untrusted status filter (query strings, IPC payloads). */
export function asProjectStatus(value: unknown): ProjectStatus {
  return normalizeStatus(value);
}

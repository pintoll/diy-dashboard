import type Database from "better-sqlite3";
import { nanoid } from "nanoid";
import { getTodosDb } from "./db";
import { emitTodosChanged } from "./events";
import { recordOp, rowChanged } from "./journal";
import {
  normalizeDocBody,
  normalizeDocTitle,
  resolveDocBodyPatch,
} from "./project-fields";
import {
  NotFoundError,
  rowToProjectDoc,
  type ProjectDoc,
  type ProjectDocCreateInput,
  type ProjectDocPatch,
  type ProjectDocRow,
  type WriteContext,
} from "./types";

// A project's freeform prose — goals, decisions discovered mid-work, current
// state (docs/design/projects-para.md). Rows rather than files, so the agent
// API stays the single data plane and every edit lands in the ops journal.
//
// The note holds context; the backlog holds actions. Nothing here enforces
// that — it is the discipline the design asks of the writer, not a constraint.
//
// `project_id` has no FK, like plan_entries.todo_id: deleting a project sweeps
// its docs through removeDocsForProject below so each removal is journaled,
// where a cascade would erase them silently.

function getDocRow(db: Database.Database, id: string): ProjectDocRow {
  const row = db
    .prepare("SELECT * FROM project_docs WHERE id = ?")
    .get(id) as ProjectDocRow | undefined;
  if (!row) throw new NotFoundError(`No project doc with id "${id}"`);
  return row;
}

function assertProjectExists(db: Database.Database, projectId: string): void {
  const exists = db.prepare("SELECT 1 FROM projects WHERE id = ?").get(projectId);
  if (!exists) throw new NotFoundError(`No project with id "${projectId}"`);
}

export function listProjectDocs(projectId: string): ProjectDoc[] {
  const db = getTodosDb();
  assertProjectExists(db, projectId);
  const rows = db
    .prepare("SELECT * FROM project_docs WHERE project_id = ? ORDER BY sort_order, created_at")
    .all(projectId) as ProjectDocRow[];
  return rows.map(rowToProjectDoc);
}

export function getProjectDoc(id: string): ProjectDoc {
  return rowToProjectDoc(getDocRow(getTodosDb(), id));
}

/**
 * Inserts one doc and journals it. Joins the caller's open transaction rather
 * than opening its own, so both the standalone create below and the default
 * `notes` doc of a brand-new project (projects.ts createProject) write through
 * exactly one shape — log rendering and rewind must see one create op.
 */
export function insertProjectDoc(
  db: Database.Database,
  projectId: string,
  input: ProjectDocCreateInput,
  ctx: WriteContext
): ProjectDocRow {
  const title = normalizeDocTitle(input.title);
  const body = normalizeDocBody(input.body);
  const id = nanoid();
  const { next } = db
    .prepare(
      "SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM project_docs WHERE project_id = ?"
    )
    .get(projectId) as { next: number };

  db.prepare(
    `INSERT INTO project_docs (id, project_id, title, body, sort_order)
     VALUES (?, ?, ?, ?, ?)`
  ).run(id, projectId, title, body, next);

  // Re-read: created_at and updated_at come from SQL defaults, and the journal
  // snapshot must be the row as stored (crud.ts createTodo precedent).
  const created = getDocRow(db, id);
  recordOp(db, ctx, {
    entity: "project_doc",
    entityId: id,
    op: "create",
    before: null,
    after: created,
  });
  return created;
}

/** The `notes` doc every project starts with: one place for prose, no ceremony. */
export function createDefaultNotesDoc(
  db: Database.Database,
  projectId: string,
  ctx: WriteContext
): ProjectDocRow {
  return insertProjectDoc(db, projectId, { title: "notes" }, ctx);
}

export function createProjectDoc(
  projectId: string,
  input: ProjectDocCreateInput,
  ctx: WriteContext
): ProjectDoc {
  const db = getTodosDb();
  const row = db.transaction((): ProjectDocRow => {
    assertProjectExists(db, projectId);
    return insertProjectDoc(db, projectId, input, ctx);
  })();

  emitTodosChanged({ reason: "project", id: row.id });
  return rowToProjectDoc(row);
}

export function updateProjectDoc(
  id: string,
  patch: ProjectDocPatch,
  ctx: WriteContext
): ProjectDoc {
  const db = getTodosDb();

  const updated = db.transaction((): ProjectDocRow => {
    const row = getDocRow(db, id);
    const title = patch.title !== undefined ? normalizeDocTitle(patch.title) : row.title;
    const body = resolveDocBodyPatch(patch, row.body) ?? row.body;

    db.prepare(
      `UPDATE project_docs
       SET title = ?, body = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run(title, body, id);

    const after = getDocRow(db, id);
    if (rowChanged(row, after)) {
      recordOp(db, ctx, {
        entity: "project_doc",
        entityId: id,
        op: "update",
        before: row,
        after,
      });
    }
    return after;
  })();

  emitTodosChanged({ reason: "project", id });
  return rowToProjectDoc(updated);
}

// The one journaled-delete shape for a doc row, shared by the direct delete and
// the delete-project sweep (same rule as plan.ts deleteEntryRow).
function deleteDocRow(db: Database.Database, row: ProjectDocRow, ctx: WriteContext): void {
  db.prepare("DELETE FROM project_docs WHERE id = ?").run(row.id);
  recordOp(db, ctx, {
    entity: "project_doc",
    entityId: row.id,
    op: "delete",
    before: row,
    after: null,
  });
}

export function deleteProjectDoc(id: string, ctx: WriteContext): void {
  const db = getTodosDb();
  db.transaction(() => {
    deleteDocRow(db, getDocRow(db, id), ctx);
  })();
  emitTodosChanged({ reason: "project", id });
}

/**
 * Sweeps every doc of a project, one journaled delete op per row. Joins the
 * caller's transaction (projects.ts deleteProject) and shares its reason — the
 * sweep is part of the delete-project intent, not an intent of its own.
 */
export function removeDocsForProject(
  db: Database.Database,
  projectId: string,
  ctx: WriteContext
): void {
  const rows = db
    .prepare("SELECT * FROM project_docs WHERE project_id = ? ORDER BY rowid")
    .all(projectId) as ProjectDocRow[];
  for (const row of rows) deleteDocRow(db, row, ctx);
}

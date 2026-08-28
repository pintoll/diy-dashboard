import type Database from "better-sqlite3";
import { nanoid } from "nanoid";
import { getTodosDb } from "./db";
import { assertDate, contextDay } from "./date";
import { emitTodosChanged } from "./events";
import { movedBucket, normalizeName, normalizeOptionalDate } from "./fields";
import { recordOp, rowChanged } from "./journal";
import { removePlanEntriesForTodo } from "./plan";
import { assertProjectExists } from "./project-row";
import {
  NotFoundError,
  ValidationError,
  rowToTodo,
  type Todo,
  type TodoCreateInput,
  type TodoListFilter,
  type TodoPatch,
  type TodoRow,
  type WriteContext,
} from "./types";

const MAX_TITLE_LENGTH = 500;

function normalizeTitle(title: unknown): string {
  return normalizeName(title, "title", MAX_TITLE_LENGTH);
}

function normalizeNote(note: unknown): string | null {
  if (note === undefined || note === null) return null;
  if (typeof note !== "string") {
    throw new ValidationError("note must be a string or null");
  }
  const trimmed = note.trim();
  return trimmed.length > 0 ? trimmed : null;
}

// null is the backlog, not a malformed date, so it bypasses assertDate.
function normalizeDate(date: unknown): string | null {
  return normalizeOptionalDate(date, "date");
}

// null means unfiled (the inbox, if the todo is also undated). No FK backs this
// reference — deleteProject detaches through the journal instead — so filing
// under a project that does not exist is a caller bug worth rejecting here, the
// same rule plan.ts applies to todoId. Call inside the caller's transaction.
function normalizeProjectId(db: Database.Database, projectId: unknown): string | null {
  if (projectId === null) return null;
  if (typeof projectId !== "string" || projectId.length === 0) {
    throw new ValidationError("projectId must be a project id string or null");
  }
  assertProjectExists(db, projectId);
  return projectId;
}

// Appends to the end of a bucket — a day, or the backlog (`null`). `IS` rather
// than `=` because a NULL bind matches no row under `= ?`, which would land
// every parked todo on sort_order 0; for a non-null bind the two are identical.
export function nextSortOrder(db: Database.Database, date: string | null): number {
  const { next } = db
    .prepare(
      "SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM todos WHERE date IS ?"
    )
    .get(date) as { next: number };
  return next;
}

function getRow(id: string): TodoRow {
  const row = getTodosDb()
    .prepare("SELECT * FROM todos WHERE id = ?")
    .get(id) as TodoRow | undefined;
  if (!row) throw new NotFoundError(`No todo with id "${id}"`);
  return row;
}

export function getTodo(id: string): Todo {
  return rowToTodo(getRow(id));
}

/**
 * Resolves a set of todo ids to their titles for display — the analytics day
 * drill-down's per-session "worked on" line, which links a pomodoro session to
 * the todos that were on the desk during it (docs/design/multi-pomo-todo.md),
 * and the day log's plan-op title resolution (log.ts).
 * Deleted todos are simply absent from the result (the caller shows a fallback),
 * so this never throws on an unknown id the way `getTodo` does. Order is
 * unspecified; callers key by id. A projection of `listTodosByIds`, so the two
 * resolvers cannot drift; it exists to keep the titles IPC payload trimmed to
 * the two fields its consumers use.
 */
export function getTodoTitlesByIds(ids: string[]): { id: string; title: string }[] {
  return listTodosByIds(ids).map(({ id, title }) => ({ id, title }));
}

/**
 * Batch resolve, full rows — the day sheet's plan-entry join needs done state
 * alongside the title, and an entry may reference todos outside any listed
 * slice (another day, the backlog, already done). Deleted ids drop out rather
 * than throwing; order is unspecified.
 */
export function listTodosByIds(ids: string[]): Todo[] {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return [];
  const placeholders = unique.map(() => "?").join(",");
  const rows = getTodosDb()
    .prepare(`SELECT * FROM todos WHERE id IN (${placeholders})`)
    .all(...unique) as TodoRow[];
  return rows.map(rowToTodo);
}

export function listTodos(filter: TodoListFilter): Todo[] {
  const db = getTodosDb();
  let rows: TodoRow[];
  if (filter.date !== undefined) {
    assertDate(filter.date);
    rows = db
      .prepare(
        "SELECT * FROM todos WHERE date = ? ORDER BY sort_order, created_at"
      )
      .all(filter.date) as TodoRow[];
  } else if (filter.from !== undefined && filter.to !== undefined) {
    assertDate(filter.from, "from");
    assertDate(filter.to, "to");
    rows = db
      .prepare(
        "SELECT * FROM todos WHERE date BETWEEN ? AND ? ORDER BY date, sort_order, created_at"
      )
      .all(filter.from, filter.to) as TodoRow[];
  } else {
    throw new ValidationError("filter requires either date or from+to");
  }
  return rows.map(rowToTodo);
}

/**
 * The backlog: todos with no planned day (docs/design/todo-backlog.md). They
 * are invisible to every date query, so this is the only way to reach them.
 * Done rows are included — a todo can only be completed while parked by an
 * explicit `{ done: true, date: null }` patch, but if one exists the section
 * has to be able to show it.
 *
 * The bucket is split by project into lists that each renumber from 0
 * (reorderTodos below), so sort_order alone does not order it: the split comes
 * first. The result is the inbox, then each project's backlog in its own pull
 * order — one sequence a positional reader (`dyd todo backlog`, which addresses
 * rows as `b<n>`) can rely on not to reshuffle when one project is reordered.
 */
export function listBacklog(): Todo[] {
  const rows = getTodosDb()
    .prepare(
      `SELECT t.* FROM todos t
       LEFT JOIN projects p ON p.id = t.project_id
       WHERE t.date IS NULL
       ORDER BY t.project_id IS NOT NULL, p.title, t.project_id,
                t.sort_order, t.created_at`
    )
    .all() as TodoRow[];
  return rows.map(rowToTodo);
}

/**
 * The inbox: the undated todos filed under no project — unclassified capture
 * waiting for review (docs/design/projects-para.md). It is the todos page's
 * section; the rest of the backlog now belongs to the projects that own it and
 * is read per-project (projects.ts listProjectTodos).
 *
 * listBacklog above deliberately keeps its whole-warehouse meaning — the agent
 * API serves the secretary from it — which is why ordering the bucket's several
 * lists into one sequence is that query's job and not its callers'.
 */
export function listInbox(): Todo[] {
  const rows = getTodosDb()
    .prepare(
      `SELECT * FROM todos
       WHERE date IS NULL AND project_id IS NULL
       ORDER BY sort_order, created_at`
    )
    .all() as TodoRow[];
  return rows.map(rowToTodo);
}

/**
 * listInbox's count alone, for glances that only badge it. The steering glance
 * (`dyd projects`, the secretary's session load) reads this off
 * GET /api/projects/stats instead of pulling the whole backlog to count one
 * subset — the warehouse grows without bound, the badge does not.
 */
export function countInbox(): number {
  const { n } = getTodosDb()
    .prepare(
      "SELECT COUNT(*) AS n FROM todos WHERE date IS NULL AND project_id IS NULL"
    )
    .get() as { n: number };
  return n;
}

/** Open todos planned before `before` (exclusive) — the Overdue section. */
export function listOverdue(before: string): Todo[] {
  assertDate(before, "before");
  const rows = getTodosDb()
    .prepare(
      "SELECT * FROM todos WHERE done = 0 AND date < ? ORDER BY date, sort_order, created_at"
    )
    .all(before) as TodoRow[];
  return rows.map(rowToTodo);
}

export function createTodo(input: TodoCreateInput, ctx: WriteContext): Todo {
  const db = getTodosDb();
  const title = normalizeTitle(input.title);
  const note = normalizeNote(input.note);
  const date = input.date !== undefined ? normalizeDate(input.date) : contextDay(ctx);
  const id = nanoid();

  const row = db.transaction((): TodoRow => {
    const projectId = normalizeProjectId(db, input.projectId ?? null);
    db.prepare(
      `INSERT INTO todos (id, date, title, note, sort_order, source, project_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, date, title, note, nextSortOrder(db, date), ctx.source, projectId);

    // Re-read: done, created_at and updated_at come from SQL defaults, and the
    // journal snapshot must be the row as stored.
    const created = getRow(id);
    recordOp(db, ctx, {
      entity: "todo",
      entityId: id,
      op: "create",
      before: null,
      after: created,
    });
    return created;
  })();

  emitTodosChanged({ reason: "create", id });
  return rowToTodo(row);
}

// `emit: false` is for internal callers that fold this update into a larger
// operation with its own single todos:changed event (desk.ts un-park); every
// external entry point emits.
export function updateTodo(
  id: string,
  patch: TodoPatch,
  ctx: WriteContext,
  opts: { emit?: boolean } = {}
): Todo {
  const db = getTodosDb();

  const updated = db.transaction((): TodoRow => {
    const row = getRow(id);

    const title = patch.title !== undefined ? normalizeTitle(patch.title) : row.title;
    const note = patch.note !== undefined ? normalizeNote(patch.note) : row.note;
    let date = patch.date !== undefined ? normalizeDate(patch.date) : row.date;
    const projectId =
      patch.projectId !== undefined
        ? normalizeProjectId(db, patch.projectId)
        : row.project_id;
    if (patch.sortOrder !== undefined && !Number.isInteger(patch.sortOrder)) {
      throw new ValidationError("sortOrder must be an integer");
    }
    if (patch.done !== undefined && typeof patch.done !== "boolean") {
      throw new ValidationError("done must be a boolean");
    }

    const wasDone = row.done === 1;
    const done = patch.done ?? wasDone;
    // One clock read for the whole intent: completed_on and the un-park date
    // below describe the same completion event, so they must name the same day
    // even when the call straddles the 05:00 boundary.
    const day = contextDay(ctx);
    // completed_on tracks the day the todo was actually finished, independent
    // of its planned date; re-opening clears it.
    let completedOn = row.completed_on;
    if (done && !wasDone) completedOn = day;
    if (!done) completedOn = null;

    // Un-park: finishing a backlog todo means the work happened, and work
    // belongs to a day. An explicit date in the same patch wins, so a caller
    // can still park a completed todo deliberately.
    if (done && !wasDone && date === null && patch.date === undefined) {
      date = day;
    }

    // A todo that changes bucket appends to the end of its destination. Keeping
    // the old number would drop it into the middle of the other list — very
    // visible when pulling an item out of the backlog into today.
    //
    // What counts as a change of bucket — including why filing a dated todo
    // does not — lives in fields.ts, where it is testable without a connection.
    const moved = movedBucket(date, projectId, row);
    let sortOrder = patch.sortOrder ?? row.sort_order;
    if (patch.sortOrder === undefined && moved) {
      sortOrder = nextSortOrder(db, date);
    }

    db.prepare(
      `UPDATE todos
       SET title = ?, note = ?, date = ?, sort_order = ?, done = ?,
           completed_on = ?, project_id = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run(title, note, date, sortOrder, done ? 1 : 0, completedOn, projectId, id);

    // A todo steps off the desk the moment it can no longer be worked on there:
    // it is finished, or it has just been parked. Both drop membership in this
    // transaction, so no observer sees a done-but-on-desk state — nor a desk
    // member with no day to bank its time against, which is the un-park rule
    // (docs/design/todo-backlog.md) read from the other side.
    if ((done && !wasDone) || date === null) {
      db.prepare("DELETE FROM desk WHERE todo_id = ?").run(id);
    }

    // Journal last, after every write of the mutation has succeeded. The
    // re-read is required — updated_at is stamped in SQL — and a patch that
    // changed nothing is not an op (an empty diff would render as a lie in the
    // log).
    const after = getRow(id);
    if (rowChanged(row, after)) {
      recordOp(db, ctx, {
        entity: "todo",
        entityId: id,
        op: "update",
        before: row,
        after,
      });
    }
    return after;
  })();

  if (opts.emit !== false) emitTodosChanged({ reason: "update", id });
  return rowToTodo(updated);
}

export function deleteTodo(id: string, ctx: WriteContext): void {
  const db = getTodosDb();
  db.transaction(() => {
    const row = getRow(id);
    // Plan entries are swept by hand — and journaled — before the todo row
    // goes: ops append in that order, so rewind's reverse replay recreates the
    // todo before its entries. todo_sessions and desk rows cascade
    // (ON DELETE CASCADE) instead; they are accrual and membership, not intent.
    removePlanEntriesForTodo(db, id, ctx);
    db.prepare("DELETE FROM todos WHERE id = ?").run(id);
    recordOp(db, ctx, {
      entity: "todo",
      entityId: id,
      op: "delete",
      before: row,
      after: null,
    });
  })();
  emitTodosChanged({ reason: "delete", id });
}

/**
 * Rewrites sort_order for one date — or for the backlog (`null`).
 *
 * The undated bucket is shared by the inbox and every project backlog, and this
 * scopes only by date, so reordering one of those lists renumbers its own ids
 * and leaves the rest of the bucket alone. Values therefore repeat across the
 * bucket, so every read of it orders by the split before sort_order: listInbox
 * and listProjectTodos add a project predicate, and listBacklog — which does
 * read the bucket whole — groups by project first. What would not be harmless
 * is a repeat *within* one list, and updateTodo prevents that by re-appending
 * any todo whose project changes.
 */
export function reorderTodos(date: string | null, ids: string[]): void {
  if (date !== null) assertDate(date);
  const db = getTodosDb();
  // The date predicate scopes the rewrite, so ids from another bucket are
  // ignored rather than silently renumbered. `IS` is NULL-safe, so the backlog
  // needs no separate statement.
  const update = db.prepare(
    `UPDATE todos SET sort_order = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND date IS ?`
  );
  db.transaction(() => {
    ids.forEach((id, index) => update.run(index, id, date));
  })();
  emitTodosChanged({ reason: "reorder" });
}

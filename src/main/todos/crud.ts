import type Database from "better-sqlite3";
import { nanoid } from "nanoid";
import { getTodosDb } from "./db";
import { assertDate, kstToday } from "./date";
import { emitTodosChanged } from "./events";
import {
  NotFoundError,
  ValidationError,
  rowToTodo,
  type Todo,
  type TodoCreateInput,
  type TodoListFilter,
  type TodoPatch,
  type TodoRow,
  type TodoSource,
} from "./types";

const MAX_TITLE_LENGTH = 500;

function normalizeTitle(title: unknown): string {
  if (typeof title !== "string") {
    throw new ValidationError("title must be a string");
  }
  const trimmed = title.trim();
  if (trimmed.length === 0) {
    throw new ValidationError("title must not be empty");
  }
  if (trimmed.length > MAX_TITLE_LENGTH) {
    throw new ValidationError(`title must be at most ${MAX_TITLE_LENGTH} characters`);
  }
  return trimmed;
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
  if (date === null) return null;
  if (typeof date !== "string") {
    throw new ValidationError("date must be a yyyy-MM-dd string or null");
  }
  return assertDate(date);
}

// Appends to the end of a bucket. A NULL bind matches no row under `= ?`, so
// the backlog needs its own predicate or every parked todo would land on 0.
function nextSortOrder(db: Database.Database, date: string | null): number {
  const sql =
    date === null
      ? "SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM todos WHERE date IS NULL"
      : "SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM todos WHERE date = ?";
  const params = date === null ? [] : [date];
  const { next } = db.prepare(sql).get(...params) as { next: number };
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
 * the todos that were on the desk during it (docs/design/multi-pomo-todo.md).
 * Deleted todos are simply absent from the result (the caller shows a fallback),
 * so this never throws on an unknown id the way `getTodo` does. Order is
 * unspecified; callers key by id.
 */
export function getTodoTitlesByIds(ids: string[]): { id: string; title: string }[] {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return [];
  const placeholders = unique.map(() => "?").join(",");
  return getTodosDb()
    .prepare(`SELECT id, title FROM todos WHERE id IN (${placeholders})`)
    .all(...unique) as { id: string; title: string }[];
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
 */
export function listBacklog(): Todo[] {
  const rows = getTodosDb()
    .prepare("SELECT * FROM todos WHERE date IS NULL ORDER BY sort_order, created_at")
    .all() as TodoRow[];
  return rows.map(rowToTodo);
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

export function createTodo(input: TodoCreateInput, source: TodoSource): Todo {
  const db = getTodosDb();
  const title = normalizeTitle(input.title);
  const note = normalizeNote(input.note);
  const date = input.date !== undefined ? normalizeDate(input.date) : kstToday();
  const id = nanoid();

  db.prepare(
    `INSERT INTO todos (id, date, title, note, sort_order, source)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, date, title, note, nextSortOrder(db, date), source);

  emitTodosChanged({ reason: "create", id });
  return getTodo(id);
}

export function updateTodo(id: string, patch: TodoPatch): Todo {
  const db = getTodosDb();

  db.transaction(() => {
    const row = getRow(id);

    const title = patch.title !== undefined ? normalizeTitle(patch.title) : row.title;
    const note = patch.note !== undefined ? normalizeNote(patch.note) : row.note;
    let date = patch.date !== undefined ? normalizeDate(patch.date) : row.date;
    if (patch.sortOrder !== undefined && !Number.isInteger(patch.sortOrder)) {
      throw new ValidationError("sortOrder must be an integer");
    }
    if (patch.done !== undefined && typeof patch.done !== "boolean") {
      throw new ValidationError("done must be a boolean");
    }

    const wasDone = row.done === 1;
    const done = patch.done ?? wasDone;
    // completed_on tracks the day the todo was actually finished, independent
    // of its planned date; re-opening clears it.
    let completedOn = row.completed_on;
    if (done && !wasDone) completedOn = kstToday();
    if (!done) completedOn = null;

    // Un-park: finishing a backlog todo means the work happened, and work
    // belongs to a day. An explicit date in the same patch wins, so a caller
    // can still park a completed todo deliberately.
    if (done && !wasDone && date === null && patch.date === undefined) {
      date = kstToday();
    }

    // A todo that changes bucket appends to the end of its destination. Keeping
    // the old number would drop it into the middle of the other list — very
    // visible when pulling an item out of the backlog into today.
    let sortOrder = patch.sortOrder ?? row.sort_order;
    if (patch.sortOrder === undefined && date !== row.date) {
      sortOrder = nextSortOrder(db, date);
    }

    db.prepare(
      `UPDATE todos
       SET title = ?, note = ?, date = ?, sort_order = ?, done = ?,
           completed_on = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run(title, note, date, sortOrder, done ? 1 : 0, completedOn, id);

    // A todo steps off the desk the moment it can no longer be worked on there:
    // it is finished, or it has just been parked. Both drop membership in this
    // transaction, so no observer sees a done-but-on-desk state — nor a desk
    // member with no day to bank its time against, which is the un-park rule
    // (docs/design/todo-backlog.md) read from the other side.
    if ((done && !wasDone) || date === null) {
      db.prepare("DELETE FROM desk WHERE todo_id = ?").run(id);
    }
  })();

  emitTodosChanged({ reason: "update", id });
  return getTodo(id);
}

export function deleteTodo(id: string): void {
  getRow(id);
  // todo_sessions and desk rows both cascade (ON DELETE CASCADE).
  getTodosDb().prepare("DELETE FROM todos WHERE id = ?").run(id);
  emitTodosChanged({ reason: "delete", id });
}

/** Rewrites sort_order for one date — or for the backlog (`null`). */
export function reorderTodos(date: string | null, ids: string[]): void {
  if (date !== null) assertDate(date);
  const db = getTodosDb();
  // The date predicate scopes the rewrite, so ids from another bucket are
  // ignored rather than silently renumbered.
  const update = db.prepare(
    date === null
      ? `UPDATE todos SET sort_order = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND date IS NULL`
      : `UPDATE todos SET sort_order = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND date = ?`
  );
  db.transaction(() => {
    ids.forEach((id, index) => {
      if (date === null) update.run(index, id);
      else update.run(index, id, date);
    });
  })();
  emitTodosChanged({ reason: "reorder" });
}

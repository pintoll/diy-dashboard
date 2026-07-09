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
  const date = input.date !== undefined ? assertDate(input.date) : kstToday();
  const id = nanoid();

  const { next } = db
    .prepare(
      "SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM todos WHERE date = ?"
    )
    .get(date) as { next: number };
  db.prepare(
    `INSERT INTO todos (id, date, title, note, sort_order, source)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, date, title, note, next, source);

  emitTodosChanged({ reason: "create", id });
  return getTodo(id);
}

export function updateTodo(id: string, patch: TodoPatch): Todo {
  const db = getTodosDb();

  db.transaction(() => {
    const row = getRow(id);

    const title = patch.title !== undefined ? normalizeTitle(patch.title) : row.title;
    const note = patch.note !== undefined ? normalizeNote(patch.note) : row.note;
    const date = patch.date !== undefined ? assertDate(patch.date) : row.date;
    if (patch.sortOrder !== undefined && !Number.isInteger(patch.sortOrder)) {
      throw new ValidationError("sortOrder must be an integer");
    }
    if (patch.done !== undefined && typeof patch.done !== "boolean") {
      throw new ValidationError("done must be a boolean");
    }
    const sortOrder = patch.sortOrder ?? row.sort_order;

    const wasDone = row.done === 1;
    const done = patch.done ?? wasDone;
    // completed_on tracks the day the todo was actually finished, independent
    // of its planned date; re-opening clears it.
    let completedOn = row.completed_on;
    if (done && !wasDone) completedOn = kstToday();
    if (!done) completedOn = null;

    db.prepare(
      `UPDATE todos
       SET title = ?, note = ?, date = ?, sort_order = ?, done = ?,
           completed_on = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run(title, note, date, sortOrder, done ? 1 : 0, completedOn, id);

    // A finished todo cannot stay "Working...": clear the activation in the
    // same transaction so no observer sees a done-but-active state.
    if (done && !wasDone) {
      db.prepare(
        "UPDATE active_todo SET todo_id = NULL, activated_at = NULL WHERE todo_id = ?"
      ).run(id);
    }
  })();

  emitTodosChanged({ reason: "update", id });
  return getTodo(id);
}

export function deleteTodo(id: string): void {
  getRow(id);
  // todo_sessions rows cascade; an active_todo reference resolves to NULL.
  getTodosDb().prepare("DELETE FROM todos WHERE id = ?").run(id);
  emitTodosChanged({ reason: "delete", id });
}

/** Rewrites sort_order for one date from the given id order. */
export function reorderTodos(date: string, ids: string[]): void {
  assertDate(date);
  const db = getTodosDb();
  const update = db.prepare(
    `UPDATE todos SET sort_order = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND date = ?`
  );
  db.transaction(() => {
    ids.forEach((id, index) => update.run(index, id, date));
  })();
  emitTodosChanged({ reason: "reorder" });
}

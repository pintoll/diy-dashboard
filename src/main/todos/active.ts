import { getTodosDb } from "./db";
import { emitTodosChanged } from "./events";
import {
  NotFoundError,
  ValidationError,
  rowToTodo,
  type Todo,
  type TodoRow,
} from "./types";

// The single active_todo row in this database is the source of truth for the
// globally-active ("Working...") todo: the agent HTTP API must read and write
// it even when no renderer is alive. The renderer store is only a cache.

export function getActiveTodo(): Todo | null {
  const row = getTodosDb()
    .prepare(
      `SELECT t.* FROM active_todo a JOIN todos t ON t.id = a.todo_id
       WHERE a.id = 1`
    )
    .get() as TodoRow | undefined;
  return row ? rowToTodo(row) : null;
}

export function setActiveTodo(id: string | null): Todo | null {
  const db = getTodosDb();

  if (id === null) {
    db.prepare(
      "UPDATE active_todo SET todo_id = NULL, activated_at = NULL WHERE id = 1"
    ).run();
    emitTodosChanged({ reason: "active" });
    return null;
  }

  const row = db.prepare("SELECT * FROM todos WHERE id = ?").get(id) as
    | TodoRow
    | undefined;
  if (!row) throw new NotFoundError(`No todo with id "${id}"`);
  if (row.done === 1) {
    throw new ValidationError("Cannot activate a completed todo");
  }

  db.prepare(
    "UPDATE active_todo SET todo_id = ?, activated_at = ? WHERE id = 1"
  ).run(id, new Date().toISOString());
  emitTodosChanged({ reason: "active", id });
  return rowToTodo(row);
}

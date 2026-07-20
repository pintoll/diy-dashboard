import { getTodosDb } from "./db";
import { emitTodosChanged } from "./events";
import {
  NotFoundError,
  ValidationError,
  rowToTodo,
  type Todo,
  type TodoRow,
} from "./types";

// The "desk" is the set of todos currently receiving the running work clock
// (docs/design/multi-pomo-todo.md). It replaces the single-row `active_todo`:
// membership, not ownership, is what routes pomodoro time. These primitives are
// the source of truth even when no renderer is alive — the agent HTTP API reads
// and writes them directly. `joined_at` is retained per member so a future
// consumer can clamp a member's in-flight interval start.

export function getDesk(): Todo[] {
  const rows = getTodosDb()
    .prepare(
      `SELECT t.* FROM desk d JOIN todos t ON t.id = d.todo_id
       ORDER BY d.joined_at, t.created_at`
    )
    .all() as TodoRow[];
  return rows.map(rowToTodo);
}

function loadOpenTodo(id: string): TodoRow {
  const row = getTodosDb().prepare("SELECT * FROM todos WHERE id = ?").get(id) as
    | TodoRow
    | undefined;
  if (!row) throw new NotFoundError(`No todo with id "${id}"`);
  // A completed todo has stepped off the desk for good; it cannot rejoin.
  if (row.done === 1) throw new ValidationError("Cannot add a completed todo to the desk");
  return row;
}

export function addToDesk(id: string): Todo {
  const row = loadOpenTodo(id);
  const info = getTodosDb()
    .prepare("INSERT OR IGNORE INTO desk (todo_id, joined_at) VALUES (?, ?)")
    .run(id, new Date().toISOString());
  // Already on the desk: the INSERT was ignored, so nothing changed — don't emit.
  if (info.changes === 1) emitTodosChanged({ reason: "active", id });
  return rowToTodo(row);
}

export function removeFromDesk(id: string): void {
  const db = getTodosDb();
  // Symmetric with addToDesk: an id that is not a todo at all is a caller error
  // (-> 404), not a silently successful no-op. Removing a real todo that simply
  // is not on the desk stays a success, so the operation is still idempotent.
  const exists = db.prepare("SELECT 1 FROM todos WHERE id = ?").get(id);
  if (!exists) throw new NotFoundError(`No todo with id "${id}"`);
  const info = db.prepare("DELETE FROM desk WHERE todo_id = ?").run(id);
  // Not on the desk: nothing changed, so don't wake every listener. The store's
  // debounced refresh costs two IPC round trips plus an attribution re-sync.
  if (info.changes === 1) emitTodosChanged({ reason: "active", id });
}

export function clearDesk(): void {
  const info = getTodosDb().prepare("DELETE FROM desk").run();
  if (info.changes > 0) emitTodosChanged({ reason: "active" });
}

// --- Single-active compat (one release) -------------------------------------
// Until the desk UI + dyd land (phases 2-3), the app still speaks the single
// active-todo contract. `setActiveTodo` collapses the desk to just that todo;
// `getActiveTodo` reads the first (oldest) member. Both emit exactly once.

export function getActiveTodo(): Todo | null {
  return getDesk()[0] ?? null;
}

export function setActiveTodo(id: string | null): Todo | null {
  const db = getTodosDb();

  if (id === null) {
    const info = db.prepare("DELETE FROM desk").run();
    if (info.changes > 0) emitTodosChanged({ reason: "active" });
    return null;
  }

  const row = loadOpenTodo(id);
  db.transaction(() => {
    db.prepare("DELETE FROM desk").run();
    db.prepare("INSERT INTO desk (todo_id, joined_at) VALUES (?, ?)").run(
      id,
      new Date().toISOString()
    );
  })();
  emitTodosChanged({ reason: "active", id });
  return rowToTodo(row);
}

import { updateTodo } from "./crud";
import { contextDay } from "./date";
import { getTodosDb } from "./db";
import { emitTodosChanged } from "./events";
import {
  NotFoundError,
  ValidationError,
  rowToTodo,
  type Todo,
  type TodoRow,
  type WriteContext,
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

export function addToDesk(id: string, ctx: WriteContext): Todo {
  const db = getTodosDb();
  const row = loadOpenTodo(id);
  let current = rowToTodo(row);
  let changed = false;

  db.transaction(() => {
    // Un-park: a backlog todo joining the desk is about to accrue pomodoro
    // time, and time belongs to a day. Left dateless it would bank workedSec
    // while appearing in neither today's list, the today widget, nor `dyd`.
    // Delegated to updateTodo so the un-park IS a date move — same sort_order,
    // journaling, and whatever rules the date path grows later — with its emit
    // suppressed to keep this function's single event. The desk INSERT below
    // is membership, not todo data, and is not journaled.
    if (row.date === null) {
      current = updateTodo(id, { date: contextDay(ctx) }, ctx, { emit: false });
      changed = true;
    }
    const info = db
      .prepare("INSERT OR IGNORE INTO desk (todo_id, joined_at) VALUES (?, ?)")
      .run(id, new Date().toISOString());
    if (info.changes === 1) changed = true;
  })();

  // Already on the desk and already dated: nothing changed — don't emit.
  if (changed) emitTodosChanged({ reason: "active", id });
  return current;
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

export function setActiveTodo(id: string | null, ctx: WriteContext): Todo | null {
  const db = getTodosDb();

  if (id === null) {
    const info = db.prepare("DELETE FROM desk").run();
    if (info.changes > 0) emitTodosChanged({ reason: "active" });
    return null;
  }

  // Validate before the destructive clear, then delegate: addToDesk owns the
  // un-park rule and the single event, so the compat path cannot drift from it.
  // Clear and join share one transaction (better-sqlite3 nests via SAVEPOINT),
  // so a failed join cannot leave the desk empty with no event to announce it.
  loadOpenTodo(id);
  return db.transaction((): Todo => {
    db.prepare("DELETE FROM desk").run();
    return addToDesk(id, ctx);
  })();
}

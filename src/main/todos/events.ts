import { BrowserWindow } from "electron";
import type { TodosChangedPayload, TodosChangedReason } from "./types";

// Broadcast to every open window; the renderer subscribes via
// window.electronAPI.todos.onChanged. Every mutation in this folder emits
// through here, so IPC- and agent-HTTP-originated writes share one push path
// and the UI refreshes regardless of who wrote.

// While a batch (apply.ts) holds its outer transaction open, emits are
// buffered and broadcast only after commit — a push must announce committed
// state or nothing (the same rule plan.ts's delete-sweep comment states for
// the single-op case). On rollback the buffer is dropped with the writes it
// described.
let buffered: TodosChangedPayload[] | null = null;

function broadcast(payload: TodosChangedPayload): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue;
    // Every push announces state that has already committed (each emit site
    // fires after its transaction returns), so a failed send is a stale
    // window, not a failed write: it must not surface to the writer as a 500
    // for work that landed — which would invite a duplicate retry — and one
    // window dying between the check above and the send must not starve the
    // rest.
    try {
      win.webContents.send("todos:changed", payload);
    } catch (err) {
      console.error("[todos] todos:changed push failed:", err);
    }
  }
}

export function emitTodosChanged(payload: TodosChangedPayload): void {
  if (buffered !== null) {
    buffered.push(payload);
    return;
  }
  broadcast(payload);
}

/**
 * One payload per distinct reason, in first-seen order. Subscribers act on
 * `reason` alone — both stores debounce it into a full refresh — so a 100-op
 * batch has nothing to say beyond "todos changed, plan changed", and sending
 * it 100 times only floods IPC at the moment the UI wants to repaint. `id` is
 * dropped from a reason that covers several payloads: no single id describes
 * them, and a stale one would be worse than none.
 */
function coalesce(payloads: TodosChangedPayload[]): TodosChangedPayload[] {
  const byReason = new Map<TodosChangedReason, TodosChangedPayload>();
  for (const payload of payloads) {
    const seen = byReason.get(payload.reason);
    if (seen === undefined) byReason.set(payload.reason, payload);
    else if (seen.id !== undefined) byReason.set(payload.reason, { reason: payload.reason });
  }
  return [...byReason.values()];
}

/**
 * Runs `fn` — which must open AND commit the enclosing write transaction —
 * with emits buffered, then broadcasts them (coalesced) in order. If `fn`
 * throws, the buffer is discarded along with the rolled-back writes. A
 * re-entrant call joins the outer buffer rather than flushing early.
 */
export function withBufferedTodosChanged<T>(fn: () => T): T {
  if (buffered !== null) return fn();
  buffered = [];
  let toFlush: TodosChangedPayload[] = [];
  try {
    const result = fn();
    toFlush = buffered;
    return result;
  } finally {
    buffered = null;
    for (const payload of coalesce(toFlush)) broadcast(payload);
  }
}

import { BrowserWindow } from "electron";
import type { TodosChangedPayload } from "./types";

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
    if (!win.isDestroyed()) win.webContents.send("todos:changed", payload);
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
 * Runs `fn` — which must open AND commit the enclosing write transaction —
 * with emits buffered, then broadcasts them in order. If `fn` throws, the
 * buffer is discarded along with the rolled-back writes. A re-entrant call
 * joins the outer buffer rather than flushing early.
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
    for (const payload of toFlush) broadcast(payload);
  }
}

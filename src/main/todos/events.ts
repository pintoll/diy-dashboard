import { BrowserWindow } from "electron";
import type { TodosChangedPayload } from "./types";

// Broadcast to every open window; the renderer subscribes via
// window.electronAPI.todos.onChanged. Every mutation in this folder emits
// through here, so IPC- and agent-HTTP-originated writes share one push path
// and the UI refreshes regardless of who wrote.
export function emitTodosChanged(payload: TodosChangedPayload): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send("todos:changed", payload);
  }
}

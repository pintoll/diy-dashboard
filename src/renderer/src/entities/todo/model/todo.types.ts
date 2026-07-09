// The renderer-side names for the todo domain. These alias the ambient
// interfaces declared in `src/preload/electron-env.d.ts`, which is the IPC
// contract with the main process. Aliasing rather than re-declaring keeps a
// single definition of each shape: a change to the contract fails the build
// here instead of drifting silently.

export type Todo = TodoItem;
export type TodoInput = TodoCreateInput;
export type TodoUpdatePatch = TodoPatch;
export type TodoFilter = TodoListFilter;
export type TodoWorkInput = TodoRecordWorkInput;
export type TodoChangeReason = TodosChangedReason;
export type TodoChangePayload = TodosChangedPayload;

export type TodosApi = TodosAPI;

export const NO_BRIDGE_MESSAGE = "Todos are only available in the desktop app";

// Every call site guards, because `window.electronAPI` is optional: the
// renderer also boots in a plain browser during `electron-vite dev`.
export function requireTodosApi(): TodosApi {
  const api = window.electronAPI?.todos;
  if (!api) throw new Error(NO_BRIDGE_MESSAGE);
  return api;
}

// An IPC rejection arrives as "Error invoking remote method 'x': Error: <real>".
// Surface only the part the main process actually wrote.
export function todoErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const marker = raw.lastIndexOf("Error: ");
  return marker >= 0 ? raw.slice(marker + "Error: ".length) : raw;
}

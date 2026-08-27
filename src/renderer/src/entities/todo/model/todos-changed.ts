import type { TodoChangePayload } from "./todo.types";

// The one subscription shape over the todos:changed bridge, shared by the three
// read-through caches on todos.db (use-todo-store, use-plan-store,
// use-project-store). They differ only in which reasons concern them and what
// they do when one arrives; the mechanics — the optional bridge, the debounce
// that collapses a burst of writes into a single refresh — were the same three
// times, so a fix to them had to be applied three times.

const REFRESH_DEBOUNCE_MS = 50;

/**
 * Reasons owned by a layer above todo rows, each with a reader store of its
 * own: "plan"/"fold" (use-plan-store) and "project" (use-project-store). The
 * todo store ignores exactly these, so routing a new reason away from the day
 * lists is one edit here rather than a hardcoded list in another module.
 */
export const OTHER_LAYER_REASONS: ReadonlySet<string> = new Set([
  "plan",
  "fold",
  "project",
]);

/**
 * Calls `onChanged` once a debounce after any todos:changed event `concerns`
 * accepts. A no-op outside the desktop app, where there is no bridge: the
 * renderer also boots in a plain browser during `electron-vite dev`.
 */
export function subscribeTodosChanged(
  concerns: (payload: TodoChangePayload) => boolean,
  onChanged: () => void
): void {
  const bridge = window.electronAPI?.todos;
  if (!bridge) return;

  let timer: ReturnType<typeof setTimeout> | undefined;
  bridge.onChanged((payload) => {
    if (!concerns(payload)) return;
    clearTimeout(timer);
    timer = setTimeout(onChanged, REFRESH_DEBOUNCE_MS);
  });
}

import type { TodoChangePayload, TodoChangeReason } from "./todo.types";

// The one subscription shape over the todos:changed bridge, shared by every
// read-through cache on todos.db. They differ only in which reasons concern
// them and what they do when one arrives; the mechanics — the optional bridge,
// the debounce that collapses a burst of writes into a single refresh — were
// written out once per store, so a fix to them had to be applied that many
// times. createRefreshGate below does the same for the second half of the
// pattern: the mount count that decides whether a refresh is worth doing.
//
// use-todo-store is the exception with no gate: the day list is what the app
// opens on, so it stays subscribed for the session.

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

// A store this can gate: a read-through cache that knows whether it holds
// anything (`status`) and how to re-read (`refresh`).
type RefreshableStore = {
  getState: () => { status: string; refresh: () => Promise<void> };
};

/**
 * Subscribes a store to the reasons it cares about and returns its acquire
 * function: a surface calls it on mount and calls what it returns on unmount.
 *
 * The gate is the point. These subscriptions live for the renderer's lifetime,
 * so without a mount count a store that was read once keeps refetching on every
 * matching write for the rest of the session, with nothing on screen to receive
 * it. Going idle when the last reader leaves costs no staleness, because the
 * next `onAcquire` reads fresh — which is also why `onRelease` has to put the
 * store back to "idle" rather than leaving a warm cache nothing is refreshing.
 *
 * `onAcquire` runs on every mount, `onRelease` only when the last one leaves.
 */
export function createRefreshGate(
  store: RefreshableStore,
  reasons: readonly TodoChangeReason[],
  hooks: { onAcquire: () => void; onRelease: () => void }
): () => () => void {
  const concerns = new Set<string>(reasons);
  let mounts = 0;

  subscribeTodosChanged(
    (payload) => concerns.has(payload.reason),
    () => {
      if (mounts === 0) return;
      const { status, refresh } = store.getState();
      // Nothing loaded yet; the acquire in flight will read fresh.
      if (status === "idle") return;
      void refresh();
    }
  );

  return () => {
    mounts += 1;
    hooks.onAcquire();
    return () => {
      mounts -= 1;
      if (mounts > 0) return;
      hooks.onRelease();
    };
  };
}

// Anything that debounces a write to disk has one exit it cannot survive on its
// own: quitting. Closing the window hides it to the tray, so React never
// unmounts and a flush-on-unmount cleanup never runs — the app can go away with
// the last few hundred milliseconds of work still only in a timer.
//
// Main holds `before-quit` open and asks the renderer to land those writes.
// Register here to be part of that; the reply goes back once every registered
// flush has settled.

type Flusher = () => Promise<void> | void;

const flushers = new Set<Flusher>();
let unsubscribe: (() => void) | null = null;

/**
 * Starts answering main's flush request. Called once at app start rather than
 * from the first registration, because main waits for a reply either way — with
 * nothing listening it would sit through the whole timeout on every quit.
 */
export function initFlushOnQuit(): () => void {
  // Already bound — StrictMode calls the effect twice. The no-op cleanup is the
  // point: unbinding here would tear down the first binding and leave main
  // waiting out its timeout on every quit.
  if (unsubscribe !== null) return () => {};

  const api = typeof window === "undefined" ? undefined : window.electronAPI;
  if (!api?.onFlushPendingWrites) return () => {};

  const off = api.onFlushPendingWrites(() => {
    // allSettled, not all: one store failing to write must not strand the quit
    // waiting out the timeout while the others are already done.
    void Promise.allSettled(Array.from(flushers, (flush) => flush())).then(() =>
      api.flushComplete()
    );
  });

  unsubscribe = () => {
    off();
    unsubscribe = null;
  };
  return unsubscribe;
}

export function registerFlushOnQuit(flush: Flusher): () => void {
  flushers.add(flush);
  return () => {
    flushers.delete(flush);
  };
}

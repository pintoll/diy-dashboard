import { useMemo } from "react";
import {
  COALESCE_WINDOW_MS,
  amendEdit,
  applySplice,
  diffSplice,
  emptyHistory,
  pushEdit,
  redo as redoHistory,
  undo as undoHistory,
  type History,
  type TextEdit,
} from "@shared/text-history";
import { MAX_MEMO_BODY_CHARS } from "@shared/memo";
import { createWidgetStore } from "@/src/shared/lib/create-widget-store";

// The live buffer and its undo history live here; memos.db is the durable
// mirror. Keeping the renderer authoritative is what lets a held Ctrl+Z walk
// back instantly instead of waiting on an IPC round trip per step.
//
// `persist: false` on purpose — everything worth keeping is already in SQLite,
// and a second copy in localStorage would only be a copy that can disagree.

export type MemoStatus = "loading" | "ready" | "unavailable" | "error";

// Trailing debounce on the SQLite write. State is already in memory, so this
// only decides how often a keystroke reaches disk.
const WRITE_DEBOUNCE_MS = 400;

type MemoState = {
  body: string;
  history: History;
  snapshots: MemoSnapshotItem[];
  // Memos whose widget is gone. Empty until the recovery panel asks for them.
  orphans: MemoOrphanItem[];
  updatedAt: string | null;
  status: MemoStatus;
  error: string | null;
  // Caret to force onto the textarea after the body changed under the user
  // (undo, redo, snapshot restore). Null while they are simply typing.
  caret: number | null;
};

type MemoActions = {
  load: () => Promise<void>;
  edit: (next: string, options?: { isolate?: boolean }) => void;
  undo: () => void;
  redo: () => void;
  // Closes the coalescing group and flushes the pending write (blur, unmount).
  endGroup: () => void;
  // The same flush, awaitable: main waits on this before it lets a quit through.
  flush: () => Promise<void>;
  saveSnapshot: () => Promise<void>;
  restoreSnapshot: (snapshotId: string) => void;
  removeSnapshot: (snapshotId: string) => Promise<void>;
  loadOrphans: (liveIds: string[]) => Promise<void>;
  adoptOrphan: (orphanId: string) => Promise<void>;
  discardOrphan: (orphanId: string) => Promise<void>;
  caretApplied: () => void;
};

export type MemoStore = MemoState & MemoActions;

function memosApi(): MemosAPI | undefined {
  return typeof window === "undefined" ? undefined : window.electronAPI?.memos;
}

function message(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function useMemoStore(instanceId: string) {
  return useMemo(() => {
    const initialState: MemoStore = {
      body: "",
      history: emptyHistory(),
      snapshots: [],
      orphans: [],
      updatedAt: null,
      status: "loading",
      error: null,
      caret: null,

      load: async () => {},
      edit: () => {},
      undo: () => {},
      redo: () => {},
      endGroup: () => {},
      flush: async () => {},
      saveSnapshot: async () => {},
      restoreSnapshot: () => {},
      removeSnapshot: async () => {},
      loadOrphans: async () => {},
      adoptOrphan: async () => {},
      discardOrphan: async () => {},
      caretApplied: () => {},
    };

    return createWidgetStore<MemoStore>(
      instanceId,
      initialState,
      (set, get) => {
        // Coalescing state. Deliberately outside the store: growing an undo
        // step is not something the UI renders, and a keystroke should not
        // re-render the widget twice.
        let groupOpen = false;
        let lastEditAt = 0;

        let writeTimer: ReturnType<typeof setTimeout> | null = null;
        let queued: { body: string; edit: TextEdit } | null = null;

        // An undo fires commitEdit and then moveCursor, and nothing makes the
        // replies come back in that order. Only the newest write may report the
        // time, or the label can drift backwards to the earlier stamp.
        let writeToken = 0;
        const reportSaved = (token: number, updatedAt: string) => {
          if (token !== writeToken) return;
          set({ updatedAt, error: null });
        };

        const flushWrite = (): Promise<void> => {
          if (writeTimer) {
            clearTimeout(writeTimer);
            writeTimer = null;
          }
          const pending = queued;
          queued = null;
          const api = memosApi();
          if (!pending || !api) return Promise.resolve();

          const token = ++writeToken;
          return api
            .commitEdit({ id: instanceId, body: pending.body, edit: pending.edit })
            .then((result) => reportSaved(token, result.updatedAt))
            .catch((error) =>
              // Reported whatever its token: a failed write means this text is
              // not on disk, and a newer one landing does not change that.
              set({ error: message(error, "Failed to save the memo") })
            );
        };

        const persistCursor = (body: string, cursor: number) => {
          const token = ++writeToken;
          memosApi()
            ?.moveCursor({ id: instanceId, body, cursor })
            .then((result) => reportSaved(token, result.updatedAt))
            .catch((error) =>
              set({ error: message(error, "Failed to save the memo") })
            );
        };

        const queueWrite = (body: string, edit: TextEdit) => {
          // A new step must not overwrite the queued one — flush first so both
          // rows land. Re-sends of the same seq are the burst still growing,
          // and main upserts them.
          if (queued && queued.edit.seq !== edit.seq) flushWrite();
          queued = { body, edit };
          if (writeTimer) clearTimeout(writeTimer);
          writeTimer = setTimeout(flushWrite, WRITE_DEBOUNCE_MS);
        };

        return {
          ...initialState,

          load: async () => {
            const api = memosApi();
            if (!api) {
              set({
                status: "unavailable",
                error: "Memos are only available in the desktop app",
              });
              return;
            }
            try {
              const state = await api.load(instanceId);
              groupOpen = false;
              set({
                body: state.body,
                history: { edits: state.edits, cursor: state.cursor },
                snapshots: state.snapshots,
                updatedAt: state.updatedAt,
                status: "ready",
                error: null,
                caret: null,
              });
            } catch (error) {
              set({
                status: "error",
                error: message(error, "Failed to open the memo"),
              });
            }
          },

          edit: (next, options) => {
            const { body, history } = get();
            // Refused here rather than left for main to reject: main rejecting
            // it would leave the buffer holding text that no later write could
            // save either, since every one of them carries the whole body.
            if (next.length > MAX_MEMO_BODY_CHARS && next.length > body.length) {
              set({
                error: `Memo is full at ${MAX_MEMO_BODY_CHARS.toLocaleString()} characters — nothing was added`,
              });
              return;
            }
            const splice = diffSplice(body, next);
            if (!splice) return;

            const now = Date.now();
            // A paste or a cut is its own step even mid-burst: it is one act,
            // and undoing it should not also swallow the words around it.
            const isolate = options?.isolate === true;
            const continuing =
              groupOpen && !isolate && now - lastEditAt <= COALESCE_WINDOW_MS;
            const result =
              (continuing ? amendEdit(history, splice) : null) ??
              pushEdit(history, splice);

            groupOpen = !isolate;
            lastEditAt = now;
            set({ body: next, history: result.history, caret: null });
            queueWrite(next, result.edit);
          },

          undo: () => {
            const step = undoHistory(get().history);
            if (!step) return;
            // The open step has to be on disk before the cursor moves off it.
            void flushWrite();
            groupOpen = false;

            const body = applySplice(get().body, step.splice);
            set({ body, history: step.history, caret: step.caret });
            persistCursor(body, step.history.cursor);
          },

          redo: () => {
            const step = redoHistory(get().history);
            if (!step) return;
            void flushWrite();
            groupOpen = false;

            const body = applySplice(get().body, step.splice);
            set({ body, history: step.history, caret: step.caret });
            persistCursor(body, step.history.cursor);
          },

          endGroup: () => {
            groupOpen = false;
            void flushWrite();
          },

          flush: () => {
            groupOpen = false;
            return flushWrite();
          },

          saveSnapshot: async () => {
            const api = memosApi();
            if (!api) return;
            // Snapshot and body should not disagree about what "now" was.
            groupOpen = false;
            void flushWrite();
            try {
              const snapshot = await api.snapshot.create(instanceId, get().body);
              set({ snapshots: [snapshot, ...get().snapshots], error: null });
            } catch (error) {
              set({ error: message(error, "Failed to save the snapshot") });
            }
          },

          restoreSnapshot: (snapshotId) => {
            const snapshot = get().snapshots.find((s) => s.id === snapshotId);
            if (snapshot === undefined) return;
            // Restoring is an ordinary edit, so Ctrl+Z undoes the restore too.
            get().edit(snapshot.body, { isolate: true });
            set({ caret: snapshot.body.length });
          },

          removeSnapshot: async (snapshotId) => {
            const api = memosApi();
            if (!api) return;
            try {
              await api.snapshot.remove(snapshotId);
              set({
                snapshots: get().snapshots.filter((s) => s.id !== snapshotId),
                error: null,
              });
            } catch (error) {
              set({ error: message(error, "Failed to delete the snapshot") });
            }
          },

          loadOrphans: async (liveIds) => {
            const api = memosApi();
            if (!api) return;
            try {
              set({ orphans: await api.listOrphans(liveIds), error: null });
            } catch (error) {
              set({ error: message(error, "Failed to look for lost memos") });
            }
          },

          adoptOrphan: async (orphanId) => {
            const api = memosApi();
            if (!api) return;
            // A keystroke still sitting in the debounce would make this memo
            // non-empty on disk a moment after main checked that it was.
            groupOpen = false;
            await flushWrite();

            const { body, history, snapshots } = get();
            if (body !== "" || history.edits.length > 0 || snapshots.length > 0) {
              set({
                error: "Only an empty memo can take over a lost memo's text",
              });
              return;
            }

            try {
              const state = await api.adopt({
                targetId: instanceId,
                sourceId: orphanId,
              });
              set({
                body: state.body,
                history: { edits: state.edits, cursor: state.cursor },
                snapshots: state.snapshots,
                orphans: get().orphans.filter((o) => o.id !== orphanId),
                updatedAt: state.updatedAt,
                error: null,
                caret: state.body.length,
              });
            } catch (error) {
              set({ error: message(error, "Failed to recover that memo") });
            }
          },

          discardOrphan: async (orphanId) => {
            const api = memosApi();
            if (!api) return;
            try {
              await api.remove(orphanId);
              set({
                orphans: get().orphans.filter((o) => o.id !== orphanId),
                error: null,
              });
            } catch (error) {
              set({ error: message(error, "Failed to delete that memo") });
            }
          },

          caretApplied: () => set({ caret: null }),
        };
      },
      { name: "memo-pad", persist: false }
    );
  }, [instanceId]);
}

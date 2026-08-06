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
  saveSnapshot: () => Promise<void>;
  restoreSnapshot: (snapshotId: string) => void;
  removeSnapshot: (snapshotId: string) => Promise<void>;
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
      updatedAt: null,
      status: "loading",
      error: null,
      caret: null,

      load: async () => {},
      edit: () => {},
      undo: () => {},
      redo: () => {},
      endGroup: () => {},
      saveSnapshot: async () => {},
      restoreSnapshot: () => {},
      removeSnapshot: async () => {},
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

        const flushWrite = () => {
          if (writeTimer) {
            clearTimeout(writeTimer);
            writeTimer = null;
          }
          const pending = queued;
          queued = null;
          if (!pending) return;

          memosApi()
            ?.commitEdit({ id: instanceId, body: pending.body, edit: pending.edit })
            .then((result) => set({ updatedAt: result.updatedAt, error: null }))
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
            flushWrite();
            groupOpen = false;

            const body = applySplice(get().body, step.splice);
            set({ body, history: step.history, caret: step.caret });
            memosApi()
              ?.moveCursor({ id: instanceId, body, cursor: step.history.cursor })
              .then((result) => set({ updatedAt: result.updatedAt, error: null }))
              .catch((error) =>
                set({ error: message(error, "Failed to save the memo") })
              );
          },

          redo: () => {
            const step = redoHistory(get().history);
            if (!step) return;
            flushWrite();
            groupOpen = false;

            const body = applySplice(get().body, step.splice);
            set({ body, history: step.history, caret: step.caret });
            memosApi()
              ?.moveCursor({ id: instanceId, body, cursor: step.history.cursor })
              .then((result) => set({ updatedAt: result.updatedAt, error: null }))
              .catch((error) =>
                set({ error: message(error, "Failed to save the memo") })
              );
          },

          endGroup: () => {
            groupOpen = false;
            flushWrite();
          },

          saveSnapshot: async () => {
            const api = memosApi();
            if (!api) return;
            // Snapshot and body should not disagree about what "now" was.
            groupOpen = false;
            flushWrite();
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

          caretApplied: () => set({ caret: null }),
        };
      },
      { name: "memo-pad", persist: false }
    );
  }, [instanceId]);
}

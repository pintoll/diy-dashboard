import { create } from "zustand";
import {
  createRefreshGate,
  todoErrorMessage,
  type Todo,
} from "@/src/entities/todo";
import {
  NO_BRIDGE_MESSAGE,
  requireProjectsApi,
  type ProjectDoc,
} from "./project.types";

type Status = "idle" | "loading" | "ready" | "error";

// Long enough that a sentence lands as one journal op rather than a dozen.
// Every real save writes a full before/after row snapshot into `ops`
// (project-docs.ts updateProjectDoc), so this debounce is what keeps the day
// log readable — the memo pad's 400 ms would spam it.
const DOC_WRITE_DEBOUNCE_MS = 1000;

// What one selection shows. `selectedId === null` is the inbox, which has no
// docs and reads its todos from useTodoStore, so only `status` applies to it.
type ProjectDetailStore = {
  selectedId: string | null;
  docs: ProjectDoc[];
  activeDocId: string | null;
  // The unsaved body of the doc being typed into. Held here rather than in the
  // editor so `refresh` can see that a write is in flight and leave that doc
  // alone; the editor is free to unmount and come back mid-edit.
  draft: { docId: string; body: string } | null;
  backlog: Todo[];
  scheduled: Todo[];
  completed: Todo[];
  status: Status;
  error: string | null;

  select: (projectId: string | null) => Promise<void>;
  refresh: () => Promise<void>;
  setActiveDoc: (docId: string) => Promise<void>;
  editDoc: (body: string) => void;
  flush: () => Promise<void>;
};

const EMPTY = {
  docs: [] as ProjectDoc[],
  activeDocId: null,
  draft: null,
  backlog: [] as Todo[],
  scheduled: [] as Todo[],
  completed: [] as Todo[],
};

// The selected project's slice: its docs, its three todo lists, and the
// in-flight body of whichever doc is being typed into. Separate from
// useProjectStore because that one is the whole app's project list (the todo
// picker reads it) while this one exists only while the projects page is open.
export const useProjectDetailStore = create<ProjectDetailStore>((set, get) => {
  // Write state, deliberately outside the store: a keystroke should not
  // re-render anything twice, and a pending timer is not something the UI draws.
  let writeTimer: ReturnType<typeof setTimeout> | null = null;
  let queued: { docId: string; body: string } | null = null;

  // Nothing orders IPC replies, and a stale one landing last would report an
  // updatedAt older than the text on screen.
  let writeToken = 0;

  const flushWrite = (): Promise<void> => {
    if (writeTimer) {
      clearTimeout(writeTimer);
      writeTimer = null;
    }
    const pending = queued;
    queued = null;
    if (!pending) return Promise.resolve();

    const token = ++writeToken;

    // The draft is kept on failure — the text is not on disk, so dropping it
    // would silently discard what the user typed — and the body goes back on
    // the queue with it. Without that, `queued` is already null here and every
    // later flush (tab switch, pane unmount, quit) is a no-op over an empty
    // queue, so the kept draft never reaches disk at all. Anything typed since
    // is newer and wins.
    const recover = (error: unknown) => {
      if (queued === null) queued = pending;
      set({ error: todoErrorMessage(error) });
    };

    // requireProjectsApi throws rather than rejecting, and this runs from a
    // bare timer callback.
    let write: Promise<ProjectDoc>;
    try {
      write = requireProjectsApi().docs.update(pending.docId, { body: pending.body });
    } catch (error) {
      recover(error);
      return Promise.resolve();
    }

    return write
      .then((doc) => {
        // The broadcast this write triggers refreshes the list anyway; what
        // matters here is releasing the draft so that refresh may adopt the
        // stored body again.
        //
        // Not while a newer body for the same doc is queued, though: queueWrite
        // does not bump the token, so this reply still looks current while the
        // text on screen has moved past it. Adopting it there would rewrite the
        // textarea back to what was sent a keystroke ago.
        if (token !== writeToken || queued?.docId === doc.id) return;
        set((state) => ({
          docs: state.docs.map((d) => (d.id === doc.id ? doc : d)),
          draft: state.draft?.docId === doc.id ? null : state.draft,
        }));
      })
      .catch(recover);
  };

  const queueWrite = (docId: string, body: string) => {
    // A different doc means the tab changed mid-debounce; land the old one
    // before starting the new timer or its text is lost.
    if (queued && queued.docId !== docId) void flushWrite();
    queued = { docId, body };
    if (writeTimer) clearTimeout(writeTimer);
    writeTimer = setTimeout(() => void flushWrite(), DOC_WRITE_DEBOUNCE_MS);
  };

  return {
    selectedId: null,
    ...EMPTY,
    status: "idle",
    error: null,

    select: async (projectId) => {
      if (get().selectedId === projectId) return;
      // Leaving a doc mid-edit must not lose it, and the pane it belongs to is
      // about to be replaced.
      await get().flush();
      set({ selectedId: projectId, ...EMPTY, error: null });
      await get().refresh();
    },

    refresh: async () => {
      const { selectedId } = get();
      if (!window.electronAPI?.projects) {
        set({ status: "error", error: NO_BRIDGE_MESSAGE });
        return;
      }
      // The inbox pane draws from useTodoStore; there is nothing to fetch.
      if (selectedId === null) {
        set({ status: "ready", error: null });
        return;
      }

      if (get().status !== "ready") set({ status: "loading" });
      try {
        const api = requireProjectsApi();
        const [docs, todos] = await Promise.all([
          api.docs.list(selectedId),
          api.todos(selectedId),
        ]);
        // The selection may have moved while those were in flight.
        if (get().selectedId !== selectedId) return;
        set((state) => ({
          // Doc writes broadcast "project", so this store's own save comes back
          // as a refetch. Adopting the stored body then would overwrite text
          // the user is still typing, so the doc holding the draft keeps it.
          docs: docs.map((doc) =>
            state.draft?.docId === doc.id
              ? { ...doc, body: state.draft.body }
              : doc
          ),
          activeDocId:
            state.activeDocId !== null && docs.some((d) => d.id === state.activeDocId)
              ? state.activeDocId
              : (docs[0]?.id ?? null),
          backlog: todos.backlog,
          scheduled: todos.scheduled,
          completed: todos.completed,
          status: "ready",
          error: null,
        }));
      } catch (error) {
        set({ status: "error", error: todoErrorMessage(error) });
      }
    },

    setActiveDoc: async (docId) => {
      if (get().activeDocId === docId) return;
      await get().flush();
      set({ activeDocId: docId });
    },

    editDoc: (body) => {
      const { activeDocId } = get();
      if (activeDocId === null) return;
      set((state) => ({
        draft: { docId: activeDocId, body },
        docs: state.docs.map((d) => (d.id === activeDocId ? { ...d, body } : d)),
        error: null,
      }));
      queueWrite(activeDocId, body);
    },

    flush: flushWrite,
  };
});

// "project" carries doc writes and the project rows themselves; the todo
// reasons move the three lists — including "reorder", which is the backlog's
// whole point, and "work", which changes the worked time a row shows.
//
// The page acquires on mount and releases on unmount, which is what keeps
// change events from refetching a pane nobody is looking at.
export const acquireProjectDetail = createRefreshGate(
  useProjectDetailStore,
  ["project", "create", "update", "delete", "reorder", "work"],
  {
    onAcquire: () => void useProjectDetailStore.getState().refresh(),
    onRelease: () => {
      // Whatever is half-typed belongs on disk before the pane stops listening.
      void useProjectDetailStore.getState().flush();
      // The selection goes with it: the page is opened to review and review
      // starts at the inbox (ProjectsPage), which only holds if leaving
      // actually drops what was selected. Clearing the lists in the same breath
      // keeps a reopen from painting the old project's rows before the first
      // refresh.
      useProjectDetailStore.setState({
        selectedId: null,
        ...EMPTY,
        status: "idle",
        error: null,
      });
    },
  }
);

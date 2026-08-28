import { create } from "zustand";
import { createRefreshGate, todoErrorMessage } from "@/src/entities/todo";
import {
  NO_BRIDGE_MESSAGE,
  requireProjectsApi,
  type ProjectTimeIndex,
} from "./project.types";

type Status = "idle" | "loading" | "ready" | "error";

type ProjectTimeStore = {
  index: ProjectTimeIndex;
  status: Status;
  error: string | null;

  ensureLoaded: () => Promise<void>;
  refresh: () => Promise<void>;
};

/**
 * The empty index. Shared frozen instance so a surface rendering before the
 * first read lands gets a stable reference and no memo churn.
 */
export const EMPTY_PROJECT_TIME: ProjectTimeIndex = Object.freeze({
  time: [],
  todoProject: {},
});

// A second read-through cache over todos.db, sibling to use-project-store,
// deliberately not folded into it: only the focus-analytics page wants the
// whole session ledger merged, and the projects page and every todo picker
// would otherwise pay for a full `todo_sessions` scan on each refresh.
//
// The payload is kept exactly as main sent it. Shaping it into rows needs the
// session log too, so it belongs in the page's pure lib where it can be tested,
// not in a store.
export const useProjectTimeStore = create<ProjectTimeStore>((set, get) => ({
  index: EMPTY_PROJECT_TIME,
  status: "idle",
  error: null,

  // "error" retries for the same reason use-project-store does: every other
  // trigger is a todos:changed broadcast, so a transient first failure would
  // otherwise leave the card empty for the rest of the session.
  ensureLoaded: async () => {
    const { status } = get();
    if (status !== "idle" && status !== "error") return;
    await get().refresh();
  },

  refresh: async () => {
    if (!window.electronAPI?.projects) {
      set({ status: "error", error: NO_BRIDGE_MESSAGE });
      return;
    }
    if (get().status === "idle") set({ status: "loading" });
    try {
      set({
        index: await requireProjectsApi().time(),
        status: "ready",
        error: null,
      });
    } catch (error) {
      set({ status: "error", error: todoErrorMessage(error) });
    }
  },
}));

// Rides the todos change bridge like every other todos.db cache. "work" is the
// reason that matters - it is the one that banks a new ledger interval - but
// filing, unfiling or deleting a todo moves seconds between buckets too, and
// deleting a project detaches its todos. "reorder" is deliberately absent: no
// ordering change can move time that is already banked.
export const acquireProjectTime = createRefreshGate(
  useProjectTimeStore,
  ["project", "create", "update", "delete", "work"],
  {
    onAcquire: () => void useProjectTimeStore.getState().ensureLoaded(),
    onRelease: () => useProjectTimeStore.setState({ status: "idle" }),
  }
);

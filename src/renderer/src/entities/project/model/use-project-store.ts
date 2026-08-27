import { create } from "zustand";
import { subscribeTodosChanged, todoErrorMessage } from "@/src/entities/todo";
import {
  NO_BRIDGE_MESSAGE,
  requireProjectsApi,
  type Project,
} from "./project.types";

type Status = "idle" | "loading" | "ready" | "error";

type ProjectStore = {
  projects: Project[];
  status: Status;
  error: string | null;

  ensureLoaded: () => Promise<void>;
  refresh: () => Promise<void>;
};

// Like the todo store, a read-through cache over SQLite and nothing more —
// never persisted, because a localStorage copy would diverge from the database.
// Mutations live elsewhere; every write path broadcasts todos:changed with
// reason "project", and the subscription below refreshes this cache, so the UI
// converges no matter who wrote (user, page, or the agent HTTP API).
export const useProjectStore = create<ProjectStore>((set, get) => ({
  projects: [],
  status: "idle",
  error: null,

  // "error" retries too: the only other trigger is a "project" broadcast, which
  // takes a project write succeeding elsewhere, so without this a transient
  // failure on the first load would leave the picker empty for good
  // (use-plan-store carries the same guard).
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
      set({ projects: await requireProjectsApi().list(), status: "ready", error: null });
    } catch (error) {
      set({ status: "error", error: todoErrorMessage(error) });
    }
  },
}));

// Projects ride the todos change bridge rather than a channel of their own:
// both live in todos.db and one broadcast keeps them in step. Only "project"
// writes concern this store.
subscribeTodosChanged(
  (payload) => payload.reason === "project",
  () => {
    const { status, refresh } = useProjectStore.getState();
    // Nothing has been loaded yet; the first ensureLoaded will read fresh.
    if (status === "idle") return;
    void refresh();
  }
);

import { create } from "zustand";
import { todoErrorMessage } from "@/src/entities/todo";
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

  ensureLoaded: async () => {
    if (get().status !== "idle") return;
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

const REFRESH_DEBOUNCE_MS = 50;

// Projects ride the todos change bridge rather than a channel of their own:
// both live in todos.db and one broadcast keeps them in step. Only "project"
// writes concern this store.
const bridge = window.electronAPI?.todos;
if (bridge) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  bridge.onChanged((payload) => {
    if (payload.reason !== "project") return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      const { status, refresh } = useProjectStore.getState();
      // Nothing has been loaded yet; the first ensureLoaded will read fresh.
      if (status === "idle") return;
      void refresh();
    }, REFRESH_DEBOUNCE_MS);
  });
}

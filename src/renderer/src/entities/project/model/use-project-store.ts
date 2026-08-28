import { create } from "zustand";
import { createRefreshGate, todoErrorMessage } from "@/src/entities/todo";
import {
  NO_BRIDGE_MESSAGE,
  requireProjectsApi,
  type Project,
  type ProjectStats,
} from "./project.types";

type Status = "idle" | "loading" | "ready" | "error";

type ProjectStore = {
  projects: Project[];
  // Progress and last-activity, keyed by project id. Read through `statsOf`
  // rather than directly: main omits projects it has no rows for.
  stats: Record<string, ProjectStats>;
  status: Status;
  error: string | null;

  ensureLoaded: () => Promise<void>;
  refresh: () => Promise<void>;
};

// What a project with nothing filed under it looks like. Shared instance: it is
// frozen and every caller reads the same never-changing zeros.
const EMPTY_STATS: ProjectStats = Object.freeze({
  projectId: "",
  total: 0,
  done: 0,
  openBacklog: 0,
  workedSec: 0,
  lastActivityDay: null,
  nextAction: null,
});

/** A project's rollup, or zeros when it has no todos and no notes yet. */
export function statsOf(
  stats: Record<string, ProjectStats>,
  projectId: string
): ProjectStats {
  return stats[projectId] ?? EMPTY_STATS;
}

// Like the todo store, a read-through cache over SQLite and nothing more —
// never persisted, because a localStorage copy would diverge from the database.
// Mutations live elsewhere; every write path broadcasts todos:changed, and the
// subscription below refreshes this cache, so the UI converges no matter who
// wrote (user, page, or the agent HTTP API).
export const useProjectStore = create<ProjectStore>((set, get) => ({
  projects: [],
  stats: {},
  status: "idle",
  error: null,

  // "error" retries too: every other trigger is a todos:changed broadcast,
  // which takes a write succeeding elsewhere, so without this a transient
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
      const api = requireProjectsApi();
      const [projects, stats] = await Promise.all([api.list(), api.stats()]);
      set({
        projects,
        stats: Object.fromEntries(stats.map((s) => [s.projectId, s])),
        status: "ready",
        error: null,
      });
    } catch (error) {
      set({ status: "error", error: todoErrorMessage(error) });
    }
  },
}));

// Projects ride the todos change bridge rather than a channel of their own:
// both live in todos.db and one broadcast keeps them in step.
//
// "project" covers the rows themselves. The todo reasons are here for `stats`,
// which is mostly a rollup *of todos*: finishing one, filing one, or banking
// pomodoro time against one all move a project's progress and its last-activity
// day without touching a single projects row. "reorder" is in the list for
// `nextAction` alone — reordering a project's backlog moves a different todo to
// the head without changing a single number. Only "active" cannot.
//
// Every surface that shows projects acquires — the projects page, the widget,
// and each todo picker — so the list stays warm exactly while something is
// reading it.
export const acquireProjects = createRefreshGate(
  useProjectStore,
  ["project", "create", "update", "delete", "reorder", "work"],
  {
    onAcquire: () => void useProjectStore.getState().ensureLoaded(),
    onRelease: () => useProjectStore.setState({ status: "idle" }),
  }
);

import { create } from "zustand";
import { today } from "@shared/day";
import {
  NO_BRIDGE_MESSAGE,
  todoErrorMessage,
  type PlanEntry,
  type Todo,
} from "./todo.types";

type Status = "idle" | "loading" | "ready" | "error";

type PlanStore = {
  // The day sheet is today-only; the rollover interval below advances this.
  day: string;
  // Lived order: main sorts with comparePlanStart (05:00 first, small hours
  // last), and this cache preserves it.
  entries: PlanEntry[];
  // Every todo the entries reference, full rows — an entry may point at a todo
  // outside any listed slice (another day, the backlog, already done).
  todosById: Record<string, Todo>;
  // resolveYesterday(): the last pre-today day with records after the last
  // fold; null = fully folded. Non-null shows the "yesterday unfolded" hint.
  yesterday: string | null;
  status: Status;
  error: string | null;

  ensureLoaded: () => Promise<void>;
  refresh: () => Promise<void>;
};

// Like useTodoStore, a read-through cache over IPC and nothing more: plan
// entries live in SQLite, mutations broadcast `todos:changed`, and the
// subscription below reconverges this cache no matter who wrote — the widget,
// the agent HTTP API, or (later) the assistant.
export const usePlanStore = create<PlanStore>((set, get) => ({
  day: today(),
  entries: [],
  todosById: {},
  yesterday: null,
  status: "idle",
  error: null,

  ensureLoaded: async () => {
    if (get().status !== "idle") return;
    await get().refresh();
  },

  refresh: async () => {
    const api = window.electronAPI?.todos;
    if (!api) {
      set({ status: "error", error: NO_BRIDGE_MESSAGE });
      return;
    }

    if (get().status === "idle") set({ status: "loading" });
    try {
      const entries = await api.plan.list(get().day);
      const [todos, yesterday] = await Promise.all([
        api.byIds([...new Set(entries.map((e) => e.todoId))]),
        api.yesterday(),
      ]);
      set({
        entries,
        todosById: Object.fromEntries(todos.map((t) => [t.id, t])),
        yesterday,
        status: "ready",
        error: null,
      });
    } catch (error) {
      set({ status: "error", error: todoErrorMessage(error) });
    }
  },
}));

const REFRESH_DEBOUNCE_MS = 50;

// Reasons that can change what the sheet shows: "plan"/"fold" are its own
// domain, "update"/"delete" change joined titles and done state, and "work"
// can surface a new "yesterday" through the resolver's session leg. Todo
// create/reorder/active cannot touch a rendered line.
const REFRESH_REASONS = new Set(["plan", "fold", "update", "delete", "work"]);

const bridge = window.electronAPI?.todos;
if (bridge) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  bridge.onChanged((payload) => {
    if (!REFRESH_REASONS.has(payload.reason)) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      // Before the first load there is nothing on screen to reconverge.
      const { status, refresh } = usePlanStore.getState();
      if (status !== "idle") void refresh();
    }, REFRESH_DEBOUNCE_MS);
  });
}

// Day rollover: at the 05:00 boundary the sheet flips to the new (blank) day.
// Same one-clock-at-module-scope shape as use-todo-store.
const DAY_CHECK_INTERVAL_MS = 60_000;
setInterval(() => {
  const day = today();
  if (usePlanStore.getState().day === day) return;
  usePlanStore.setState({ day });
  const { status, refresh } = usePlanStore.getState();
  if (status !== "idle") void refresh();
}, DAY_CHECK_INTERVAL_MS);

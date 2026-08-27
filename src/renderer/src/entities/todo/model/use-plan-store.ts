import { create } from "zustand";
import { today } from "@shared/day";
import {
  NO_BRIDGE_MESSAGE,
  todoErrorMessage,
  type PlanEntry,
  type Todo,
} from "./todo.types";
import { createRefreshGate } from "./todos-changed";
import { useTodoStore } from "./use-todo-store";

type Status = "idle" | "loading" | "ready" | "error";

type PlanStore = {
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
  entries: [],
  todosById: {},
  yesterday: null,
  status: "idle",
  error: null,

  // "error" retries too: refresh is otherwise event- and rollover-driven, so
  // without this a failed first load could never recover by remounting.
  ensureLoaded: async () => {
    const { status } = get();
    if (status !== "idle" && status !== "error") return;
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
      // The sheet is today-only, and "today" is read at call time rather than
      // cached: a refresh landing after the 05:00 rollover fetches the new day
      // even before any rollover clock has ticked.
      const entries = await api.plan.list(today());
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
      // Entries are kept: the sheet stays rendered (with an inline error note)
      // instead of vanishing behind a transient refresh failure.
      set({ status: "error", error: todoErrorMessage(error) });
    }
  },
}));

// Reasons that can change what the sheet shows: "plan"/"fold" are its own
// domain, "update"/"delete" change joined titles and done state, and "work"
// can surface a new "yesterday" through the resolver's session leg. Todo
// create/reorder/active cannot touch a rendered line.
//
// Sheets acquire on mount and release on unmount; createRefreshGate holds the
// count and the reasoning behind it.
export const acquirePlanSheet = createRefreshGate(
  usePlanStore,
  ["plan", "fold", "update", "delete", "work"],
  {
    onAcquire: () => void usePlanStore.getState().ensureLoaded(),
    onRelease: () => usePlanStore.setState({ status: "idle" }),
  }
);

// Day rollover: at the 05:00 boundary the sheet flips to the new (blank) day.
// Follows use-todo-store's currentDay clock instead of running a second
// interval, so this store and the add-line todo picker (fed by useTodoStore)
// can never disagree about which day is "today".
useTodoStore.subscribe((state, prev) => {
  if (state.currentDay === prev.currentDay) return;
  const { status, refresh } = usePlanStore.getState();
  if (status !== "idle") void refresh();
});

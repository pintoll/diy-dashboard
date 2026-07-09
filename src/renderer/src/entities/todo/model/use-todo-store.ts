import { create } from "zustand";
import { addDays, kstToday, weekOf } from "./todo-date";
import {
  NO_BRIDGE_MESSAGE,
  todoErrorMessage,
  type Todo,
  type TodosApi,
} from "./todo.types";

type Status = "idle" | "loading" | "ready" | "error";

type DaySlice = {
  todos: Todo[];
  weekTodos: Todo[];
  overdue: Todo[];
};

type TodoStore = DaySlice & {
  selectedDate: string;
  activeTodoId: string | null;
  activeTodo: Todo | null;
  status: Status;
  error: string | null;

  ensureLoaded: () => Promise<void>;
  refresh: () => Promise<void>;
  setDate: (date: string) => Promise<void>;
};

async function fetchDay(api: TodosApi, date: string): Promise<DaySlice> {
  const week = weekOf(date);
  const [todos, weekTodos, overdue] = await Promise.all([
    api.list({ date }),
    api.list({ from: week[0], to: week[6] }),
    // Overdue is always relative to today, not the browsed date: it is only
    // rendered on the today view.
    api.overdue(kstToday()),
  ]);
  return { todos, weekTodos, overdue };
}

// Todos live in SQLite, so this store is a read-through cache and nothing
// more. It is deliberately not persisted: a localStorage copy would diverge
// from the database and would render stale before the first IPC read returned.
//
// Mutations live in `features/manage-todo` (and in the agent HTTP API on the
// main side). Every mutation path broadcasts `todos:changed`, and the
// subscription below refreshes this cache, so the UI converges no matter who
// wrote — user, widget, page, or external agent.
export const useTodoStore = create<TodoStore>((set, get) => ({
  todos: [],
  weekTodos: [],
  overdue: [],

  selectedDate: kstToday(),
  activeTodoId: null,
  activeTodo: null,
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
      const [day, active] = await Promise.all([
        fetchDay(api, get().selectedDate),
        api.active.get(),
      ]);
      set({
        ...day,
        activeTodo: active,
        activeTodoId: active?.id ?? null,
        status: "ready",
        error: null,
      });
    } catch (error) {
      set({ status: "error", error: todoErrorMessage(error) });
    }
  },

  setDate: async (date: string) => {
    const api = window.electronAPI?.todos;
    if (!api) {
      set({ selectedDate: date, status: "error", error: NO_BRIDGE_MESSAGE });
      return;
    }

    set({ selectedDate: date, error: null });
    try {
      set(await fetchDay(api, date));
    } catch (error) {
      set({ status: "error", error: todoErrorMessage(error) });
    }
  },
}));

export function shiftSelectedDate(days: number): Promise<void> {
  const { selectedDate, setDate } = useTodoStore.getState();
  return setDate(addDays(selectedDate, days));
}

// Module-scope bootstrap, so the active-todo pointer is loaded and kept fresh
// from the first import onward — the pomodoro store snapshots activeTodoId
// synchronously at session end and must see it even when no todo UI has ever
// mounted (status still "idle").
const REFRESH_DEBOUNCE_MS = 50;

const bridge = window.electronAPI?.todos;
if (bridge) {
  const syncActive = () =>
    bridge.active
      .get()
      .then((todo) =>
        useTodoStore.setState({
          activeTodo: todo,
          activeTodoId: todo?.id ?? null,
        })
      )
      .catch(() => {});

  void syncActive();

  let timer: ReturnType<typeof setTimeout> | undefined;
  bridge.onChanged(() => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const { status, refresh } = useTodoStore.getState();
      // Before the first list load there is nothing to refresh; keep only the
      // active pointer in sync.
      if (status === "idle") void syncActive();
      else void refresh();
    }, REFRESH_DEBOUNCE_MS);
  });
}

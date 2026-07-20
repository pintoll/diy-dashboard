import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useFocusModeStore } from "@/src/entities/focus-mode";
import { kstToday, useTodoStore } from "@/src/entities/todo";
import { AddTodoForm, SortableTodoList, TodoRow } from "@/src/features/manage-todo/client";
import { cn } from "@/src/shared/lib/utils";

export type TodoTodayConfig = Record<string, never>;

// The desk banner sits in a `shrink-0` box above the scrolling list, so every
// line it renders is a line the list loses. Uncapped, a six-member desk at the
// widget's minimum grid height squeezed the list to nothing and pushed the add
// form out of view. Two plus a count keeps the height bounded.
const DESK_BANNER_LIMIT = 2;

export function TodoTodayClient() {
  const status = useTodoStore((s) => s.status);
  const error = useTodoStore((s) => s.error);
  const todos = useTodoStore((s) => s.todos);
  const overdue = useTodoStore((s) => s.overdue);
  const selectedDate = useTodoStore((s) => s.selectedDate);
  const desk = useTodoStore((s) => s.desk);
  const setDate = useTodoStore((s) => s.setDate);
  const sessionActive = useFocusModeStore((s) => s.sessionActive);

  // The store's selectedDate is shared with the /todos page (routes are
  // exclusive, so the two never render at once). Snap back to today on mount
  // and again when the day rolls over, so this widget is always "today".
  useEffect(() => {
    const syncToday = () => {
      const today = kstToday();
      if (useTodoStore.getState().selectedDate !== today) void setDate(today);
    };
    syncToday();
    void useTodoStore.getState().ensureLoaded();
    const timer = setInterval(syncToday, 60_000);
    return () => clearInterval(timer);
  }, [setDate]);

  if (status === "error") {
    return (
      <p className="flex h-full items-center justify-center px-4 text-center text-xs text-muted-foreground">
        {error}
      </p>
    );
  }

  const openCount = todos.filter((t) => !t.done).length;

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-2">
      {desk.length > 0 && (
        <div className="flex shrink-0 items-start gap-2 rounded-md border border-primary/30 bg-primary/10 px-2.5 py-1.5">
          <span className="relative mt-1 flex size-2 shrink-0">
            {sessionActive && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
            )}
            <span
              className={cn(
                "relative inline-flex size-2 rounded-full",
                sessionActive ? "bg-primary" : "bg-muted-foreground"
              )}
            />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[9px] uppercase tracking-wide text-muted-foreground">
              {sessionActive ? "Working" : "Up next"}
              {desk.length > 1 && ` · ${desk.length}`}
            </p>
            {desk.slice(0, DESK_BANNER_LIMIT).map((todo) => (
              <p key={todo.id} className="truncate text-sm font-medium">
                {todo.title}
              </p>
            ))}
            {desk.length > DESK_BANNER_LIMIT && (
              <p className="text-[10px] text-muted-foreground">
                +{desk.length - DESK_BANNER_LIMIT} more
              </p>
            )}
          </div>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
        {overdue.length > 0 && (
          <>
            <p className="px-2 text-[9px] font-medium uppercase tracking-wide text-destructive">
              Overdue · {overdue.length}
            </p>
            {overdue.map((todo) => (
              <TodoRow key={todo.id} todo={todo} showDate />
            ))}
            <p className="px-2 pt-1 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
              Today
            </p>
          </>
        )}
        {todos.length === 0 && overdue.length === 0 && status === "ready" && (
          <p className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
            Nothing planned today.
          </p>
        )}
        <SortableTodoList todos={todos} date={selectedDate} />
      </div>

      <div className="shrink-0">
        <AddTodoForm date={selectedDate} />
      </div>

      <div className="flex shrink-0 items-center justify-between gap-2">
        <span className="text-[10px] text-muted-foreground">
          {openCount === 0 ? "All clear" : `${openCount} open`}
        </span>
        <Link
          to="/todos"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          All todos
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}

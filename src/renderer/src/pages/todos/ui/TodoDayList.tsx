import { ArrowDown, ArrowUp } from "lucide-react";
import { requireTodosApi, useTodoStore } from "@/src/entities/todo";
import { AddTodoForm, TodoRow } from "@/src/features/manage-todo/client";
import { Button } from "@/src/shared/ui/button";

// The selected day's list with manual ordering (drag-and-drop deferred).
export function TodoDayList() {
  const todos = useTodoStore((s) => s.todos);
  const selectedDate = useTodoStore((s) => s.selectedDate);

  const move = (index: number, delta: number) => {
    const ids = todos.map((t) => t.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    requireTodosApi()
      .reorder(selectedDate, ids)
      .catch((error) => console.warn("todo reorder failed:", error));
  };

  return (
    <section className="flex flex-col gap-1">
      {todos.length === 0 && (
        <p className="px-2 py-4 text-center text-sm text-muted-foreground">
          Nothing planned for this day.
        </p>
      )}
      {todos.map((todo, index) => (
        <div key={todo.id} className="group/order flex items-center gap-0.5">
          <div className="flex-1">
            <TodoRow todo={todo} />
          </div>
          <div className="flex flex-col opacity-0 transition-opacity group-hover/order:opacity-100">
            <Button
              variant="ghost"
              size="icon-xs"
              className="h-4"
              onClick={() => move(index, -1)}
              disabled={index === 0}
              aria-label="Move up"
            >
              <ArrowUp />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              className="h-4"
              onClick={() => move(index, 1)}
              disabled={index === todos.length - 1}
              aria-label="Move down"
            >
              <ArrowDown />
            </Button>
          </div>
        </div>
      ))}
      <div className="mt-2 px-2">
        <AddTodoForm date={selectedDate} />
      </div>
    </section>
  );
}

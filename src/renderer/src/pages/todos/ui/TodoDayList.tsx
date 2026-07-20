import { useTodoStore } from "@/src/entities/todo";
import { AddTodoForm, SortableTodoList } from "@/src/features/manage-todo/client";

// The selected day's list, reorderable by dragging each row's grip handle.
export function TodoDayList() {
  const todos = useTodoStore((s) => s.todos);
  const selectedDate = useTodoStore((s) => s.selectedDate);

  return (
    <section className="flex flex-col gap-1">
      {todos.length === 0 && (
        <p className="px-2 py-4 text-center text-sm text-muted-foreground">
          Nothing planned for this day.
        </p>
      )}
      <SortableTodoList todos={todos} date={selectedDate} />
      <div className="mt-2 px-2">
        <AddTodoForm date={selectedDate} />
      </div>
    </section>
  );
}

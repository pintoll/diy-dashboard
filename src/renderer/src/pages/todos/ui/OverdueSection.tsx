import { useTodoStore } from "@/src/entities/todo";
import { TodoRow } from "@/src/features/manage-todo/client";

// Open todos planned for past days. They keep their original date — this
// section is how they carry over into today without rewriting history.
export function OverdueSection() {
  const overdue = useTodoStore((s) => s.overdue);
  if (overdue.length === 0) return null;

  return (
    <section className="flex flex-col gap-1">
      <h3 className="px-2 text-xs font-medium uppercase tracking-wide text-destructive">
        Overdue · {overdue.length}
      </h3>
      {overdue.map((todo) => (
        <TodoRow key={todo.id} todo={todo} showDate />
      ))}
    </section>
  );
}

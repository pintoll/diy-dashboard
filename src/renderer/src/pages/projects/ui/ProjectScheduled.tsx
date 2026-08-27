import { useProjectDetailStore } from "@/src/entities/project";
import { TodoRow } from "@/src/features/manage-todo/client";

// Already pulled onto a day. Read-only on purpose: this is context, so that a
// todo does not vanish from its project the moment it is scheduled. The day it
// names is still the only place it is worked.
export function ProjectScheduled() {
  const scheduled = useProjectDetailStore((s) => s.scheduled);
  if (scheduled.length === 0) return null;

  return (
    <section className="flex flex-col gap-1">
      <h2 className="px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Scheduled · {scheduled.length}
      </h2>
      {scheduled.map((todo) => (
        <TodoRow key={todo.id} todo={todo} showDate />
      ))}
    </section>
  );
}

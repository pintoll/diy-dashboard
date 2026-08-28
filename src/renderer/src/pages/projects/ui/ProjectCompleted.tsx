import { useState } from "react";
import { useProjectDetailStore } from "@/src/entities/project";
import { TodoRow } from "@/src/features/manage-todo/client";
import { SectionToggle } from "@/src/shared/ui/section-header";

// What the project has finished, newest first. Folded by default — it is the
// record that makes an archived project worth keeping, not a working list.
export function ProjectCompleted() {
  const completed = useProjectDetailStore((s) => s.completed);
  const [open, setOpen] = useState(false);
  if (completed.length === 0) return null;

  return (
    <section className="flex flex-col gap-1 border-t border-border pt-3">
      <SectionToggle open={open} onToggle={() => setOpen((value) => !value)}>
        Completed · {completed.length}
      </SectionToggle>
      {open &&
        completed.map((todo) => <TodoRow key={todo.id} todo={todo} showDate />)}
    </section>
  );
}

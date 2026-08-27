import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useProjectDetailStore } from "@/src/entities/project";
import { TodoRow } from "@/src/features/manage-todo/client";

// What the project has finished, newest first. Folded by default — it is the
// record that makes an archived project worth keeping, not a working list.
export function ProjectCompleted() {
  const completed = useProjectDetailStore((s) => s.completed);
  const [open, setOpen] = useState(false);
  if (completed.length === 0) return null;

  return (
    <section className="flex flex-col gap-1 border-t border-border pt-3">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-1 px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground"
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown className="size-3.5" />
        ) : (
          <ChevronRight className="size-3.5" />
        )}
        Completed · {completed.length}
      </button>
      {open &&
        completed.map((todo) => <TodoRow key={todo.id} todo={todo} showDate />)}
    </section>
  );
}

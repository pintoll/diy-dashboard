import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useTodoStore } from "@/src/entities/todo";
import { AddTodoForm, SortableTodoList } from "@/src/features/manage-todo/client";

// Todos with no planned day (docs/design/todo-backlog.md). The mirror image of
// Overdue: that section is debt, this one is inventory, and keeping them apart
// is what stops "someday" items from bleeding the urgency out of the red list.
//
// Collapsed by default, and the count in the header is deliberate — a warehouse
// with no visible size becomes a black hole.
export function BacklogSection() {
  const backlog = useTodoStore((s) => s.backlog);
  const selectedDate = useTodoStore((s) => s.selectedDate);
  const [open, setOpen] = useState(false);

  return (
    <section className="flex flex-col gap-1 border-t border-border pt-4">
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
        Backlog · {backlog.length}
      </button>

      {open && (
        <div className="mt-1 flex flex-col gap-1">
          {backlog.length === 0 && (
            <p className="px-2 py-3 text-center text-sm text-muted-foreground">
              Nothing parked. Things with no deadline live here.
            </p>
          )}
          {/* Rows pull into the browsed day, not always today, so the section
              works the same whichever date is open above it. */}
          <SortableTodoList todos={backlog} date={null} pullTo={selectedDate} />
          <div className="mt-2 px-2">
            <AddTodoForm date={null} placeholder="Add to backlog..." />
          </div>
        </div>
      )}
    </section>
  );
}

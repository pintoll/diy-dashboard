import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useTodoStore } from "@/src/entities/todo";
import { AddTodoForm, SortableTodoList } from "@/src/features/manage-todo/client";

// The inbox: captured with no planned day and filed under no project
// (docs/design/projects-para.md). The mirror image of Overdue — that section is
// debt, this one is unsorted intake — and what a project's backlog is not: work
// that already belongs somewhere lives with its project, not here.
//
// Collapsed by default, and the count in the header is deliberate: an intake
// bin with no visible size becomes a black hole.
export function InboxSection() {
  const inbox = useTodoStore((s) => s.inbox);
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
        Inbox · {inbox.length}
      </button>

      {open && (
        <div className="mt-1 flex flex-col gap-1">
          {inbox.length === 0 && (
            <p className="px-2 py-3 text-center text-sm text-muted-foreground">
              Inbox zero. Unfiled captures land here.
            </p>
          )}
          {/* Rows pull into the browsed day, not always today, so the section
              works the same whichever date is open above it. */}
          <SortableTodoList todos={inbox} date={null} pullTo={selectedDate} />
          <div className="mt-2 px-2">
            <AddTodoForm date={null} placeholder="Add to inbox..." />
          </div>
        </div>
      )}
    </section>
  );
}

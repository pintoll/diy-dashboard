import { useState } from "react";
import { Bot, CheckCircle2, Circle, Pencil, Play, Square, Timer } from "lucide-react";
import {
  formatShortDate,
  requireTodosApi,
  useTodoStore,
  type Todo,
} from "@/src/entities/todo";
import { Button } from "@/src/shared/ui/button";
import { cn } from "@/src/shared/lib/utils";
import { formatWorkedSec } from "../lib/format";
import { EditTodoDialog } from "./EditTodoDialog";

type Props = {
  todo: Todo;
  // Overdue rows show the day they were planned for.
  showDate?: boolean;
  // The widget hides edit affordances to stay compact; the page shows them.
  compact?: boolean;
};

// Errors from row actions are not surfaced inline: the todos:changed push
// refreshes the store either way, so the row simply snaps back to the truth.
function run(action: Promise<unknown>): void {
  action.catch((error) => console.warn("todo action failed:", error));
}

export function TodoRow({ todo, showDate = false, compact = false }: Props) {
  const activeTodoId = useTodoStore((s) => s.activeTodoId);
  const [editing, setEditing] = useState(false);
  const isActive = activeTodoId === todo.id;

  const toggleDone = () =>
    run(requireTodosApi().update(todo.id, { done: !todo.done }));
  const toggleActive = () =>
    run(requireTodosApi().active.set(isActive ? null : todo.id));

  return (
    <div
      className={cn(
        "group flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors",
        isActive ? "bg-primary/10" : "hover:bg-accent/50"
      )}
    >
      <button
        type="button"
        onClick={toggleDone}
        className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
        aria-label={todo.done ? "Mark as not done" : "Mark as done"}
      >
        {todo.done ? (
          <CheckCircle2 className="size-4 text-primary" />
        ) : (
          <Circle className="size-4" />
        )}
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "truncate text-sm",
              todo.done && "text-muted-foreground line-through"
            )}
            title={todo.note ?? undefined}
          >
            {todo.title}
          </span>
          {todo.source === "agent" && (
            <Bot className="size-3 shrink-0 text-muted-foreground" aria-label="Added by agent" />
          )}
        </div>
        {(showDate || todo.workedSec > 0) && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {showDate && <span>{formatShortDate(todo.date)}</span>}
            {todo.workedSec > 0 && (
              <span className="inline-flex items-center gap-0.5">
                <Timer className="size-3" />
                {formatWorkedSec(todo.workedSec)}
              </span>
            )}
          </div>
        )}
      </div>

      {!todo.done && (
        <Button
          variant={isActive ? "secondary" : "ghost"}
          size="icon-xs"
          onClick={toggleActive}
          className={cn(
            "shrink-0",
            !isActive && "opacity-0 transition-opacity group-hover:opacity-100"
          )}
          aria-label={isActive ? "Deactivate" : "Set as active"}
          title={isActive ? "Deactivate" : "Set as active"}
        >
          {isActive ? <Square /> : <Play />}
        </Button>
      )}

      {!compact && (
        <>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => setEditing(true)}
            className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
            aria-label="Edit todo"
          >
            <Pencil />
          </Button>
          <EditTodoDialog todo={todo} open={editing} onOpenChange={setEditing} />
        </>
      )}
    </div>
  );
}

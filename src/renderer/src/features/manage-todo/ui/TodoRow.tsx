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
};

// Errors from row actions are not surfaced inline: the todos:changed push
// refreshes the store either way, so the row simply snaps back to the truth.
function run(action: Promise<unknown>): void {
  action.catch((error) => console.warn("todo action failed:", error));
}

export function TodoRow({ todo, showDate = false }: Props) {
  // On the desk = receiving the running work clock. Several rows can be on the
  // desk at once (docs/design/multi-pomo-todo.md).
  const onDesk = useTodoStore((s) => s.desk.some((t) => t.id === todo.id));
  const [editing, setEditing] = useState(false);

  const toggleDone = () =>
    run(requireTodosApi().update(todo.id, { done: !todo.done }));
  const toggleDesk = () => {
    const api = requireTodosApi();
    run(onDesk ? api.desk.remove(todo.id) : api.desk.add(todo.id));
  };

  return (
    <div
      className={cn(
        "group flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors",
        onDesk ? "bg-primary/10" : "hover:bg-accent/50"
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
          <button
            type="button"
            onClick={() => setEditing(true)}
            className={cn(
              "cursor-pointer truncate text-left text-sm underline-offset-2 hover:underline",
              todo.done && "text-muted-foreground line-through"
            )}
            title={todo.note ?? undefined}
          >
            {todo.title}
          </button>
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
          variant={onDesk ? "secondary" : "ghost"}
          size="icon-xs"
          onClick={toggleDesk}
          className={cn(
            "shrink-0",
            !onDesk && "opacity-0 transition-opacity group-hover:opacity-100"
          )}
          aria-label={onDesk ? "Remove from desk" : "Add to desk"}
          title={onDesk ? "Remove from desk" : "Add to desk"}
        >
          {onDesk ? <Square /> : <Play />}
        </Button>
      )}

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
    </div>
  );
}

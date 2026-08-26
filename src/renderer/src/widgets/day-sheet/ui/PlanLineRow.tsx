import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Circle, X } from "lucide-react";
import { requireTodosApi } from "@/src/entities/todo";
import { Button } from "@/src/shared/ui/button";
import { cn } from "@/src/shared/lib/utils";
import { formatTimeRange, parseTimeRange } from "../lib/plan-time-input";
import type { SheetLine } from "../lib/sheet-lines";

type Props = {
  line: SheetLine;
  // The line being lived right now (isNowInRange).
  current: boolean;
};

// Errors from row actions are not surfaced inline: the todos:changed push
// refreshes the plan store either way, so the row simply snaps back to truth.
function run(action: Promise<unknown>): void {
  action.catch((error) => console.warn("plan action failed:", error));
}

export function PlanLineRow({ line, current }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [invalid, setInvalid] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const openEditor = () => {
    setDraft(formatTimeRange(line.start, line.end));
    setInvalid(false);
    setEditing(true);
  };

  // False when the draft does not parse; the caller decides whether that
  // keeps the editor open (Enter) or closes it without saving (blur).
  const commit = (): boolean => {
    const range = parseTimeRange(draft);
    if (range === null) return false;
    if (range.start !== line.start || range.end !== line.end) {
      run(requireTodosApi().plan.update(line.entryId, range));
    }
    setEditing(false);
    return true;
  };

  // The sheet's checkbox writes the real todo's done state: lines reference
  // real todos, so checking is recording (assistant-architecture.md).
  const toggleDone = () =>
    run(requireTodosApi().update(line.todoId, { done: !line.done }));

  return (
    <div
      className={cn(
        "group flex items-center gap-2 rounded-md px-2 py-1 transition-colors",
        current ? "bg-primary/10" : "hover:bg-accent/50"
      )}
    >
      <button
        type="button"
        onClick={toggleDone}
        disabled={line.missing}
        className="shrink-0 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
        aria-label={line.done ? "Mark as not done" : "Mark as done"}
      >
        {line.done ? (
          <CheckCircle2 className="size-4 text-primary" />
        ) : (
          <Circle className="size-4" />
        )}
      </button>

      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setInvalid(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !commit()) setInvalid(true);
            if (e.key === "Escape") setEditing(false);
          }}
          // Clicking away commits like Enter — Escape is the cancel path. An
          // unparseable draft is dropped rather than trapping focus.
          onBlur={() => {
            if (!commit()) setEditing(false);
          }}
          className={cn(
            "w-[6.75rem] shrink-0 rounded border bg-transparent px-1 py-0.5 text-xs tabular-nums outline-none",
            invalid
              ? "border-destructive ring-1 ring-destructive"
              : "border-input focus-visible:border-ring"
          )}
          aria-label="Edit time range"
          aria-invalid={invalid}
        />
      ) : (
        <button
          type="button"
          onClick={openEditor}
          className="shrink-0 text-xs tabular-nums text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
          title="Change time"
        >
          {formatTimeRange(line.start, line.end)}
        </button>
      )}

      <span
        className={cn(
          "min-w-0 flex-1 truncate text-sm",
          (line.done || line.missing) && "text-muted-foreground",
          line.done && "line-through",
          line.missing && "italic"
        )}
        title={line.title}
      >
        {line.title}
      </span>

      <Button
        variant="ghost"
        size="icon-xs"
        onClick={() => run(requireTodosApi().plan.remove(line.entryId))}
        className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
        aria-label="Remove line"
        title="Remove line"
      >
        <X />
      </Button>
    </div>
  );
}

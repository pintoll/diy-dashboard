import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { GripVertical } from "lucide-react";
import { requireTodosApi, type Todo } from "@/src/entities/todo";
import { cn } from "@/src/shared/lib/utils";
import { TodoRow } from "./TodoRow";

type Props = {
  todos: Todo[];
  // Reordering is scoped to a single day, so every todo here must share this
  // date. Overdue lists span dates and must not use this component.
  date: string;
};

// Reorders `todos` to match `ids`. Todos missing from `ids` (added by another
// window or the agent API mid-drag) keep their relative order at the end.
function applyOrder(todos: Todo[], ids: string[]): Todo[] {
  const rank = new Map(ids.map((id, index) => [id, index]));
  return [...todos].sort(
    (a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity)
  );
}

function sameOrder(todos: Todo[], ids: string[]): boolean {
  return todos.length === ids.length && todos.every((t, i) => t.id === ids[i]);
}

// A day's todos, reorderable by dragging the grip handle. Renders rows only:
// empty and loading states belong to the caller.
export function SortableTodoList({ todos, date }: Props) {
  // The todo store is a read-through cache of SQLite, so a reorder only shows
  // up after the todos:changed round trip. `pending` holds the order the user
  // is looking at until the database catches up, keeping the drag smooth.
  const [pending, setPending] = useState<string[] | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());

  const items = pending ? applyOrder(todos, pending) : todos;

  useEffect(() => {
    if (pending && sameOrder(todos, pending)) setPending(null);
  }, [todos, pending]);

  const commit = (ids: string[]) => {
    setPending(ids);
    requireTodosApi()
      .reorder(date, ids)
      .catch((error) => console.warn("todo reorder failed:", error));
  };

  const startDrag = (event: DragEvent, id: string) => {
    setDraggingId(id);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", id);
    // Drag the whole row, not the grip handle it started from.
    const row = rowRefs.current.get(id);
    if (row) event.dataTransfer.setDragImage(row, 16, row.offsetHeight / 2);
  };

  // Live reflow: the list rearranges as the cursor passes each row, so the drop
  // is just a release. Nothing is written until the drag ends.
  const dragOver = (index: number) => {
    if (!draggingId) return;
    const ids = items.map((t) => t.id);
    const from = ids.indexOf(draggingId);
    if (from === -1 || from === index) return;
    ids.splice(index, 0, ids.splice(from, 1)[0]);
    setPending(ids);
  };

  // Runs from onDrop, and from onDragEnd for releases outside any row. Both
  // fire for a normal drop, so this must be idempotent.
  const finishDrag = () => {
    if (!draggingId) return;
    setDraggingId(null);
    const ids = items.map((t) => t.id);
    if (!sameOrder(todos, ids)) commit(ids);
  };

  // Keyboard parity for the drag handle.
  const keyMove = (event: KeyboardEvent, index: number) => {
    const delta = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
    if (delta === 0) return;
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    event.preventDefault();
    const ids = items.map((t) => t.id);
    ids.splice(target, 0, ids.splice(index, 1)[0]);
    commit(ids);
  };

  return (
    <>
      {items.map((todo, index) => (
        <div
          key={todo.id}
          ref={(el) => {
            if (el) rowRefs.current.set(todo.id, el);
            else rowRefs.current.delete(todo.id);
          }}
          onDragEnter={() => dragOver(index)}
          // Without both of these the drop counts as rejected: Chromium then
          // plays a snap-back animation and only fires dragend once it ends,
          // stalling the write behind it.
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
          }}
          onDrop={(event) => {
            event.preventDefault();
            finishDrag();
          }}
          className={cn(
            // py/-my cancel out visually, but stretch the drop target across
            // the list's row gap so releasing between two rows still counts.
            "group/order flex items-center gap-0.5 -my-0.5 py-0.5",
            draggingId === todo.id && "opacity-40"
          )}
        >
          <button
            type="button"
            draggable
            onDragStart={(event) => startDrag(event, todo.id)}
            onDragEnd={finishDrag}
            onKeyDown={(event) => keyMove(event, index)}
            className="shrink-0 cursor-grab text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover/order:opacity-100 active:cursor-grabbing"
            aria-label={`Reorder ${todo.title}`}
            title="Drag to reorder"
          >
            <GripVertical className="size-4" />
          </button>
          <div className="min-w-0 flex-1">
            <TodoRow todo={todo} />
          </div>
        </div>
      ))}
    </>
  );
}

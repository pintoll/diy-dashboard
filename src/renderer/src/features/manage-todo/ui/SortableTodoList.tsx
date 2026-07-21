import { useEffect, useState, type KeyboardEvent } from "react";
import { GripVertical } from "lucide-react";
import { requireTodosApi, type Todo } from "@/src/entities/todo";
import { cn } from "@/src/shared/lib/utils";
import { applyOrder, moveItem, orderSettled } from "../lib/reorder-geometry";
import { useDragReorder } from "../lib/use-drag-reorder";
import { TodoRow } from "./TodoRow";

type Props = {
  todos: Todo[];
  // Reordering is scoped to one bucket — a single day, or the backlog (`null`)
  // — so every todo here must share this date. Overdue lists span dates and
  // must not use this component.
  date: string | null;
  // Backlog rows only; forwarded to each row's one-click pull button.
  pullTo?: string;
};

// One bucket's todos, reorderable by dragging the grip handle. Renders rows
// only: empty and loading states belong to the caller.
export function SortableTodoList({ todos, date, pullTo }: Props) {
  // The todo store is a read-through cache of SQLite, so a reorder only shows
  // up after the todos:changed round trip. `pending` holds the order the user
  // is looking at until the database catches up.
  const [pending, setPending] = useState<string[] | null>(null);
  // A drag freezes the rendered todos, objects and all. Membership alone is not
  // enough: a row grows a second line the moment its worked time crosses zero,
  // which the pomodoro store can do mid-drag, and that would invalidate every
  // measurement the drag is steering by.
  const [drag, setDrag] = useState<{ items: Todo[]; draggingId: string } | null>(null);

  const items = drag ? drag.items : pending ? applyOrder(todos, pending) : todos;
  const ids = items.map((todo) => todo.id);

  useEffect(() => {
    if (pending && orderSettled(todos.map((t) => t.id), pending)) setPending(null);
  }, [todos, pending]);

  const commit = (next: string[]) => {
    setPending(next);
    requireTodosApi()
      .reorder(date, next)
      .catch((error) => {
        console.warn("todo reorder failed:", error);
        // Same rule the rows follow: on failure, snap back to the truth rather
        // than keep showing an order the database rejected.
        setPending(null);
      });
  };

  const { listRef, rowRef, onGripPointerDown } = useDragReorder({
    ids,
    onDragStart: (id) => setDrag({ items, draggingId: id }),
    onReorder: (next) => {
      setDrag(null);
      commit(next);
    },
    onDragEnd: () => setDrag(null),
  });

  const keyMove = (event: KeyboardEvent<HTMLElement>, index: number) => {
    const delta = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
    if (delta === 0) return;
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    event.preventDefault();
    commit(moveItem(ids, index, target));
  };

  // No wrapper when there is nothing to render, so the caller's flex gap does
  // not pick up an empty child.
  if (items.length === 0) return null;

  return (
    <div ref={listRef} className="flex flex-col gap-1">
      {items.map((todo, index) => {
        const dragging = drag?.draggingId === todo.id;
        return (
          <div
            key={todo.id}
            ref={rowRef(todo.id)}
            // No `style` prop, ever: the drag writes transforms straight to
            // these nodes, and React would reconcile them away.
            className={cn(
              "group/order flex items-center gap-0.5 transition-transform",
              drag && "select-none",
              // Rows slide under a stationary cursor, so hover would otherwise
              // reveal the wrong row's controls. Also blocks stray clicks.
              drag && !dragging && "pointer-events-none"
            )}
          >
            <button
              type="button"
              onPointerDown={(event) => onGripPointerDown(event, index)}
              onKeyDown={(event) => keyMove(event, index)}
              className={cn(
                "shrink-0 touch-none cursor-grab text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover/order:opacity-100 active:cursor-grabbing",
                dragging && "opacity-100"
              )}
              aria-label={`Reorder ${todo.title}`}
              title="Drag to reorder"
            >
              <GripVertical className="size-4" />
            </button>
            <div className="min-w-0 flex-1">
              <TodoRow todo={todo} pullTo={pullTo} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

import {
  dayOfMonth,
  kstToday,
  useTodoStore,
  weekOf,
  weekdayShort,
} from "@/src/entities/todo";
import { cn } from "@/src/shared/lib/utils";

export function WeekStrip() {
  const selectedDate = useTodoStore((s) => s.selectedDate);
  const weekTodos = useTodoStore((s) => s.weekTodos);
  const setDate = useTodoStore((s) => s.setDate);
  const today = kstToday();

  return (
    <div className="grid grid-cols-7 gap-1">
      {weekOf(selectedDate).map((date) => {
        const dayTodos = weekTodos.filter((t) => t.date === date);
        const open = dayTodos.filter((t) => !t.done).length;
        const done = dayTodos.length - open;
        const isSelected = date === selectedDate;

        return (
          <button
            key={date}
            type="button"
            onClick={() => void setDate(date)}
            className={cn(
              "flex flex-col items-center gap-0.5 rounded-md border px-1 py-2 text-xs transition-colors",
              isSelected
                ? "border-primary bg-primary/10"
                : "border-transparent hover:bg-accent/50",
              date === today && !isSelected && "border-border"
            )}
          >
            <span className="text-muted-foreground">{weekdayShort(date)}</span>
            <span
              className={cn(
                "text-sm font-medium",
                date === today && "text-primary"
              )}
            >
              {dayOfMonth(date)}
            </span>
            <span className="h-4 text-[10px] text-muted-foreground">
              {dayTodos.length > 0 && `${done}/${dayTodos.length}`}
            </span>
          </button>
        );
      })}
    </div>
  );
}

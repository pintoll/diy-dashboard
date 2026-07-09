import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  formatDateHeading,
  kstToday,
  shiftSelectedDate,
  useTodoStore,
} from "@/src/entities/todo";
import { Button } from "@/src/shared/ui/button";

export function DateNav() {
  const selectedDate = useTodoStore((s) => s.selectedDate);
  const setDate = useTodoStore((s) => s.setDate);
  const isToday = selectedDate === kstToday();

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => void shiftSelectedDate(-1)}
          aria-label="Previous day"
        >
          <ChevronLeft />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => void shiftSelectedDate(1)}
          aria-label="Next day"
        >
          <ChevronRight />
        </Button>
        <h2 className="ml-1 text-lg font-semibold">
          {formatDateHeading(selectedDate)}
          {isToday && (
            <span className="ml-2 text-sm font-normal text-primary">Today</span>
          )}
        </h2>
      </div>
      {!isToday && (
        <Button variant="outline" size="sm" onClick={() => void setDate(kstToday())}>
          Today
        </Button>
      )}
    </div>
  );
}

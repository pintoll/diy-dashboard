import { Fragment, useEffect, useMemo } from "react";
import {
  formatShortDate,
  usePlanStore,
  useTodoStore,
} from "@/src/entities/todo";
import { buildSheetLines, isNowInRange, markerIndex } from "../lib/sheet-lines";
import { useNowHm } from "../model/use-now-hm";
import { AddPlanLine } from "./AddPlanLine";
import { PlanLineRow } from "./PlanLineRow";

export type DaySheetConfig = Record<string, never>;

// The day on a single sheet (docs/design/assistant-architecture.md step 6):
// one line per plan entry in lived order, a current-time marker, a small
// "yesterday unfolded" hint, and the four shallow edits. Structural changes
// (splitting, moving across days) belong to the todo widget or, later, the
// assistant chat.
export function DaySheetClient() {
  const day = usePlanStore((s) => s.day);
  const entries = usePlanStore((s) => s.entries);
  const todosById = usePlanStore((s) => s.todosById);
  const yesterday = usePlanStore((s) => s.yesterday);
  const status = usePlanStore((s) => s.status);
  const error = usePlanStore((s) => s.error);
  const currentDay = useTodoStore((s) => s.currentDay);
  const setDate = useTodoStore((s) => s.setDate);
  const nowHm = useNowHm();

  // The todo store's selectedDate is shared with the /todos page; snap it back
  // to today so the add-line picker always offers today's todos — same
  // convention as the todo-today widget (TodoTodayClient).
  useEffect(() => {
    if (useTodoStore.getState().selectedDate !== currentDay) {
      void setDate(currentDay);
    }
    void useTodoStore.getState().ensureLoaded();
    void usePlanStore.getState().ensureLoaded();
  }, [currentDay, setDate]);

  const lines = useMemo(
    () => buildSheetLines(entries, todosById),
    [entries, todosById]
  );
  const marker = markerIndex(lines, nowHm);

  if (status === "error") {
    return (
      <p className="flex h-full items-center justify-center px-4 text-center text-xs text-muted-foreground">
        {error}
      </p>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-2">
      {yesterday !== null && (
        <p className="shrink-0 px-2 text-[10px] text-muted-foreground">
          Yesterday ({formatShortDate(yesterday)}) is still unfolded
        </p>
      )}

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {lines.length === 0 ? (
          status === "ready" && (
            <p className="flex flex-1 items-center justify-center px-4 text-center text-xs text-muted-foreground">
              Nothing penciled in yet.
            </p>
          )
        ) : (
          <>
            {lines.map((line, index) => (
              <Fragment key={line.entryId}>
                {index === marker && <NowMarker nowHm={nowHm} />}
                <PlanLineRow line={line} current={isNowInRange(line, nowHm)} />
              </Fragment>
            ))}
            {marker === lines.length && <NowMarker nowHm={nowHm} />}
          </>
        )}
      </div>

      <div className="shrink-0">
        <AddPlanLine day={day} nowHm={nowHm} />
      </div>
    </div>
  );
}

function NowMarker({ nowHm }: { nowHm: string }) {
  return (
    <div className="flex items-center gap-1.5 px-2" aria-label={`Now: ${nowHm}`}>
      <span className="text-[9px] tabular-nums text-primary">{nowHm}</span>
      <span className="h-px flex-1 bg-primary/50" />
    </div>
  );
}

import { comparePlanStart, planEndMinutes, planMinutes } from "@shared/plan-time";

// The sheet's render model: one line per plan entry, joined with its todo.
// Pure so the join, the lived-order sort, and the current-time marker math
// stay unit-testable without a DOM or a database.

export type SheetLine = {
  entryId: string;
  todoId: string;
  start: string;
  end: string;
  title: string;
  done: boolean;
  // The referenced todo no longer resolves — transient between the
  // todos:changed push and the store refetch. Render a fallback title and
  // disable the done toggle.
  missing: boolean;
};

type EntryLike = { id: string; todoId: string; start: string; end: string };
type TodoLike = { title: string; done: boolean };

/**
 * Joins plan entries with their todos and sorts with comparePlanStart — the
 * one lived-order rule every plan surface shares (@shared/plan-time). The
 * sort is stable, so equal starts keep the input (insertion) order main
 * already pinned.
 */
export function buildSheetLines(
  entries: EntryLike[],
  todosById: Record<string, TodoLike>
): SheetLine[] {
  return entries
    .map((entry) => {
      const todo = todosById[entry.todoId];
      return {
        entryId: entry.id,
        todoId: entry.todoId,
        start: entry.start,
        end: entry.end,
        title: todo?.title ?? "(deleted todo)",
        done: todo?.done ?? false,
        missing: todo === undefined,
      };
    })
    .sort(comparePlanStart);
}

/**
 * Where the current-time marker sits in a lived-order line list: before the
 * line at this index, i.e. after every line that has already started.
 * 0 = above the first line, lines.length = below the last. Small-hours "now"
 * (e.g. "01:00") sorts late on the 05:00 day, so it lands after the evening
 * lines without a special case.
 */
export function markerIndex(lines: { start: string }[], nowHm: string): number {
  const now = planMinutes(nowHm);
  let index = 0;
  for (const line of lines) {
    if (planMinutes(line.start) <= now) index += 1;
  }
  return index;
}

/**
 * Whether `nowHm` falls inside [start, end) on the 05:00 day — the line being
 * lived right now. An end of "05:00" means end-of-day, so "05:00"-"05:00"
 * (the whole-day block) contains every now.
 */
export function isNowInRange(
  range: { start: string; end: string },
  nowHm: string
): boolean {
  const now = planMinutes(nowHm);
  return now >= planMinutes(range.start) && now < planEndMinutes(range.end);
}

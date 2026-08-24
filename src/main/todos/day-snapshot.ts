import { comparePlanStart } from "@shared/plan-time";
import type { DaySnapshot, PlanEntryRow, TodoRow } from "./types";

// Builds the fold's snapshot — "log applied onto plan": the plan as it finally
// stood plus each involved todo's outcome
// (docs/design/assistant-architecture.md). Pure rows-in/object-out so the
// derivation is unit-testable; fold.ts owns the queries and the upsert.

export type DaySnapshotInput = {
  day: string;
  /** The day's plan entries, in insertion (rowid) order. */
  entries: PlanEntryRow[];
  /** Every involved todo: planned, dated, completed, or worked on this day. */
  todos: TodoRow[];
  /** Seconds accrued per todo id on this day (sessions starting within it). */
  workedSecByTodo: Map<string, number>;
};

export function buildDaySnapshot(input: DaySnapshotInput): DaySnapshot {
  const entries = [...input.entries]
    .sort(comparePlanStart)
    .map((row) => ({ todoId: row.todo_id, start: row.start, end: row.end }));

  // Plain < / > comparison, not localeCompare: the snapshot must be
  // deterministic across machines, and collation is locale-dependent.
  const todos = [...input.todos]
    .sort((a, b) =>
      a.title !== b.title ? (a.title < b.title ? -1 : 1) : a.id < b.id ? -1 : 1
    )
    .map((row) => ({
      id: row.id,
      title: row.title,
      done: row.done === 1,
      completedOn: row.completed_on,
      // Per-day accrual, not row.worked_sec: the lifetime rollup would credit
      // this day with work done on every other one.
      workedSec: input.workedSecByTodo.get(row.id) ?? 0,
    }));

  return { v: 1, day: input.day, entries, todos };
}

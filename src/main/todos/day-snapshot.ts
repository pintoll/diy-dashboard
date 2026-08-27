import { comparePlanStart } from "@shared/plan-time";
import type { DaySnapshot, PlanEntryRow, TodoRow } from "./types";

// Builds the fold's snapshot — "log applied onto plan": the plan as it finally
// stood plus each involved todo's outcome
// (docs/design/assistant-architecture.md), and the projects that actually moved
// (docs/design/projects-para.md). Pure rows-in/object-out so the derivation is
// unit-testable; fold.ts owns the queries and the upsert.

export type DaySnapshotInput = {
  day: string;
  /** The day's plan entries, in insertion (rowid) order. */
  entries: PlanEntryRow[];
  /** Every involved todo: planned, dated, completed, or worked on this day. */
  todos: TodoRow[];
  /** Seconds accrued per todo id on this day (sessions starting within it). */
  workedSecByTodo: Map<string, number>;
  /** Titles for the project ids the involved todos carry. */
  projectTitles: Map<string, string>;
};

// Plain < / > comparison, not localeCompare: the snapshot must be deterministic
// across machines, and collation is locale-dependent.
function byTitleThenId(
  a: { id: string; title: string },
  b: { id: string; title: string }
): number {
  if (a.title !== b.title) return a.title < b.title ? -1 : 1;
  return a.id < b.id ? -1 : 1;
}

export function buildDaySnapshot(input: DaySnapshotInput): DaySnapshot {
  const entries = [...input.entries]
    .sort(comparePlanStart)
    .map((row) => ({ todoId: row.todo_id, start: row.start, end: row.end }));

  const todos = [...input.todos].sort(byTitleThenId).map((row) => ({
    id: row.id,
    title: row.title,
    done: row.done === 1,
    completedOn: row.completed_on,
    // Per-day accrual, not row.worked_sec: the lifetime rollup would credit
    // this day with work done on every other one.
    workedSec: input.workedSecByTodo.get(row.id) ?? 0,
    projectId: row.project_id,
  }));

  // Movement, not mere presence: a todo that sat on the day untouched leaves
  // its project out. A project id with no title is dropped — deleteProject
  // detaches its todos, so an unresolvable id should not occur, and a fold is
  // no place to invent one.
  const projects = new Map<
    string,
    { id: string; title: string; workedSec: number; doneCount: number }
  >();
  for (const todo of todos) {
    const projectId = todo.projectId;
    if (projectId === null) continue;
    const done = todo.completedOn === input.day;
    if (todo.workedSec === 0 && !done) continue;
    const title = input.projectTitles.get(projectId);
    if (title === undefined) continue;

    let project = projects.get(projectId);
    if (project === undefined) {
      project = { id: projectId, title, workedSec: 0, doneCount: 0 };
      projects.set(projectId, project);
    }
    project.workedSec += todo.workedSec;
    if (done) project.doneCount += 1;
  }

  return {
    v: 2,
    day: input.day,
    entries,
    todos,
    projects: [...projects.values()].sort(byTitleThenId),
  };
}

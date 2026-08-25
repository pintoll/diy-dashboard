// Shared contract for the todos feature. `TodoRow` mirrors the SQLite columns
// (snake_case); the plain types are the DTOs that cross IPC / the agent HTTP
// API to consumers (camelCase). Every other file in this folder imports from
// here.
//
// A null `date` means the todo is in the backlog: wanted, but with no planned
// day (docs/design/todo-backlog.md).

import type { ReasonInput } from "./journal";

export type TodoSource = "user" | "agent" | "assistant";

// Who is writing, and under which journal reason (if any). Attached in the
// main process at each entry point (IPC = user, HTTP = agent, assistant loop =
// assistant) — never supplied by the renderer.
export type WriteContext = {
  source: TodoSource;
  // A reason row already minted by the caller (the assistant loop groups a
  // whole batch of ops under one row it creates up front).
  reasonId?: string;
  // A reason not yet minted: resolveReasonId (journal.ts) creates the row
  // inside the first journaling transaction and caches its id in `reasonId`
  // above, so a write that journals nothing — failed validation, no-change
  // patch — never leaves an orphan reasons row.
  reason?: ReasonInput;
  // The intent's single `ops.at` stamp, read once on first journaled op and
  // cached here (journal.ts resolveOpAt). Never set by callers — contexts are
  // one-per-write-request, so the cache scopes the stamp to one intent.
  at?: string;
};

export type TodoRow = {
  id: string;
  date: string | null;
  title: string;
  note: string | null;
  done: number;
  completed_on: string | null;
  sort_order: number;
  worked_sec: number;
  source: TodoSource;
  created_at: string;
  updated_at: string;
};

export type Todo = {
  id: string;
  date: string | null;
  title: string;
  note: string | null;
  done: boolean;
  completedOn: string | null;
  sortOrder: number;
  workedSec: number;
  source: TodoSource;
  createdAt: string;
  updatedAt: string;
};

// `date` omitted means today; `date: null` means the backlog. The two are
// deliberately distinct, so a caller that simply does not care about the day
// still gets today rather than silently parking the todo.
export type TodoCreateInput = {
  title: string;
  date?: string | null;
  note?: string | null;
};

export type TodoPatch = {
  title?: string;
  note?: string | null;
  date?: string | null;
  done?: boolean;
  sortOrder?: number;
};

// Either a single date or an inclusive range. Empty filter = today (resolved
// by the caller so "today" is decided in exactly one place per entry point).
export type TodoListFilter = {
  date?: string;
  from?: string;
  to?: string;
};

export type RecordWorkInput = {
  // Stable per in-flight interval, renderer-generated (`<sessionId>:<todoId>:<seq>`).
  // The idempotency key: a retried write with the same id is a no-op.
  attributionId: string;
  todoId: string;
  sessionId: string;
  startedAt: number;
  endedAt: number;
  workedSec: number;
};

// --- The day record: plan entries + folds (docs/design/assistant-architecture.md) ---

// `start`/`end` are "HH:MM" on the 05:00 day (@shared/plan-time): a time below
// "05:00" means the small hours of the next calendar day.
export type PlanEntryRow = {
  id: string;
  day: string;
  todo_id: string;
  start: string;
  end: string;
};

export type PlanEntry = {
  id: string;
  day: string;
  todoId: string;
  start: string;
  end: string;
};

// `day` omitted means today (mirrors TodoCreateInput). There is no null: a
// plan entry is by definition penciled onto a day.
export type PlanEntryCreateInput = {
  todoId: string;
  day?: string;
  start: string;
  end: string;
};

// Retiming is the only in-place edit. Re-pointing an entry at another todo or
// moving it across days is delete+create — two ops that read honestly in the
// rendered log.
export type PlanEntryPatch = {
  start?: string;
  end?: string;
};

// The fold's frozen record of a day: the final plan plus each involved todo's
// outcome. Computed deterministically by code (day-snapshot.ts); versioned so
// later readers can still render old folds if the shape ever grows.
export type DaySnapshot = {
  v: 1;
  day: string;
  // The final plan, in lived order (planMinutes(start); insertion breaks ties).
  entries: { todoId: string; start: string; end: string }[];
  // One row per involved todo. `workedSec` is the seconds accrued on THIS day
  // (todo_sessions intervals starting within it), not the lifetime rollup;
  // `title` is denormalized so the snapshot outlives todo deletion.
  todos: {
    id: string;
    title: string;
    done: boolean;
    completedOn: string | null;
    workedSec: number;
  }[];
};

export type DayFoldRow = {
  day: string;
  snapshot: string;
  remarks: string | null;
  folded_at: string;
};

export type DayFold = {
  day: string;
  snapshot: DaySnapshot;
  remarks: string | null;
  foldedAt: string;
};

export type TodosChangedReason =
  | "create"
  | "update"
  | "delete"
  | "reorder"
  | "active"
  | "work";

export type TodosChangedPayload = {
  reason: TodosChangedReason;
  id?: string;
};

// Bad caller input (unknown id, malformed date, empty title). The agent HTTP
// API maps this to 400/404 instead of a generic 500.
export class ValidationError extends Error {}
export class NotFoundError extends Error {}

export function rowToTodo(row: TodoRow): Todo {
  return {
    id: row.id,
    date: row.date,
    title: row.title,
    note: row.note,
    done: row.done === 1,
    completedOn: row.completed_on,
    sortOrder: row.sort_order,
    workedSec: row.worked_sec,
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function rowToPlanEntry(row: PlanEntryRow): PlanEntry {
  return {
    id: row.id,
    day: row.day,
    todoId: row.todo_id,
    start: row.start,
    end: row.end,
  };
}

export function rowToDayFold(row: DayFoldRow): DayFold {
  return {
    day: row.day,
    snapshot: JSON.parse(row.snapshot) as DaySnapshot,
    remarks: row.remarks,
    foldedAt: row.folded_at,
  };
}

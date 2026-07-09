// Shared contract for the todos feature. `TodoRow` mirrors the SQLite columns
// (snake_case); the plain types are the DTOs that cross IPC / the agent HTTP
// API to consumers (camelCase). Every other file in this folder imports from
// here.

export type TodoSource = "user" | "agent";

export type TodoRow = {
  id: string;
  date: string;
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
  date: string;
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

export type TodoCreateInput = {
  title: string;
  date?: string;
  note?: string | null;
};

export type TodoPatch = {
  title?: string;
  note?: string | null;
  date?: string;
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
  todoId: string;
  sessionId: string;
  startedAt: number;
  endedAt: number;
  workedSec: number;
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

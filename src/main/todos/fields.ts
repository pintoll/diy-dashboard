import { assertDate } from "./date";
import { ValidationError } from "./types";

// Field shapes both layers normalize the same way: a required name (todo
// title, project title, doc title) and an optional yyyy-MM-dd date (a todo's
// planned day, a project's target date). They were written twice — once in
// crud.ts, once in project-fields.ts — so a rule change applied to one silently
// missed the other. Db-free, like project-fields.ts and for the same reason:
// better-sqlite3 is built against Electron's ABI and cannot load under a plain
// node test run, so everything decidable without a connection stays testable.

export function normalizeName(value: unknown, field: string, max: number): string {
  if (typeof value !== "string") {
    throw new ValidationError(`${field} must be a string`);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new ValidationError(`${field} must not be empty`);
  }
  if (trimmed.length > max) {
    throw new ValidationError(`${field} must be at most ${max} characters`);
  }
  return trimmed;
}

// null is a first-class value on both sides — the backlog for a todo, "no
// deadline" for a project — so it bypasses assertDate rather than being read as
// a malformed date.
export function normalizeOptionalDate(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw new ValidationError(`${field} must be a yyyy-MM-dd string or null`);
  }
  return assertDate(value, field);
}

/**
 * Whether a todo landing on `date` under `projectId` has left the list it was
 * in, and so must append to the end of its destination instead of carrying a
 * number that would drop it mid-list (crud.ts updateTodo).
 *
 * A day is one list. The undated bucket is not: it is split by project into the
 * inbox and one backlog per project, each renumbering from 0, so *there* a
 * filing moves the todo between lists. Filing a dated todo moves nothing — it
 * stays in its day, in its place — which is the half that is easy to lose.
 */
export function movedBucket(
  date: string | null,
  projectId: string | null,
  row: { date: string | null; project_id: string | null }
): boolean {
  return date !== row.date || (date === null && projectId !== row.project_id);
}

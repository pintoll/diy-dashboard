// SQLite writes `CURRENT_TIMESTAMP` as zoneless UTC — "2026-08-27 06:11:04" —
// and `Date.parse` reads a zoneless timestamp as *local* time. Under KST that
// silently moves every such value nine hours into the future, which is enough
// to make "time ago" read "just now" forever and a last-activity day land on
// tomorrow.
//
// Shared rather than per-process because both sides read these columns: main
// rolls `project_docs.updated_at` into a project's last-activity day and ages
// the daily-news weekly profile off its own stamp, while the renderer renders
// that same doc column as "saved 3m ago". memos/crud.ts sidesteps
// the whole problem by storing ISO strings of its own; the todos tables use the
// SQL default, so anything treating one of their timestamps as an instant has
// to come through here.

const SQLITE_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

/**
 * Milliseconds for a SQLite `CURRENT_TIMESTAMP` column, or null for anything
 * that is not one — so a caller reading a column that turns out to be empty or
 * already ISO degrades to "no timestamp" instead of NaN.
 */
export function sqliteUtcToMs(value: string | null | undefined): number | null {
  if (typeof value !== "string" || !SQLITE_TIMESTAMP_PATTERN.test(value)) {
    return null;
  }
  return Date.parse(`${value.replace(" ", "T")}Z`);
}

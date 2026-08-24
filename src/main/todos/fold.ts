import type Database from "better-sqlite3";
import { dayEndMs, dayOf, dayStartMs, today } from "@shared/day";
import { getTodosDb } from "./db";
import { assertDate } from "./date";
import { buildDaySnapshot } from "./day-snapshot";
import {
  ValidationError,
  rowToDayFold,
  type DayFold,
  type DayFoldRow,
  type PlanEntryRow,
  type TodoRow,
} from "./types";

// Folding closes a day: freeze the snapshot (computed by code), keep the
// remarks (from conversation) — docs/design/assistant-behavior.md. A fold is a
// record, not a lock: nothing stops later writes touching the day; they just
// leave the fold stale until someone folds again, which recomputes the
// snapshot (upsert). Folds are not journaled — ops record intents, and the
// snapshot is derived state rewind never inverts.

export type FoldInput = {
  /** undefined keeps the existing remarks, null clears, a string replaces. */
  remarks?: string | null;
};

function normalizeRemarks(remarks: unknown): string | null | undefined {
  if (remarks === undefined) return undefined;
  if (remarks === null) return null;
  if (typeof remarks !== "string") {
    throw new ValidationError("remarks must be a string or null");
  }
  const trimmed = remarks.trim();
  if (trimmed.length === 0) {
    throw new ValidationError("remarks must not be blank; pass null to clear");
  }
  return trimmed;
}

/** Seconds accrued per todo on `day` — sessions whose start instant falls in it. */
function workedSecByTodo(db: Database.Database, day: string): Map<string, number> {
  const rows = db
    .prepare(
      `SELECT todo_id, SUM(worked_sec) AS sec FROM todo_sessions
       WHERE started_at >= ? AND started_at < ? GROUP BY todo_id`
    )
    .all(dayStartMs(day), dayEndMs(day)) as { todo_id: string; sec: number }[];
  return new Map(rows.map((row) => [row.todo_id, row.sec]));
}

// Involved = planned into the day, dated on it, completed on it, or worked on
// it. Ids from the plan/session side that no longer resolve (the todo is gone,
// which also swept its entries and cascaded its sessions) simply drop out.
function involvedTodos(
  db: Database.Database,
  day: string,
  entries: PlanEntryRow[],
  worked: Map<string, number>
): TodoRow[] {
  const byId = new Map<string, TodoRow>();
  const dated = db
    .prepare("SELECT * FROM todos WHERE date = ? OR completed_on = ?")
    .all(day, day) as TodoRow[];
  for (const row of dated) byId.set(row.id, row);

  const missing = [
    ...new Set([...entries.map((e) => e.todo_id), ...worked.keys()]),
  ].filter((id) => !byId.has(id));
  if (missing.length > 0) {
    const placeholders = missing.map(() => "?").join(",");
    const extra = db
      .prepare(`SELECT * FROM todos WHERE id IN (${placeholders})`)
      .all(...missing) as TodoRow[];
    for (const row of extra) byId.set(row.id, row);
  }
  return [...byId.values()];
}

function hasOpsOnDay(db: Database.Database, day: string): boolean {
  return !!db
    .prepare("SELECT 1 FROM ops WHERE at >= ? AND at < ? LIMIT 1")
    .get(new Date(dayStartMs(day)).toISOString(), new Date(dayEndMs(day)).toISOString());
}

export function foldDay(day: string, input: FoldInput = {}): DayFold {
  assertDate(day, "day");
  if (day > today()) {
    throw new ValidationError(`cannot fold a future day: "${day}"`);
  }
  const remarks = normalizeRemarks(input.remarks);
  const db = getTodosDb();

  const row = db.transaction((): DayFoldRow => {
    const entries = db
      .prepare("SELECT * FROM plan_entries WHERE day = ? ORDER BY rowid")
      .all(day) as PlanEntryRow[];
    const worked = workedSecByTodo(db, day);
    const todos = involvedTodos(db, day, entries, worked);

    // "Days with no plan and no activity stay empty" (assistant-behavior.md) —
    // but any day the yesterday resolver can name (it has plan entries, ops,
    // or sessions) must stay foldable, or the morning conversation dead-ends
    // on a day whose only trace is in the journal. Sessions pass this guard
    // through `todos` (a worked todo is involved), matching the resolver's
    // session leg.
    if (entries.length === 0 && todos.length === 0 && !hasOpsOnDay(db, day)) {
      throw new ValidationError(`nothing to fold: "${day}" has no records`);
    }

    const snapshot = buildDaySnapshot({ day, entries, todos, workedSecByTodo: worked });
    const existing = db
      .prepare("SELECT * FROM day_folds WHERE day = ?")
      .get(day) as DayFoldRow | undefined;

    const stored: DayFoldRow = {
      day,
      snapshot: JSON.stringify(snapshot),
      // A re-fold that only refreshes the snapshot must not destroy the
      // night's remarks, hence keep-on-undefined.
      remarks: remarks === undefined ? (existing?.remarks ?? null) : remarks,
      folded_at: new Date().toISOString(),
    };
    db.prepare(
      `INSERT INTO day_folds (day, snapshot, remarks, folded_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(day) DO UPDATE SET
         snapshot = excluded.snapshot,
         remarks = excluded.remarks,
         folded_at = excluded.folded_at`
    ).run(stored.day, stored.snapshot, stored.remarks, stored.folded_at);
    return stored;
  })();

  return rowToDayFold(row);
}

export function getDayFold(day: string): DayFold | null {
  assertDate(day, "day");
  const row = getTodosDb()
    .prepare("SELECT * FROM day_folds WHERE day = ?")
    .get(day) as DayFoldRow | undefined;
  return row ? rowToDayFold(row) : null;
}

/**
 * "Yesterday" in the assistant's sense: the last day before today with
 * records — plan entries, ops, or pomodoro sessions — after the last fold.
 * Gap days skip for free; a fully folded (or empty) history returns null
 * (docs/design/assistant-architecture.md). Every record kind foldDay accepts
 * must have a leg here, or the morning conversation skips a foldable day.
 */
export function resolveYesterday(): string | null {
  const db = getTodosDb();
  const cur = today();
  const { last } = db
    .prepare("SELECT MAX(day) AS last FROM day_folds")
    .get() as { last: string | null };

  const { day: planDay } = db
    .prepare(
      `SELECT MAX(day) AS day FROM plan_entries
       WHERE day < ? AND (? IS NULL OR day > ?)`
    )
    .get(cur, last, last) as { day: string | null };

  // Ops don't carry a day; the latest `at` before today's start (and after the
  // end of the last folded day) names the last ops-day. String comparison is
  // safe — every `at` is toISOString() (journal.ts).
  const cutoffMs = last === null ? null : dayEndMs(last);
  const cutoff = cutoffMs === null ? null : new Date(cutoffMs).toISOString();
  const { at } = db
    .prepare(
      `SELECT MAX(at) AS at FROM ops
       WHERE at < ? AND (? IS NULL OR at >= ?)`
    )
    .get(new Date(dayStartMs(cur)).toISOString(), cutoff, cutoff) as { at: string | null };
  const opDay = at === null ? null : dayOf(Date.parse(at));

  // Sessions journal no ops (sessions.ts recordWork), so a day spent only
  // running pomodoros against already-created todos leaves its sole trace
  // here. Same day-attribution rule as workedSecByTodo: the start instant.
  const { ms } = db
    .prepare(
      `SELECT MAX(started_at) AS ms FROM todo_sessions
       WHERE started_at < ? AND (? IS NULL OR started_at >= ?)`
    )
    .get(dayStartMs(cur), cutoffMs, cutoffMs) as { ms: number | null };
  const sessionDay = ms === null ? null : dayOf(ms);

  const days = [planDay, opDay, sessionDay].filter((d): d is string => d !== null);
  return days.length === 0 ? null : days.reduce((a, b) => (a > b ? a : b));
}

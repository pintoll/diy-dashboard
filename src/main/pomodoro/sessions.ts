import { getPomodoroDb } from "./db";
import type { PomodoroSession } from "./types";

// Raw column shape as stored. Enums are TEXT and booleans are 0/1 INTEGER;
// `rowToSession` maps back to the typed record and defends the enum columns so a
// stray value never widens the renderer's union types.
type SessionRow = {
  id: string;
  phase: string;
  started_at: number;
  ended_at: number;
  duration_sec: number;
  preset_id: string;
  overtime_sec: number;
  idle_sec: number;
  intended_mode: string | null;
  attention: string;
  attention_source: string;
  session_end_type: string;
  process_buckets: string;
  capped_at_60m: number;
  todo_ids: string | null;
  note: string | null;
};

function parseBuckets(raw: string): Record<string, number> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, number>;
    }
  } catch {
    // A corrupt JSON blob in this one column is not worth dropping the row for.
  }
  return {};
}

// todo_ids is a JSON string array (or NULL for legacy rows the migration left
// untouched because they had no todo). Defends the shape so a stray value never
// breaks the renderer's `string[]` contract; same lenient rule as parseBuckets.
function parseTodoIds(raw: string | null): string[] {
  if (raw === null) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter((v): v is string => typeof v === "string");
    }
  } catch {
    // A corrupt JSON blob in this one column is not worth dropping the row for.
  }
  return [];
}

function rowToSession(r: SessionRow): PomodoroSession {
  return {
    id: r.id,
    phase: "work",
    startedAt: r.started_at,
    endedAt: r.ended_at,
    durationSec: r.duration_sec,
    presetId: r.preset_id,
    overtimeSec: r.overtime_sec,
    idleSec: r.idle_sec,
    intendedMode:
      r.intended_mode === "focus" || r.intended_mode === "leisure"
        ? r.intended_mode
        : null,
    attention: r.attention === "leisure" ? "leisure" : "focus",
    attentionSource: r.attention_source === "user" ? "user" : "auto",
    sessionEndType: r.session_end_type === "early-stop" ? "early-stop" : "completed",
    processBuckets: parseBuckets(r.process_buckets),
    cappedAt60m: r.capped_at_60m === 1,
    todoIds: parseTodoIds(r.todo_ids),
    note: r.note,
  };
}

// INSERT OR IGNORE keyed on the renderer-generated id makes both the write-
// through and the one-time localStorage import idempotent: re-recording or
// re-importing the same id is a no-op, never a duplicate.
const INSERT_SQL = `
INSERT OR IGNORE INTO sessions (
  id, phase, started_at, ended_at, duration_sec, preset_id, overtime_sec,
  idle_sec, intended_mode, attention, attention_source, session_end_type,
  process_buckets, capped_at_60m, todo_ids, note
) VALUES (
  @id, @phase, @startedAt, @endedAt, @durationSec, @presetId, @overtimeSec,
  @idleSec, @intendedMode, @attention, @attentionSource, @sessionEndType,
  @processBuckets, @cappedAt60m, @todoIds, @note
)`;

function toInsertParams(s: PomodoroSession) {
  return {
    id: s.id,
    phase: "work",
    startedAt: s.startedAt,
    endedAt: s.endedAt,
    durationSec: s.durationSec,
    presetId: s.presetId,
    overtimeSec: s.overtimeSec,
    idleSec: s.idleSec,
    intendedMode: s.intendedMode,
    attention: s.attention,
    attentionSource: s.attentionSource,
    sessionEndType: s.sessionEndType,
    processBuckets: JSON.stringify(s.processBuckets ?? {}),
    cappedAt60m: s.cappedAt60m ? 1 : 0,
    todoIds: JSON.stringify(s.todoIds ?? []),
    note: s.note,
  };
}

// Oldest first, matching the append order the renderer array carried under
// localStorage. The analytics aggregations key off timestamps, not position,
// but keeping the order stable avoids any surprise for order-sensitive reads.
export function listSessions(): PomodoroSession[] {
  const rows = getPomodoroDb()
    .prepare("SELECT * FROM sessions ORDER BY ended_at ASC")
    .all() as SessionRow[];
  return rows.map(rowToSession);
}

export function recordSession(session: PomodoroSession): void {
  getPomodoroDb().prepare(INSERT_SQL).run(toInsertParams(session));
}

export function updateSessionNote(id: string, note: string | null): void {
  getPomodoroDb().prepare("UPDATE sessions SET note = ? WHERE id = ?").run(note, id);
}

export function importSessions(sessions: PomodoroSession[]): number {
  const db = getPomodoroDb();
  const insert = db.prepare(INSERT_SQL);
  const run = db.transaction((rows: PomodoroSession[]) => {
    let inserted = 0;
    for (const s of rows) {
      inserted += insert.run(toInsertParams(s)).changes;
    }
    return inserted;
  });
  return run(sessions);
}

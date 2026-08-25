import type Database from "better-sqlite3";
import { dayEndIso, dayStartIso } from "@shared/day";
import { assertDate } from "./date";
import { getTodoTitlesByIds } from "./crud";
import { getTodosDb } from "./db";
import type { OpEntity, OpKind } from "./journal";
import {
  referencedTodoIds,
  renderLogLines,
  type LogLine,
  type LogOp,
} from "./log-render";
import type { TodoSource } from "./types";

// The log view's queries: one day-window scan over the ops journal with its
// reasons joined in, handed to log-render.ts (the pure renderer) as parsed
// rows. Same half-open [dayStartIso, dayEndIso) range as fold.ts — but ordered
// by seq: append order is authoritative, and the two diverge only under clock
// skew.

export type DayLog = { day: string; lines: LogLine[] };

type OpRow = {
  seq: number;
  entity: OpEntity;
  entity_id: string;
  op: OpKind;
  before: string | null;
  after: string | null;
  source: TodoSource;
  reason_id: string | null;
  at: string;
  reason_text: string | null;
};

export function getDayLog(day: string): DayLog {
  assertDate(day, "day");
  const db = getTodosDb();
  const rows = db
    .prepare(
      `SELECT o.seq, o.entity, o.entity_id, o.op, o.before, o.after,
              o.source, o.reason_id, o.at, r.text AS reason_text
       FROM ops o LEFT JOIN reasons r ON r.id = o.reason_id
       WHERE o.at >= ? AND o.at < ?
       ORDER BY o.seq`
    )
    .all(dayStartIso(day), dayEndIso(day)) as OpRow[];

  const parse = (snapshot: string | null): Record<string, unknown> | null =>
    snapshot === null ? null : (JSON.parse(snapshot) as Record<string, unknown>);
  const ops: LogOp[] = rows.map((row) => ({
    seq: row.seq,
    entity: row.entity,
    entityId: row.entity_id,
    op: row.op,
    before: parse(row.before),
    after: parse(row.after),
    source: row.source,
    reasonId: row.reason_id,
    reasonText: row.reason_text,
    at: row.at,
  }));

  const titles = resolveTitles(db, referencedTodoIds(ops));
  return { day, lines: renderLogLines({ day, ops, titlesByTodoId: titles }) };
}

// Plan snapshots carry no title. Live todos resolve from the table — the
// CURRENT title, an accepted imprecision ("precision is not required",
// assistant-behavior.md). Deleted ones fall back to their last journal
// snapshot; a delete op's `after` is NULL, so COALESCE lands on `before`.
// Deliberately not window-scoped: the delete may live on another day.
function resolveTitles(
  db: Database.Database,
  ids: Set<string>
): Map<string, string> {
  const titles = new Map<string, string>();
  if (ids.size === 0) return titles;

  for (const row of getTodoTitlesByIds([...ids])) titles.set(row.id, row.title);

  const missing = [...ids].filter((id) => !titles.has(id));
  if (missing.length === 0) return titles;
  // One grouped lookup for every missing id, served by idx_ops_entity
  // (schema.ts). The bare columns ride SQLite's documented min/max behavior:
  // with a single MAX() aggregate, non-aggregate columns — and expressions
  // over them — take their values from the max-seq row.
  const placeholders = missing.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT entity_id AS id, COALESCE(after, before) AS snap, MAX(seq)
       FROM ops WHERE entity = 'todo' AND entity_id IN (${placeholders})
       GROUP BY entity_id`
    )
    .all(...missing) as { id: string; snap: string | null }[];
  for (const row of rows) {
    if (row.snap === null) continue;
    const title = (JSON.parse(row.snap) as { title?: unknown }).title;
    if (typeof title === "string") titles.set(row.id, title);
  }
  return titles;
}

import type Database from "better-sqlite3";
import { nanoid } from "nanoid";
import type { TodoSource, WriteContext } from "./types";

// The ops journal: every intent-level todo and plan change appends
// one row with full before/after snapshots; a `reasons` row groups the ops of
// one natural-language intent (docs/design/assistant-architecture.md). Like
// schema.ts this file takes the connection as an argument and carries no
// Electron dependency, so it can be exercised directly against better-sqlite3.
//
// Timestamps here (`reasons.created_at`, `ops.at`) are ISO-8601, not SQLite's
// CURRENT_TIMESTAMP: the log view renders them in the renderer, which would
// misread the zone-less UTC format as local time (same rationale as
// memos/crud.ts `nowIso`). The snapshots inside `before`/`after` keep whatever
// format the row stores — they exist for diffing and rewind, not display.

export type ReasonSource = "assistant" | "agent";
export type OpEntity = "todo" | "plan";
export type OpKind = "create" | "update" | "delete";

export type ReasonInput = {
  source: ReasonSource;
  sessionId?: string;
  text: string;
};

export type OpInput = {
  entity: OpEntity;
  entityId: string;
  op: OpKind;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  source: TodoSource;
  reasonId?: string;
};

export function createReason(db: Database.Database, input: ReasonInput): string {
  const id = nanoid();
  db.prepare(
    `INSERT INTO reasons (id, source, session_id, text, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(id, input.source, input.sessionId ?? null, input.text, new Date().toISOString());
  return id;
}

/**
 * The reason id for a write context, minting the row on first use. Called at
 * the point an op is actually recorded — inside the caller's open transaction —
 * so a write that journals nothing (failed validation, no-change patch) never
 * creates a reasons row, and one that rolls back takes the row with it. The id
 * is cached on the context, so every op of one intent shares one row.
 */
export function resolveReasonId(
  db: Database.Database,
  ctx: WriteContext
): string | undefined {
  if (ctx.reasonId === undefined && ctx.reason !== undefined) {
    ctx.reasonId = createReason(db, ctx.reason);
  }
  return ctx.reasonId;
}

/**
 * Appends one journal row. Deliberately opens no transaction of its own: it
 * joins whatever transaction (or savepoint) the caller has open, which is the
 * atomicity contract — an op row exists exactly when the change it describes
 * committed.
 */
export function recordOp(db: Database.Database, input: OpInput): void {
  db.prepare(
    `INSERT INTO ops (entity, entity_id, op, before, after, source, reason_id, at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    input.entity,
    input.entityId,
    input.op,
    input.before === null ? null : JSON.stringify(input.before),
    input.after === null ? null : JSON.stringify(input.after),
    input.source,
    input.reasonId ?? null,
    new Date().toISOString()
  );
}

/**
 * True when the two row snapshots differ in any column other than
 * `updated_at`. Used to skip journaling a no-change update: an "updated X" op
 * whose diff is empty would be a lie in the rendered log and a no-op for
 * rewind.
 */
export function rowChanged(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): boolean {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  keys.delete("updated_at");
  for (const key of keys) {
    if (before[key] !== after[key]) return true;
  }
  return false;
}

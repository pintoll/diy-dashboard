import type Database from "better-sqlite3";
import { nanoid } from "nanoid";
import type { WriteContext } from "./types";

// The ops journal: every intent-level todo, plan, project and doc change appends
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
//
// `ops.at` is read once per WriteContext (resolveOpAt), not per op: every op
// of one intent shares one stamp, so a multi-op transaction (a delete sweep, a
// reasoned batch) can never straddle the 05:00 day window, and an equal `at`
// marks same-intent ops for the log's sweep fusion (log-render.ts).

export type ReasonSource = "assistant" | "agent";
export type OpEntity = "todo" | "plan" | "project" | "project_doc";
export type OpKind = "create" | "update" | "delete";

export type ReasonInput = {
  source: ReasonSource;
  sessionId?: string;
  text: string;
};

export type OpChange = {
  entity: OpEntity;
  entityId: string;
  op: OpKind;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
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
function resolveReasonId(
  db: Database.Database,
  ctx: WriteContext
): string | undefined {
  if (ctx.reasonId === undefined && ctx.reason !== undefined) {
    ctx.reasonId = createReason(db, ctx.reason);
  }
  return ctx.reasonId;
}

/**
 * The `at` stamp for a write context: one clock read on first use, cached like
 * `reasonId` above. Sharing one stamp across the ops of one intent is what
 * lets equal `at` stand in for "same transaction" (there is no txn-id column)
 * and keeps a multi-op transaction inside one 05:00 day window.
 */
function resolveOpAt(ctx: WriteContext): string {
  if (ctx.at === undefined) ctx.at = new Date().toISOString();
  return ctx.at;
}

/**
 * Appends one journal row for the given write context. Deliberately opens no
 * transaction of its own: it joins whatever transaction (or savepoint) the
 * caller has open, which is the atomicity contract — an op row exists exactly
 * when the change it describes committed. The context supplies everything
 * intent-scoped (source, reason, the shared `at` stamp), so a call site cannot
 * stamp one op of an intent differently from its siblings.
 */
export function recordOp(
  db: Database.Database,
  ctx: WriteContext,
  change: OpChange
): void {
  db.prepare(
    `INSERT INTO ops (entity, entity_id, op, before, after, source, reason_id, at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    change.entity,
    change.entityId,
    change.op,
    change.before === null ? null : JSON.stringify(change.before),
    change.after === null ? null : JSON.stringify(change.after),
    ctx.source,
    resolveReasonId(db, ctx) ?? null,
    resolveOpAt(ctx)
  );
}

/**
 * The columns in which two row snapshots differ, ignoring `updated_at` (it is
 * stamped on every write, so it would mark every update as changed). This is
 * the journal's definition of "what an op changed" — the log renderer
 * (log-render.ts) iterates the same keys, so a column added to a table is
 * journaled AND rendered from day one instead of the two inventories drifting.
 */
export function changedKeys(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  keys.delete("updated_at");
  return [...keys].filter((key) => before[key] !== after[key]);
}

/**
 * True when the snapshots differ at all. Used to skip journaling a no-change
 * update: an "updated X" op whose diff is empty would be a lie in the rendered
 * log and a no-op for rewind.
 */
export function rowChanged(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): boolean {
  return changedKeys(before, after).length > 0;
}

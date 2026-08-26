import type Database from "better-sqlite3";
import { nanoid } from "nanoid";
import { comparePlanStart, isPlanTime, planEndMinutes, planMinutes } from "@shared/plan-time";
import { getTodosDb } from "./db";
import { assertDate, contextDay } from "./date";
import { emitTodosChanged } from "./events";
import { recordOp, rowChanged } from "./journal";
import {
  NotFoundError,
  ValidationError,
  rowToPlanEntry,
  type PlanEntry,
  type PlanEntryCreateInput,
  type PlanEntryPatch,
  type PlanEntryRow,
  type WriteContext,
} from "./types";

// The day's plan: todos penciled onto clock-time ranges
// (docs/design/assistant-behavior.md). Entries are pencil sketches — overlaps
// are deliberately not validated, and there is no sort column: reading order
// is derived from `start` on the 05:00 day (@shared/plan-time). Every write is
// journaled as a 'plan' op the same way crud.ts journals todos.
//
// Every direct write broadcasts todos:changed with reason "plan" after its
// transaction commits, so the day-sheet widget refreshes regardless of who
// wrote (IPC or agent HTTP). The delete-todo sweep below is the exception: it
// runs inside crud's deleteTodo transaction, whose "delete" broadcast already
// fires after commit — emitting here would announce uncommitted state.

function assertPlanTime(value: unknown, field: string): string {
  if (!isPlanTime(value)) {
    throw new ValidationError(
      `${field} must be "HH:MM" (00:00-23:59), got ${JSON.stringify(value)}`
    );
  }
  return value;
}

// An entry lies within one 05:00 day: end strictly after start in lived order,
// where an end of "05:00" means end-of-day. Rejects zero-length and
// boundary-crossing ranges, accepts the midnight wrap (23:00-01:00) — and
// "05:00"-"05:00", the one valid start==end pair, meaning the whole day
// (@shared/plan-time planEndMinutes).
function assertRange(start: string, end: string): void {
  if (planEndMinutes(end) <= planMinutes(start)) {
    throw new ValidationError(
      `end must come after start within the 05:00 day, got ${start}-${end}`
    );
  }
}

function getEntryRow(db: Database.Database, id: string): PlanEntryRow {
  const row = db
    .prepare("SELECT * FROM plan_entries WHERE id = ?")
    .get(id) as PlanEntryRow | undefined;
  if (!row) throw new NotFoundError(`No plan entry with id "${id}"`);
  return row;
}

export function listPlanEntries(day: string): PlanEntry[] {
  assertDate(day, "day");
  const rows = getTodosDb()
    .prepare("SELECT * FROM plan_entries WHERE day = ? ORDER BY rowid")
    .all(day) as PlanEntryRow[];
  // Lived order, 05:00 first. The SQL ORDER BY pins what the stable JS sort
  // falls back to on equal starts: insertion order.
  return rows.sort(comparePlanStart).map(rowToPlanEntry);
}

export function createPlanEntry(input: PlanEntryCreateInput, ctx: WriteContext): PlanEntry {
  const db = getTodosDb();
  if (typeof input.todoId !== "string" || input.todoId.length === 0) {
    throw new ValidationError("todoId must be a todo id string");
  }
  const day = input.day !== undefined ? assertDate(input.day, "day") : contextDay(ctx);
  const start = assertPlanTime(input.start, "start");
  const end = assertPlanTime(input.end, "end");
  assertRange(start, end);
  const id = nanoid();

  const row = db.transaction((): PlanEntryRow => {
    // No FK backs this reference up (the delete sweep in crud.ts is the
    // integrity story), so a dangling entry at birth is a caller bug worth
    // rejecting here.
    const exists = db.prepare("SELECT 1 FROM todos WHERE id = ?").get(input.todoId);
    if (!exists) throw new NotFoundError(`No todo with id "${input.todoId}"`);

    db.prepare(
      `INSERT INTO plan_entries (id, day, todo_id, start, end)
       VALUES (?, ?, ?, ?, ?)`
    ).run(id, day, input.todoId, start, end);

    // No re-read: plan_entries has no SQL defaults, so the bound values are
    // the row as stored (contrast crud.ts createTodo).
    const created: PlanEntryRow = { id, day, todo_id: input.todoId, start, end };
    recordOp(db, ctx, {
      entity: "plan",
      entityId: id,
      op: "create",
      before: null,
      after: created,
    });
    return created;
  })();

  emitTodosChanged({ reason: "plan", id });
  return rowToPlanEntry(row);
}

export function updatePlanEntry(
  id: string,
  patch: PlanEntryPatch,
  ctx: WriteContext
): PlanEntry {
  const db = getTodosDb();

  const updated = db.transaction((): PlanEntryRow => {
    const row = getEntryRow(db, id);
    const start = patch.start !== undefined ? assertPlanTime(patch.start, "start") : row.start;
    const end = patch.end !== undefined ? assertPlanTime(patch.end, "end") : row.end;
    assertRange(start, end);

    db.prepare("UPDATE plan_entries SET start = ?, end = ? WHERE id = ?").run(start, end, id);

    const after: PlanEntryRow = { ...row, start, end };
    if (rowChanged(row, after)) {
      recordOp(db, ctx, {
        entity: "plan",
        entityId: id,
        op: "update",
        before: row,
        after,
      });
    }
    return after;
  })();

  // Unconditional, like crud's updateTodo: a no-change write still resnaps
  // subscribers to truth.
  emitTodosChanged({ reason: "plan", id });
  return rowToPlanEntry(updated);
}

// The one journaled-delete shape for a plan entry row. Both the direct delete
// and the delete-todo sweep go through here so the two can never journal
// differently — log rendering and rewind must see one delete op shape.
function deleteEntryRow(db: Database.Database, row: PlanEntryRow, ctx: WriteContext): void {
  db.prepare("DELETE FROM plan_entries WHERE id = ?").run(row.id);
  recordOp(db, ctx, {
    entity: "plan",
    entityId: row.id,
    op: "delete",
    before: row,
    after: null,
  });
}

export function deletePlanEntry(id: string, ctx: WriteContext): void {
  const db = getTodosDb();
  db.transaction(() => {
    deleteEntryRow(db, getEntryRow(db, id), ctx);
  })();
  emitTodosChanged({ reason: "plan", id });
}

/**
 * Sweeps every plan entry pointing at a todo, one journaled delete op per row.
 * Joins the caller's open transaction (crud.ts deleteTodo) rather than opening
 * its own, and shares the caller's reason through the same WriteContext — the
 * sweep is part of the delete-todo intent, not an intent of its own.
 */
export function removePlanEntriesForTodo(
  db: Database.Database,
  todoId: string,
  ctx: WriteContext
): void {
  const rows = db
    .prepare("SELECT * FROM plan_entries WHERE todo_id = ? ORDER BY rowid")
    .all(todoId) as PlanEntryRow[];
  for (const row of rows) deleteEntryRow(db, row, ctx);
}

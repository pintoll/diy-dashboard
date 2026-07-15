import { getTodosDb } from "./db";
import { emitTodosChanged } from "./events";
import {
  NotFoundError,
  ValidationError,
  type RecordWorkInput,
} from "./types";

/**
 * Accrues one in-flight interval of a pomodoro onto a todo. Idempotent on
 * attribution_id: the ledger row is the dedup key, and worked_sec only accrues
 * when the row is actually inserted, so a retried IPC/HTTP call can never
 * double-count. One session can bank many rows (one per desk member per
 * interval); see docs/design/multi-pomo-todo.md.
 */
export function recordWork(input: RecordWorkInput): void {
  const { attributionId, todoId, sessionId, startedAt, endedAt, workedSec } = input;
  if (typeof attributionId !== "string" || attributionId.length === 0) {
    throw new ValidationError("attributionId must be a non-empty string");
  }
  if (typeof sessionId !== "string" || sessionId.length === 0) {
    throw new ValidationError("sessionId must be a non-empty string");
  }
  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt)) {
    throw new ValidationError("startedAt and endedAt must be epoch ms numbers");
  }
  if (!Number.isInteger(workedSec) || workedSec < 0) {
    throw new ValidationError("workedSec must be a non-negative integer");
  }

  const db = getTodosDb();
  let inserted = false;

  db.transaction(() => {
    const exists = db.prepare("SELECT 1 FROM todos WHERE id = ?").get(todoId);
    if (!exists) throw new NotFoundError(`No todo with id "${todoId}"`);

    const info = db
      .prepare(
        `INSERT OR IGNORE INTO todo_sessions (attribution_id, session_id, todo_id, started_at, ended_at, worked_sec)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(attributionId, sessionId, todoId, startedAt, endedAt, workedSec);
    inserted = info.changes === 1;
    if (inserted) {
      db.prepare(
        `UPDATE todos SET worked_sec = worked_sec + ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      ).run(workedSec, todoId);
    }
  })();

  if (inserted) emitTodosChanged({ reason: "work", id: todoId });
}

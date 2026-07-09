import { getTodosDb } from "./db";
import { emitTodosChanged } from "./events";
import {
  NotFoundError,
  ValidationError,
  type RecordWorkInput,
} from "./types";

/**
 * Accrues one pomodoro work session onto a todo. Idempotent on sessionId:
 * the link row is the dedup key, and worked_sec only accrues when the row is
 * actually inserted, so a retried IPC/HTTP call can never double-count.
 */
export function recordWork(input: RecordWorkInput): void {
  const { todoId, sessionId, startedAt, endedAt, workedSec } = input;
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
        `INSERT OR IGNORE INTO todo_sessions (session_id, todo_id, started_at, ended_at, worked_sec)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(sessionId, todoId, startedAt, endedAt, workedSec);
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

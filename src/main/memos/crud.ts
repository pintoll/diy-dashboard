import { nanoid } from "nanoid";
import { MAX_UNDO, type TextEdit } from "@shared/text-history";
import { getMemosDb } from "./db";
import {
  MemoValidationError,
  type MemoCommitEditInput,
  type MemoMoveCursorInput,
  type MemoRow,
  type MemoSnapshot,
  type MemoSnapshotRow,
  type MemoState,
  type MemoWriteResult,
} from "./types";

// A memo is a scratch buffer, not a document store; the cap only exists so a
// runaway paste cannot turn every keystroke into a multi-megabyte row write.
const MAX_BODY_CHARS = 1_000_000;

function nowIso(): string {
  // Not CURRENT_TIMESTAMP: SQLite writes "YYYY-MM-DD HH:MM:SS" in UTC with no
  // zone marker, which the renderer's formatTimeAgo would read as local time
  // and report hours off.
  return new Date().toISOString();
}

function assertId(id: unknown): string {
  if (typeof id !== "string" || id.length === 0) {
    throw new MemoValidationError("memo id must be a non-empty string");
  }
  return id;
}

function assertBody(body: unknown): string {
  if (typeof body !== "string") {
    throw new MemoValidationError("memo body must be a string");
  }
  if (body.length > MAX_BODY_CHARS) {
    throw new MemoValidationError(
      `memo body must be at most ${MAX_BODY_CHARS} characters`
    );
  }
  return body;
}

function assertEdit(edit: unknown): TextEdit {
  const candidate = edit as TextEdit | undefined;
  if (
    !candidate ||
    !Number.isInteger(candidate.seq) ||
    candidate.seq < 1 ||
    !Number.isInteger(candidate.start) ||
    candidate.start < 0 ||
    typeof candidate.removed !== "string" ||
    typeof candidate.inserted !== "string"
  ) {
    throw new MemoValidationError("malformed memo edit");
  }
  return candidate;
}

// Every entry point starts here: the row is created on first sight rather than
// by an explicit "create memo" call, because the widget's instanceId is the id.
function ensureMemo(id: string): void {
  const now = nowIso();
  getMemosDb()
    .prepare(
      "INSERT OR IGNORE INTO memos (id, body, history_cursor, created_at, updated_at) VALUES (?, '', 0, ?, ?)"
    )
    .run(id, now, now);
}

export function loadMemo(rawId: string): MemoState {
  const id = assertId(rawId);
  ensureMemo(id);

  const db = getMemosDb();
  const row = db.prepare("SELECT * FROM memos WHERE id = ?").get(id) as MemoRow;
  const edits = db
    .prepare(
      "SELECT seq, start, removed, inserted FROM memo_edits WHERE memo_id = ? ORDER BY seq"
    )
    .all(id) as TextEdit[];

  return {
    id,
    body: row.body,
    cursor: row.history_cursor,
    edits,
    snapshots: listSnapshots(id),
    updatedAt: row.updated_at,
  };
}

/**
 * Records one undo step and the body it produced.
 *
 * The row at `edit.seq` is upserted rather than inserted: a typing burst keeps
 * re-sending the same seq with a wider splice as it coalesces, so the last send
 * of a burst wins and the intermediate ones cost one UPDATE each.
 */
export function commitEdit(input: MemoCommitEditInput): MemoWriteResult {
  const id = assertId(input.id);
  const body = assertBody(input.body);
  const edit = assertEdit(input.edit);

  ensureMemo(id);
  const db = getMemosDb();
  const updatedAt = nowIso();

  db.transaction(() => {
    // Anything above the new step is the redo tail the user just abandoned.
    db.prepare("DELETE FROM memo_edits WHERE memo_id = ? AND seq > ?").run(
      id,
      edit.seq
    );
    db.prepare(
      `INSERT INTO memo_edits (memo_id, seq, start, removed, inserted, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(memo_id, seq) DO UPDATE SET
         start = excluded.start,
         removed = excluded.removed,
         inserted = excluded.inserted`
    ).run(id, edit.seq, edit.start, edit.removed, edit.inserted, updatedAt);
    db.prepare(
      "UPDATE memos SET body = ?, history_cursor = ?, updated_at = ? WHERE id = ?"
    ).run(body, edit.seq, updatedAt, id);
    // Retention has to match @shared/text-history's MAX_UNDO exactly, or the
    // widget would offer an undo whose splice is no longer on disk.
    db.prepare("DELETE FROM memo_edits WHERE memo_id = ? AND seq <= ?").run(
      id,
      edit.seq - MAX_UNDO
    );
  })();

  return { updatedAt };
}

/**
 * Persists an undo or redo. No edit is written — the step already exists; only
 * which side of it the buffer sits on changes, so a restart reopens the memo
 * exactly where the user left it, redo tail intact.
 */
export function moveCursor(input: MemoMoveCursorInput): MemoWriteResult {
  const id = assertId(input.id);
  const body = assertBody(input.body);
  if (!Number.isInteger(input.cursor) || input.cursor < 0) {
    throw new MemoValidationError("memo cursor must be a non-negative integer");
  }

  ensureMemo(id);
  const updatedAt = nowIso();
  getMemosDb()
    .prepare(
      "UPDATE memos SET body = ?, history_cursor = ?, updated_at = ? WHERE id = ?"
    )
    .run(body, input.cursor, updatedAt, id);

  return { updatedAt };
}

// Snapshots are never pruned automatically. Taking one is a deliberate act, so
// losing one should be too.
export function createSnapshot(rawId: string, rawBody: string): MemoSnapshot {
  const memoId = assertId(rawId);
  const body = assertBody(rawBody);

  ensureMemo(memoId);
  const snapshot: MemoSnapshot = {
    id: nanoid(),
    body,
    createdAt: nowIso(),
  };
  getMemosDb()
    .prepare(
      "INSERT INTO memo_snapshots (id, memo_id, body, created_at) VALUES (?, ?, ?, ?)"
    )
    .run(snapshot.id, memoId, snapshot.body, snapshot.createdAt);

  return snapshot;
}

export function listSnapshots(rawId: string): MemoSnapshot[] {
  const memoId = assertId(rawId);
  const rows = getMemosDb()
    .prepare(
      "SELECT id, body, created_at FROM memo_snapshots WHERE memo_id = ? ORDER BY created_at DESC, id DESC"
    )
    .all(memoId) as MemoSnapshotRow[];

  return rows.map((row) => ({
    id: row.id,
    body: row.body,
    createdAt: row.created_at,
  }));
}

export function deleteSnapshot(rawId: string): void {
  const id = assertId(rawId);
  getMemosDb().prepare("DELETE FROM memo_snapshots WHERE id = ?").run(id);
}

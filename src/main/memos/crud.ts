import { nanoid } from "nanoid";
import { MAX_UNDO, type TextEdit } from "@shared/text-history";
import { MAX_MEMO_BODY_CHARS } from "@shared/memo";
import { getMemosDb } from "./db";
import {
  MemoValidationError,
  type MemoAdoptInput,
  type MemoCommitEditInput,
  type MemoMoveCursorInput,
  type MemoOrphan,
  type MemoRow,
  type MemoSnapshot,
  type MemoSnapshotRow,
  type MemoState,
  type MemoWriteResult,
} from "./types";

// Enough of a body to recognise the memo by in the recovery list, and no more.
const PREVIEW_CHARS = 160;

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
  if (body.length > MAX_MEMO_BODY_CHARS) {
    // The renderer refuses the edit at the same cap, so reaching this is a bug
    // or a hijacked renderer, not a user who typed too much.
    throw new MemoValidationError(
      `memo body must be at most ${MAX_MEMO_BODY_CHARS} characters`
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

// The widget is a few grid cells wide, so show the first line with any text on
// it rather than the raw head of the body (which is often blank).
function previewOf(head: string): string {
  const line = head.split("\n").find((candidate) => candidate.trim().length > 0);
  return line?.trim() ?? "";
}

type MemoOrphanRow = {
  id: string;
  head: string;
  char_count: number;
  snapshot_count: number;
  updated_at: string;
};

/**
 * Memos no widget is bound to any more.
 *
 * `memos.id` is a widget instanceId, and the dashboard keeps those ids only in
 * localStorage — so removing the widget (or losing that key) leaves a row with
 * real text in it that nothing can ever open again. The renderer passes the ids
 * still on the dashboard; everything else with content in it is recoverable.
 */
export function listOrphans(rawLiveIds: unknown): MemoOrphan[] {
  if (!Array.isArray(rawLiveIds)) {
    throw new MemoValidationError("live memo ids must be an array");
  }
  const liveIds = rawLiveIds.map(assertId);

  // `NOT IN ()` is not valid SQLite, so an empty live set drops the clause —
  // which is right: with no memo widget on the dashboard, every memo is orphaned.
  const exclusion =
    liveIds.length > 0
      ? `WHERE m.id NOT IN (${liveIds.map(() => "?").join(", ")})`
      : "";

  const rows = getMemosDb()
    .prepare(
      `SELECT m.id,
              substr(m.body, 1, ${PREVIEW_CHARS}) AS head,
              length(m.body) AS char_count,
              (SELECT COUNT(*) FROM memo_snapshots s WHERE s.memo_id = m.id)
                AS snapshot_count,
              m.updated_at
       FROM memos m
       ${exclusion}
       ORDER BY m.updated_at DESC`
    )
    .all(...liveIds) as MemoOrphanRow[];

  // An orphan with neither text nor snapshots is a widget that was added and
  // removed without being typed into. There is nothing to recover, so it is not
  // offered — deleteMemo below is what eventually clears it.
  return rows
    .filter((row) => row.char_count > 0 || row.snapshot_count > 0)
    .map((row) => ({
      id: row.id,
      preview: previewOf(row.head),
      charCount: row.char_count,
      snapshotCount: row.snapshot_count,
      updatedAt: row.updated_at,
    }));
}

/**
 * Moves an orphan's text, undo history and snapshots onto a live widget's memo,
 * then drops the orphan row. This is the only way back to a memo whose widget
 * was removed, so it moves the history rather than copying the text: reopening
 * the memo should be reopening it, undo stack and all.
 *
 * Only an untouched memo can adopt. Merging two histories has no sane meaning,
 * and silently replacing text the user already wrote would be the same mis-click
 * loss this whole path exists to undo.
 */
export function adoptMemo(input: MemoAdoptInput): MemoState {
  const targetId = assertId(input.targetId);
  const sourceId = assertId(input.sourceId);
  if (targetId === sourceId) {
    throw new MemoValidationError("a memo cannot adopt itself");
  }

  ensureMemo(targetId);
  const db = getMemosDb();

  db.transaction(() => {
    const source = db
      .prepare("SELECT body, history_cursor, updated_at FROM memos WHERE id = ?")
      .get(sourceId) as
      | Pick<MemoRow, "body" | "history_cursor" | "updated_at">
      | undefined;
    if (source === undefined) {
      throw new MemoValidationError("that memo no longer exists");
    }

    const target = db
      .prepare(
        `SELECT (SELECT length(body) FROM memos WHERE id = $id) AS chars,
                (SELECT COUNT(*) FROM memo_edits WHERE memo_id = $id) AS edits,
                (SELECT COUNT(*) FROM memo_snapshots WHERE memo_id = $id) AS snaps`
      )
      .get({ id: targetId }) as {
      chars: number;
      edits: number;
      snaps: number;
    };
    if (target.chars > 0 || target.edits > 0 || target.snaps > 0) {
      throw new MemoValidationError(
        "only an empty memo can take over another memo's text"
      );
    }

    // Children first: memo_edits and memo_snapshots reference memos(id), so the
    // source row can only go once nothing points at it. The target is empty, so
    // neither move can collide with a row already there.
    db.prepare("UPDATE memo_edits SET memo_id = ? WHERE memo_id = ?").run(
      targetId,
      sourceId
    );
    db.prepare("UPDATE memo_snapshots SET memo_id = ? WHERE memo_id = ?").run(
      targetId,
      sourceId
    );
    // `updated_at` comes across untouched: adopting is not an edit, and "Saved
    // 3d ago" is the truth about this text.
    db.prepare(
      "UPDATE memos SET body = ?, history_cursor = ?, updated_at = ? WHERE id = ?"
    ).run(source.body, source.history_cursor, source.updated_at, targetId);
    db.prepare("DELETE FROM memos WHERE id = ?").run(sourceId);
  })();

  return loadMemo(targetId);
}

// Discards a memo outright, snapshots and history with it (ON DELETE CASCADE).
// Nothing here can tell a live memo from an orphan — the renderer only offers
// this for a memo no widget on its dashboard is bound to.
export function deleteMemo(rawId: string): void {
  const id = assertId(rawId);
  getMemosDb().prepare("DELETE FROM memos WHERE id = ?").run(id);
}

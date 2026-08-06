// Pure DDL for memos.db, split out from db.ts so it carries no Electron
// dependency (same arrangement as src/main/todos/schema.ts). There is no
// migration framework here: `SCHEMA` is idempotent DDL run on every open, and
// any future shape change lands as a guarded, run-once-then-inert step below.
//
// `memos.id` is the memo-pad widget's instanceId. Removing the widget from the
// dashboard does not delete the row — a scratch memory store should not lose
// text to a mis-click on the widget menu. That id lives only in the renderer's
// localStorage, though, so a re-added widget is a different instanceId and a
// blank memo: keeping the row is not enough on its own. `listOrphans` and
// `adoptMemo` in crud.ts are the way back to it, and the only way; without them
// the row survives but nothing can ever open it.
//
// `memo_edits` is the undo history as splices ("at `start`, `removed` became
// `inserted`"), keyed by a per-memo `seq`. `memos.history_cursor` points at the
// last one applied to `body`; rows above it are the redo tail. Retention is
// enforced on write, not here: MAX_UNDO steps are kept behind the cursor.
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS memos (
  id             TEXT PRIMARY KEY,
  body           TEXT NOT NULL DEFAULT '',
  history_cursor INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memo_edits (
  memo_id    TEXT NOT NULL REFERENCES memos(id) ON DELETE CASCADE,
  seq        INTEGER NOT NULL,
  start      INTEGER NOT NULL,
  removed    TEXT NOT NULL,
  inserted   TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (memo_id, seq)
);

CREATE TABLE IF NOT EXISTS memo_snapshots (
  id         TEXT PRIMARY KEY,
  memo_id    TEXT NOT NULL REFERENCES memos(id) ON DELETE CASCADE,
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_memo_snapshots_memo
  ON memo_snapshots(memo_id, created_at DESC);
`;

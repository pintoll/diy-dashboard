import Database from "better-sqlite3";
import { app } from "electron";
import path from "path";

let db: Database.Database | undefined;

// Idempotent DDL, run on every open. Unlike the other three DBs this one also
// stamps `PRAGMA user_version`: it is the first in the project to do so, which
// gives a column add a version to branch on instead of sniffing the table.
// There is no migration runner yet (deferred in the OSS-readiness audit) -- the
// CREATE ... IF NOT EXISTS below is the baseline for a fresh DB, and
// `migrateSchema` hand-applies the per-version ALTERs for an existing one.
//
// `todo_id` (v1, single active-todo link) is retained but no longer written:
// the desk model replaced it with `todo_ids`, the JSON array of every todo that
// was on the desk during the session (docs/design/multi-pomo-todo.md). Old rows
// keep todo_id; the v2 migration seeds todo_ids from it.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS sessions (
  id               TEXT PRIMARY KEY,
  phase            TEXT NOT NULL DEFAULT 'work',
  started_at       INTEGER NOT NULL,
  ended_at         INTEGER NOT NULL,
  duration_sec     INTEGER NOT NULL,
  preset_id        TEXT NOT NULL,
  overtime_sec     INTEGER NOT NULL DEFAULT 0,
  idle_sec         INTEGER NOT NULL DEFAULT 0,
  intended_mode    TEXT,
  attention        TEXT NOT NULL DEFAULT 'focus',
  attention_source TEXT NOT NULL DEFAULT 'auto',
  session_end_type TEXT NOT NULL DEFAULT 'completed',
  process_buckets  TEXT NOT NULL DEFAULT '{}',
  capped_at_60m    INTEGER NOT NULL DEFAULT 0,
  todo_id          TEXT,
  todo_ids         TEXT,
  note             TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_ended ON sessions(ended_at);
`;

const SCHEMA_VERSION = 2;

function hasColumn(database: Database.Database, table: string, column: string): boolean {
  const cols = database.pragma(`table_info(${table})`) as { name: string }[];
  return cols.some((c) => c.name === column);
}

// Per-version hand-managed migrations, applied in order for an existing DB whose
// stamped user_version is behind. A fresh DB gets the current schema straight
// from CREATE, so every step here is guarded to be a no-op if already applied.
function migrateSchema(database: Database.Database, from: number): void {
  // v1 -> v2: desk model. Add the todo_ids array column and seed each existing
  // row from its single todo_id ([todo_id], or NULL when there was none).
  if (from < 2) {
    if (!hasColumn(database, "sessions", "todo_ids")) {
      database.exec("ALTER TABLE sessions ADD COLUMN todo_ids TEXT");
    }
    database.exec(
      "UPDATE sessions SET todo_ids = json_array(todo_id) WHERE todo_ids IS NULL AND todo_id IS NOT NULL"
    );
  }
}

export function getPomodoroDb(): Database.Database {
  if (db) return db;

  const dbPath = path.join(app.getPath("userData"), "pomodoro.db");
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);

  const current = db.pragma("user_version", { simple: true }) as number;
  if (current < SCHEMA_VERSION) {
    migrateSchema(db, current);
    db.pragma(`user_version = ${SCHEMA_VERSION}`);
  }

  return db;
}

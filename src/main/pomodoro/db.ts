import Database from "better-sqlite3";
import { app } from "electron";
import path from "path";

let db: Database.Database | undefined;

// Idempotent DDL, run on every open. Unlike the other three DBs this one also
// stamps `PRAGMA user_version`: it is the first in the project to do so, which
// gives a future column add a version to branch on instead of sniffing the
// table. There is no migration runner yet (deferred in the OSS-readiness audit)
// -- the CREATE ... IF NOT EXISTS below is still the baseline and the version is
// simply stamped to 1.
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
  note             TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_ended ON sessions(ended_at);
`;

const SCHEMA_VERSION = 1;

export function getPomodoroDb(): Database.Database {
  if (db) return db;

  const dbPath = path.join(app.getPath("userData"), "pomodoro.db");
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);

  const current = db.pragma("user_version", { simple: true }) as number;
  if (current < SCHEMA_VERSION) db.pragma(`user_version = ${SCHEMA_VERSION}`);

  return db;
}

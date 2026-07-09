import Database from "better-sqlite3";
import { app } from "electron";
import path from "path";

let db: Database.Database | undefined;

// Idempotent DDL, run on every open. There is no migration framework in this
// project; adding a column later has to be handled by hand.
//
// `date` is the day the todo was planned for and is never mutated by overdue
// carry-over; the today view *displays* open past todos, it does not move
// them. `completed_on` records the day it was actually finished, so past-day
// views stay an honest record.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS todos (
  id           TEXT PRIMARY KEY,
  date         TEXT NOT NULL,
  title        TEXT NOT NULL,
  note         TEXT,
  done         INTEGER NOT NULL DEFAULT 0,
  completed_on TEXT,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  worked_sec   INTEGER NOT NULL DEFAULT 0,
  source       TEXT NOT NULL DEFAULT 'user' CHECK (source IN ('user','agent')),
  created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_todos_date ON todos(date);
CREATE INDEX IF NOT EXISTS idx_todos_open ON todos(done, date);

CREATE TABLE IF NOT EXISTS todo_sessions (
  session_id TEXT PRIMARY KEY,
  todo_id    TEXT NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
  started_at INTEGER NOT NULL,
  ended_at   INTEGER NOT NULL,
  worked_sec INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_todo_sessions_todo ON todo_sessions(todo_id);

CREATE TABLE IF NOT EXISTS active_todo (
  id           INTEGER PRIMARY KEY CHECK (id = 1),
  todo_id      TEXT REFERENCES todos(id) ON DELETE SET NULL,
  activated_at TEXT
);
`;

export function getTodosDb(): Database.Database {
  if (db) return db;

  const dbPath = path.join(app.getPath("userData"), "todos.db");
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  // Single-row table: the row's existence is the invariant, not its content.
  db.prepare(
    "INSERT OR IGNORE INTO active_todo (id, todo_id) VALUES (1, NULL)"
  ).run();

  return db;
}

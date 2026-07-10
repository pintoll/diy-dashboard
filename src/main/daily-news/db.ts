import Database from "better-sqlite3";
import { app } from "electron";
import path from "path";

let db: Database.Database | undefined;

// SQLite recreation of the live Postgres DDL. TEXT holds ISO timestamps /
// yyyy-MM-dd dates (KST values are computed in JS and passed as bound params),
// REAL holds fractional scores, INTEGER PRIMARY KEY AUTOINCREMENT for ids.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS articles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  summary TEXT,
  url TEXT NOT NULL UNIQUE,
  source TEXT,
  category TEXT,
  published_at TEXT,
  relevance INTEGER,
  importance INTEGER,
  final_score REAL,
  tag TEXT,
  fetched_date TEXT NOT NULL DEFAULT CURRENT_DATE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id INTEGER NOT NULL REFERENCES articles(id),
  action TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(article_id, action)
);

CREATE TABLE IF NOT EXISTS user_profile (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_type TEXT NOT NULL UNIQUE,
  content TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS interest_signals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic TEXT NOT NULL UNIQUE,
  category TEXT,
  score REAL NOT NULL DEFAULT 0,
  hit_count INTEGER NOT NULL DEFAULT 0,
  last_seen TEXT NOT NULL DEFAULT CURRENT_DATE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Serves both hot paths on a table that grows forever: the scheduler's
-- COUNT(*) WHERE fetched_date=? and the widget's WHERE fetched_date=?
-- ORDER BY final_score DESC (reverse index scan, no filesort).
CREATE INDEX IF NOT EXISTS idx_articles_fetched_date
  ON articles(fetched_date, final_score);
`;

// Fresh-start seed: only the 2 profile rows with the current live content.
// articles / feedback / interest_signals start empty.
function seedProfile(handle: Database.Database): void {
  const insert = handle.prepare(
    "INSERT OR IGNORE INTO user_profile (profile_type, content) VALUES (?, ?)"
  );
  insert.run(
    "core",
    "AI dev tools, web frontend, automation workflows, Electron, productivity"
  );
  insert.run("short_term", "n8n pipelines, personal dashboard development");
}

export function getDb(): Database.Database {
  if (db) return db;

  const dbPath = path.join(app.getPath("userData"), "daily-news.db");
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  // Off by default in SQLite; without it the feedback→articles FK is
  // decorative. The other two app DBs already enable it.
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  seedProfile(db);

  return db;
}

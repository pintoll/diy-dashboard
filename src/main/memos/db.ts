import Database from "better-sqlite3";
import { app } from "electron";
import path from "path";
import { SCHEMA } from "./schema";

let db: Database.Database | undefined;

export function getMemosDb(): Database.Database {
  if (db) return db;

  const dbPath = path.join(app.getPath("userData"), "memos.db");
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);

  return db;
}

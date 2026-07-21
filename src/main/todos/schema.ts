import type Database from "better-sqlite3";

// Pure DDL + hand-managed migrations for todos.db, split out from db.ts so it
// carries no Electron dependency and can be exercised directly against a
// better-sqlite3 connection. db.ts owns the connection; this owns its shape.
//
// There is no migration framework in this project. `SCHEMA` is idempotent DDL
// run on every open; `migrateSchema` guards each change on the live schema so
// it is a no-op once applied (and on a fresh DB entirely).
//
// `todo_sessions` keys on a renderer-generated `attribution_id` (not
// `session_id`), because one pomodoro can now credit several todos and one todo
// can accrue several in-flight intervals per session (see the "desk" model in
// docs/design/multi-pomo-todo.md). `todos.worked_sec` is the additive rollup.
//
// `desk` is the set of todos currently receiving the running work clock
// (replaces the single-row `active_todo`). `joined_at` clamps the start of a
// member's in-flight interval.
//
// `todos.date` is nullable: NULL is the backlog, the bucket for work with no
// planned day (see docs/design/todo-backlog.md). Every date query already
// excludes it for free — NULL matches neither `= ?` nor `BETWEEN` nor `< ?` —
// so a parked todo can never leak into a day list or into Overdue.
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS todos (
  id           TEXT PRIMARY KEY,
  date         TEXT,
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
  attribution_id TEXT PRIMARY KEY,
  session_id     TEXT NOT NULL,
  todo_id        TEXT NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
  started_at     INTEGER NOT NULL,
  ended_at       INTEGER NOT NULL,
  worked_sec     INTEGER NOT NULL,
  created_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_todo_sessions_todo ON todo_sessions(todo_id);
CREATE INDEX IF NOT EXISTS idx_todo_sessions_session ON todo_sessions(session_id);

CREATE TABLE IF NOT EXISTS desk (
  todo_id   TEXT PRIMARY KEY REFERENCES todos(id) ON DELETE CASCADE,
  joined_at TEXT NOT NULL
);
`;

function tableExists(db: Database.Database, name: string): boolean {
  return !!db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(name);
}

type ColumnInfo = { name: string; notnull: number };

function columns(db: Database.Database, table: string): ColumnInfo[] {
  return db.prepare(`PRAGMA table_info(${table})`).all() as ColumnInfo[];
}

function columnNames(db: Database.Database, table: string): string[] {
  return columns(db, table).map((c) => c.name);
}

// Run-once-then-inert migrations. Each guards on the live schema, so calling
// this on every open is safe and a fresh DB skips all of it.
export function migrateSchema(db: Database.Database): void {
  // 1. todo_sessions PK: session_id -> attribution_id. SQLite can't rename a
  //    primary key in place, so rebuild: copy each old row with a synthetic
  //    attribution_id (`<session_id>:<todo_id>:0`, the pre-desk single interval)
  //    and preserve every column. worked_sec already sums to todos.worked_sec,
  //    so the rollup is NOT recomputed.
  if (!columnNames(db, "todo_sessions").includes("attribution_id")) {
    db.transaction(() => {
      db.exec(`
        CREATE TABLE todo_sessions_new (
          attribution_id TEXT PRIMARY KEY,
          session_id     TEXT NOT NULL,
          todo_id        TEXT NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
          started_at     INTEGER NOT NULL,
          ended_at       INTEGER NOT NULL,
          worked_sec     INTEGER NOT NULL,
          created_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        INSERT INTO todo_sessions_new
          (attribution_id, session_id, todo_id, started_at, ended_at, worked_sec, created_at)
          SELECT session_id || ':' || todo_id || ':0', session_id, todo_id,
                 started_at, ended_at, worked_sec, created_at
          FROM todo_sessions;
        DROP TABLE todo_sessions;
        ALTER TABLE todo_sessions_new RENAME TO todo_sessions;
        CREATE INDEX IF NOT EXISTS idx_todo_sessions_todo ON todo_sessions(todo_id);
        CREATE INDEX IF NOT EXISTS idx_todo_sessions_session ON todo_sessions(session_id);
      `);
    })();
  }

  // 2. active_todo (single row) -> desk (membership set). Seed the desk from the
  //    one active row (if any, non-null), then drop the old table.
  if (tableExists(db, "active_todo")) {
    db.transaction(() => {
      const row = db
        .prepare("SELECT todo_id, activated_at FROM active_todo WHERE id = 1")
        .get() as { todo_id: string | null; activated_at: string | null } | undefined;
      if (row?.todo_id) {
        db.prepare("INSERT OR IGNORE INTO desk (todo_id, joined_at) VALUES (?, ?)").run(
          row.todo_id,
          row.activated_at ?? new Date().toISOString()
        );
      }
      db.exec("DROP TABLE active_todo");
    })();
  }

  // 3. todos.date: NOT NULL -> nullable, so NULL can mean "backlog"
  //    (docs/design/todo-backlog.md). SQLite cannot relax a column constraint in
  //    place, so the table is rebuilt.
  //
  //    Unlike migration 1, the table being rebuilt is a *parent*: both
  //    todo_sessions and desk reference todos(id) ON DELETE CASCADE, and db.ts
  //    turns `foreign_keys = ON` before calling this. A plain DROP TABLE would
  //    therefore cascade away the entire worked-time ledger. Hence the pragma
  //    dance — and it has to sit outside the transaction, because SQLite
  //    silently ignores a foreign_keys change made inside one.
  const dateColumn = columns(db, "todos").find((c) => c.name === "date");
  if (dateColumn && dateColumn.notnull === 1) {
    const COLUMNS =
      "id, date, title, note, done, completed_on, sort_order, worked_sec, source, created_at, updated_at";
    db.pragma("foreign_keys = OFF");
    try {
      db.transaction(() => {
        db.exec(`
          CREATE TABLE todos_new (
            id           TEXT PRIMARY KEY,
            date         TEXT,
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
          INSERT INTO todos_new (${COLUMNS}) SELECT ${COLUMNS} FROM todos;
          DROP TABLE todos;
          ALTER TABLE todos_new RENAME TO todos;
          CREATE INDEX IF NOT EXISTS idx_todos_date ON todos(date);
          CREATE INDEX IF NOT EXISTS idx_todos_open ON todos(done, date);
        `);
        // Every child row must still resolve to a todo. If one does not, the
        // rebuild lost rows and rolling back is the only safe outcome.
        const orphans = db.pragma("foreign_key_check") as unknown[];
        if (orphans.length > 0) {
          throw new Error(
            `todos rebuild left ${orphans.length} orphaned foreign key rows; rolled back`
          );
        }
      })();
    } finally {
      db.pragma("foreign_keys = ON");
    }
  }
}

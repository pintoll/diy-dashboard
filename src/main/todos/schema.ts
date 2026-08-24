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
//
// `ops` is the append-only journal of intent-level todo and plan changes —
// full before/after row snapshots, written inside the same transaction as the
// change (see journal.ts). `reasons` groups ops under one natural-language
// intent line (docs/design/assistant-architecture.md). `ops.entity_id`
// deliberately has no FK so history survives deletion, and `seq` is
// AUTOINCREMENT so it stays monotonic even if rows are ever pruned — rewind
// anchors must not be reusable.
//
// `plan_entries` pencils todos onto clock-time ranges within one 05:00 day; a
// time below "05:00" means the small hours of the next calendar day
// (@shared/plan-time). `todo_id` deliberately has no FK: deleting a todo
// sweeps its entries in the service layer (crud.ts deleteTodo) so each removal
// lands in `ops` — a cascade would erase them silently. `day_folds` closes a
// day: a snapshot computed by code plus conversational remarks (fold.ts).
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
  source       TEXT NOT NULL DEFAULT 'user' CHECK (source IN ('user','agent','assistant')),
  created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_todos_date ON todos(date);
CREATE INDEX IF NOT EXISTS idx_todos_open ON todos(done, date);

CREATE TABLE IF NOT EXISTS reasons (
  id         TEXT PRIMARY KEY,
  source     TEXT NOT NULL CHECK (source IN ('assistant','agent')),
  session_id TEXT,
  text       TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ops (
  seq        INTEGER PRIMARY KEY AUTOINCREMENT,
  entity     TEXT NOT NULL CHECK (entity IN ('todo','plan')),
  entity_id  TEXT NOT NULL,
  op         TEXT NOT NULL CHECK (op IN ('create','update','delete')),
  before     TEXT,
  after      TEXT,
  source     TEXT NOT NULL CHECK (source IN ('user','agent','assistant')),
  reason_id  TEXT,
  at         TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ops_at ON ops(at);

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
CREATE INDEX IF NOT EXISTS idx_todo_sessions_started ON todo_sessions(started_at);

CREATE TABLE IF NOT EXISTS desk (
  todo_id   TEXT PRIMARY KEY REFERENCES todos(id) ON DELETE CASCADE,
  joined_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS plan_entries (
  id      TEXT PRIMARY KEY,
  day     TEXT NOT NULL,
  todo_id TEXT NOT NULL,
  start   TEXT NOT NULL,
  end     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_plan_entries_day  ON plan_entries(day);
CREATE INDEX IF NOT EXISTS idx_plan_entries_todo ON plan_entries(todo_id);

CREATE TABLE IF NOT EXISTS day_folds (
  day       TEXT PRIMARY KEY,
  snapshot  TEXT NOT NULL,
  remarks   TEXT,
  folded_at TEXT NOT NULL
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

  // 4. todos.source CHECK: admit 'assistant'. SQLite cannot alter a CHECK in
  //    place, so rebuild — the same parent-table pragma dance as migration 3.
  //    Guard on the stored table SQL: a fresh DB is created by the SCHEMA
  //    constant above, whose CHECK already names 'assistant', so this only
  //    fires on DBs built before the assistant existed. A very old DB runs
  //    migrations 3 and 4 as two consecutive rebuilds; accepted, because
  //    shipped migrations stay immutable.
  const todosSql =
    (
      db
        .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'todos'")
        .get() as { sql: string } | undefined
    )?.sql ?? "";
  if (!todosSql.includes("'assistant'")) {
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
            source       TEXT NOT NULL DEFAULT 'user' CHECK (source IN ('user','agent','assistant')),
            created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
          );
          INSERT INTO todos_new (${COLUMNS}) SELECT ${COLUMNS} FROM todos;
          DROP TABLE todos;
          ALTER TABLE todos_new RENAME TO todos;
          CREATE INDEX IF NOT EXISTS idx_todos_date ON todos(date);
          CREATE INDEX IF NOT EXISTS idx_todos_open ON todos(done, date);
        `);
        // Same invariant as migration 3: no child row may be orphaned by the
        // rebuild.
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

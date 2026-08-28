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
// `session_id` groups one block's rows and is minted by the attribution engine
// at block start; it is NOT pomodoro.db's `sessions.id`, which is minted
// separately when the session log record is written. The two databases share no
// key - the session record's `todo_ids` is the only link between them.
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
//
// `projects` is the steering layer above the day (docs/design/projects-para.md):
// PARA folded to one table, where `kind` separates a project (has an end) from
// an area (doesn't) and archiving is a `status`, not a second bucket.
// `todos.project_id` files a todo under one; it deliberately has no FK, like
// `plan_entries.todo_id`, so deleting a project detaches its todos through the
// journaled service layer instead of a silent cascade. An undated todo with no
// project is the inbox; with one, that project's backlog.
//
// `project_docs` holds a project's freeform prose — goals, decisions, state —
// as rows rather than files, so the agent API stays the single data plane and
// every edit lands in `ops`. Each project auto-creates one `notes` doc.
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
  project_id   TEXT,
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
  entity     TEXT NOT NULL CHECK (entity IN ('todo','plan','project','project_doc')),
  entity_id  TEXT NOT NULL,
  op         TEXT NOT NULL CHECK (op IN ('create','update','delete')),
  before     TEXT,
  after      TEXT,
  source     TEXT NOT NULL CHECK (source IN ('user','agent','assistant')),
  reason_id  TEXT,
  at         TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ops_at ON ops(at);
-- Last-op-per-entity lookups (deleted-todo title fallback in log.ts; what a
-- rewind replay will want too). seq is the rowid alias and rowid is every
-- index entry's implicit tiebreaker, so MAX(seq) within a prefix reads this
-- index backwards without naming seq explicitly.
CREATE INDEX IF NOT EXISTS idx_ops_entity ON ops(entity, entity_id);

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

CREATE TABLE IF NOT EXISTS projects (
  id          TEXT PRIMARY KEY,
  kind        TEXT NOT NULL DEFAULT 'project' CHECK (kind IN ('project','area')),
  title       TEXT NOT NULL,
  outcome     TEXT,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','someday','done','archived')),
  target_date TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archived_at TEXT
);

CREATE TABLE IF NOT EXISTS project_docs (
  id         TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_project_docs_project ON project_docs(project_id);
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

  // 5. todos.project_id: file a todo under a project
  //    (docs/design/projects-para.md). Purely additive, so a plain ALTER — no
  //    rebuild, no pragma dance, and the column lands nullable by definition
  //    (SQLite forbids adding a NOT NULL column without a default anyway).
  if (!columnNames(db, "todos").includes("project_id")) {
    db.exec("ALTER TABLE todos ADD COLUMN project_id TEXT");
  }

  // 6. ops.entity CHECK: admit 'project' and 'project_doc', so project and doc
  //    writes land in the same append-only journal as todos and plan entries.
  //    A CHECK can't be altered in place, so rebuild like migration 4 — with
  //    two differences worth stating:
  //
  //    - `ops` has no foreign key in either direction, so DROP TABLE cascades
  //      nothing and the migration-3/4 pragma dance is unnecessary.
  //    - `seq` is AUTOINCREMENT. Copying the rows sets the new table's counter
  //      to MAX(seq) of what was copied, which silently rewinds it if journal
  //      rows were ever pruned from the tail — and rewind anchors must never be
  //      reusable. So the old sqlite_sequence counter is captured first and
  //      restored by hand afterwards.
  //
  //    Guard on 'project_doc' rather than 'project': the latter is a substring
  //    of the former, so a half-widened CHECK could never be told apart.
  const opsSql =
    (
      db
        .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'ops'")
        .get() as { sql: string } | undefined
    )?.sql ?? "";
  if (!opsSql.includes("'project_doc'")) {
    const COLUMNS = "seq, entity, entity_id, op, before, after, source, reason_id, at";
    db.transaction(() => {
      const counter = tableExists(db, "sqlite_sequence")
        ? (db.prepare("SELECT seq FROM sqlite_sequence WHERE name = 'ops'").get() as
            | { seq: number }
            | undefined)
        : undefined;
      db.exec(`
        CREATE TABLE ops_new (
          seq        INTEGER PRIMARY KEY AUTOINCREMENT,
          entity     TEXT NOT NULL CHECK (entity IN ('todo','plan','project','project_doc')),
          entity_id  TEXT NOT NULL,
          op         TEXT NOT NULL CHECK (op IN ('create','update','delete')),
          before     TEXT,
          after      TEXT,
          source     TEXT NOT NULL CHECK (source IN ('user','agent','assistant')),
          reason_id  TEXT,
          at         TEXT NOT NULL
        );
        INSERT INTO ops_new (${COLUMNS}) SELECT ${COLUMNS} FROM ops;
        DROP TABLE ops;
        ALTER TABLE ops_new RENAME TO ops;
        CREATE INDEX IF NOT EXISTS idx_ops_at ON ops(at);
        CREATE INDEX IF NOT EXISTS idx_ops_entity ON ops(entity, entity_id);
      `);
      if (counter !== undefined) {
        // The rebuild always leaves a row for `ops` when any row was copied,
        // and none when the journal was empty; cover both.
        db.prepare("UPDATE sqlite_sequence SET seq = max(seq, ?) WHERE name = 'ops'").run(
          counter.seq
        );
        db.prepare(
          `INSERT INTO sqlite_sequence (name, seq)
           SELECT 'ops', ?
           WHERE NOT EXISTS (SELECT 1 FROM sqlite_sequence WHERE name = 'ops')`
        ).run(counter.seq);
      }
    })();
  }

  // Unconditional, and deliberately not part of SCHEMA: SCHEMA runs before
  // migration 5, so on a pre-projects DB the column does not exist yet and the
  // whole db.exec(SCHEMA) would fail. It can't live inside migration 5's guard
  // either — a fresh DB skips that block entirely.
  db.exec("CREATE INDEX IF NOT EXISTS idx_todos_project ON todos(project_id)");
}

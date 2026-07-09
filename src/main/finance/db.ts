import Database from "better-sqlite3";
import { app } from "electron";
import path from "path";
import type { AccountKind, CategoryKind } from "./types";

let db: Database.Database | undefined;

// Idempotent DDL, run on every open. There is no migration framework in this
// project; adding a column later has to be handled by hand.
//
// Money is stored as an INTEGER count of the row currency's minor unit, never
// as REAL, because summing floats accumulates error. Cross-currency rows are
// normalized to KRW at query time using the manually configured rate, so
// editing the rate reflows the whole history consistently.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('cash','savings','investment','crypto','liability')),
  currency TEXT NOT NULL DEFAULT 'KRW' CHECK (currency IN ('KRW','USD')),
  opening_balance INTEGER NOT NULL DEFAULT 0,
  is_archived INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  group_name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'expense' CHECK (kind IN ('expense','income')),
  is_fixed INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE(name, kind)
);

CREATE TABLE IF NOT EXISTS recurring_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'expense' CHECK (kind IN ('income','expense','transfer')),
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'KRW' CHECK (currency IN ('KRW','USD')),
  variable INTEGER NOT NULL DEFAULT 0,
  billing_day INTEGER NOT NULL DEFAULT 1 CHECK (billing_day BETWEEN 1 AND 31),
  category_id INTEGER REFERENCES categories(id),
  from_account_id INTEGER REFERENCES accounts(id),
  to_account_id INTEGER REFERENCES accounts(id),
  start_ym TEXT NOT NULL,
  end_ym TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind IN ('income','expense','transfer')),
  date TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount >= 0),
  currency TEXT NOT NULL DEFAULT 'KRW' CHECK (currency IN ('KRW','USD')),
  from_account_id INTEGER REFERENCES accounts(id),
  to_account_id INTEGER REFERENCES accounts(id),
  category_id INTEGER REFERENCES categories(id),
  memo TEXT,
  recurring_rule_id INTEGER REFERENCES recurring_rules(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (
    (kind='income'   AND to_account_id   IS NOT NULL AND from_account_id IS NULL) OR
    (kind='expense'  AND from_account_id IS NOT NULL AND to_account_id   IS NULL) OR
    (kind='transfer' AND from_account_id IS NOT NULL AND to_account_id   IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS account_valuations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  as_of_date TEXT NOT NULL,
  balance INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'KRW' CHECK (currency IN ('KRW','USD')),
  memo TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(account_id, as_of_date)
);

CREATE TABLE IF NOT EXISTS recurring_skips (
  rule_id INTEGER NOT NULL REFERENCES recurring_rules(id),
  ym TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (rule_id, ym)
);

CREATE INDEX IF NOT EXISTS idx_tx_date       ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_tx_from       ON transactions(from_account_id);
CREATE INDEX IF NOT EXISTS idx_tx_to         ON transactions(to_account_id);
CREATE INDEX IF NOT EXISTS idx_tx_rule_date  ON transactions(recurring_rule_id, date);
CREATE INDEX IF NOT EXISTS idx_val_acct_date ON account_valuations(account_id, as_of_date);
`;

type SeedAccount = { name: string; kind: AccountKind };

const DEFAULT_ACCOUNTS: SeedAccount[] = [
  { name: "Cash", kind: "cash" },
  { name: "Savings", kind: "savings" },
  { name: "Brokerage", kind: "investment" },
  { name: "Crypto", kind: "crypto" },
  { name: "Loan", kind: "liability" },
];

type SeedCategory = {
  name: string;
  group: string;
  kind: CategoryKind;
  fixed: boolean;
};

// Tuned for a solo developer whose recurring burn is mostly AI and infra.
// `fixed` marks a charge that repeats every month at a stable amount, which is
// what makes "monthly fixed burn" a single aggregate rather than a guess.
const DEFAULT_CATEGORIES: SeedCategory[] = [
  { name: "AI Assistants", group: "AI & Dev Tools", kind: "expense", fixed: true },
  { name: "Cloud & Hosting", group: "AI & Dev Tools", kind: "expense", fixed: true },
  { name: "APIs & Compute", group: "AI & Dev Tools", kind: "expense", fixed: false },
  { name: "Dev Tooling & Repos", group: "AI & Dev Tools", kind: "expense", fixed: true },
  { name: "Domains", group: "AI & Dev Tools", kind: "expense", fixed: true },

  { name: "Productivity SaaS", group: "Software & Subs", kind: "expense", fixed: true },
  { name: "Media & Entertainment", group: "Software & Subs", kind: "expense", fixed: true },

  { name: "Rent & Maintenance", group: "Living", kind: "expense", fixed: true },
  { name: "Utilities", group: "Living", kind: "expense", fixed: true },
  { name: "Groceries", group: "Living", kind: "expense", fixed: false },
  { name: "Dining & Cafe", group: "Living", kind: "expense", fixed: false },
  { name: "Transport", group: "Living", kind: "expense", fixed: false },

  { name: "Health & Fitness", group: "Personal", kind: "expense", fixed: true },
  { name: "Shopping", group: "Personal", kind: "expense", fixed: false },
  { name: "Education & Books", group: "Personal", kind: "expense", fixed: false },
  { name: "Misc", group: "Personal", kind: "expense", fixed: false },

  { name: "Salary", group: "Income", kind: "income", fixed: true },
  { name: "Freelance & Contract", group: "Income", kind: "income", fixed: false },
  { name: "Investment Income", group: "Income", kind: "income", fixed: false },
  { name: "Other Income", group: "Income", kind: "income", fixed: false },
];

function seedFinance(handle: Database.Database): void {
  // Categories are re-asserted on every open. UNIQUE(name, kind) makes this a
  // no-op once seeded, and it lets a later release add a category.
  const insertCategory = handle.prepare(
    `INSERT OR IGNORE INTO categories (name, group_name, kind, is_fixed, sort_order)
     VALUES (?, ?, ?, ?, ?)`
  );
  handle.transaction(() => {
    DEFAULT_CATEGORIES.forEach((c, i) =>
      insertCategory.run(c.name, c.group, c.kind, c.fixed ? 1 : 0, i)
    );
  })();

  // Accounts bootstrap only on a fresh database, so renaming or archiving a
  // default account does not resurrect it on the next launch.
  const { count } = handle
    .prepare("SELECT COUNT(*) AS count FROM accounts")
    .get() as { count: number };
  if (count > 0) return;

  const insertAccount = handle.prepare(
    "INSERT INTO accounts (name, kind, currency, sort_order) VALUES (?, ?, 'KRW', ?)"
  );
  handle.transaction(() => {
    DEFAULT_ACCOUNTS.forEach((a, i) => insertAccount.run(a.name, a.kind, i));
  })();
}

export function getFinanceDb(): Database.Database {
  if (db) return db;

  const dbPath = path.join(app.getPath("userData"), "finance.db");
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  seedFinance(db);

  return db;
}

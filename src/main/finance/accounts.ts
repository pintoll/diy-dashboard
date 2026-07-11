import { getFinanceDb } from "./db";
import { buildSetClause, toKrw } from "./sql";
import {
  sqlKindList,
  VALUED_KINDS,
  type Account,
  type AccountBalance,
  type AccountInput,
  type AccountRow,
} from "./types";

const ACCOUNT_COLUMNS: Record<keyof AccountInput, string> = {
  name: "name",
  kind: "kind",
  currency: "currency",
  openingBalance: "opening_balance",
  sortOrder: "sort_order",
};

function toAccount(row: AccountRow): Account {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    currency: row.currency,
    openingBalance: row.opening_balance,
    isArchived: row.is_archived === 1,
    sortOrder: row.sort_order,
  };
}

export function listAccounts(): Account[] {
  const rows = getFinanceDb()
    .prepare(
      `SELECT id, name, kind, currency, opening_balance, is_archived, sort_order
       FROM accounts
       WHERE is_archived = 0
       ORDER BY sort_order, id`
    )
    .all() as AccountRow[];
  return rows.map(toAccount);
}

export function createAccount(input: AccountInput): number {
  if (!input.name.trim()) throw new Error("Account name is required");
  if (!Number.isInteger(input.openingBalance)) {
    throw new Error("Opening balance must be an integer in minor units");
  }

  const info = getFinanceDb()
    .prepare(
      `INSERT INTO accounts (name, kind, currency, opening_balance, sort_order)
       VALUES (@name, @kind, @currency, @openingBalance, @sortOrder)`
    )
    .run({
      name: input.name.trim(),
      kind: input.kind,
      currency: input.currency,
      openingBalance: input.openingBalance,
      sortOrder: input.sortOrder ?? 0,
    });

  return Number(info.lastInsertRowid);
}

export function updateAccount(id: number, patch: Partial<AccountInput>): void {
  const { clause, params } = buildSetClause(patch, ACCOUNT_COLUMNS);
  if (!clause) return;
  getFinanceDb()
    .prepare(`UPDATE accounts SET ${clause} WHERE id = @id`)
    .run({ ...params, id });
}

// Accounts are archived rather than deleted: transactions reference them, and a
// closed account still explains historical balances.
//
// A funded account is refused: archiving drops it out of listAccounts and
// computeBalances (both filter is_archived = 0), so a non-zero balance would
// silently move net worth. The user must zero it first (transfer the balance
// out, or settle the debt). balanceKrw is 0 exactly when the native balance is
// 0, so this is rate-independent in practice.
export function archiveAccount(id: number, rate: number): void {
  const target = computeBalances(rate).find((b) => b.id === id);
  if (target && target.balanceKrw !== 0) {
    throw new Error(
      "This account still holds a balance. Move it to another account (or settle the debt) before archiving."
    );
  }
  getFinanceDb().prepare("UPDATE accounts SET is_archived = 1 WHERE id = ?").run(id);
}

// Per-account balance in KRW won.
//
// Assets accumulate as `opening + inflow - outflow`. Liabilities are the mirror
// (`opening + outflow - inflow`) so the stored figure is a positive "amount
// owed": spending from a liability account grows the debt, and a transfer into
// one pays it down. Investment and crypto balances come from the latest manual
// valuation when one exists, because their value moves without a transaction;
// with no valuation they fall back to cost basis.
const BALANCES_SQL = `
WITH acct AS (
  SELECT a.id, a.name, a.kind, a.currency, a.sort_order,
         ${toKrw("a.opening_balance", "a.currency")} AS opening_krw
  FROM accounts a
  WHERE a.is_archived = 0
),
inflow AS (
  SELECT to_account_id AS aid, SUM(${toKrw("amount", "currency")}) AS amt
  FROM transactions WHERE to_account_id IS NOT NULL GROUP BY to_account_id
),
outflow AS (
  SELECT from_account_id AS aid, SUM(${toKrw("amount", "currency")}) AS amt
  FROM transactions WHERE from_account_id IS NOT NULL GROUP BY from_account_id
),
latest_val AS (
  SELECT v.account_id, v.balance, v.currency
  FROM account_valuations v
  JOIN (
    SELECT account_id, MAX(as_of_date) AS d
    FROM account_valuations GROUP BY account_id
  ) m ON m.account_id = v.account_id AND m.d = v.as_of_date
)
SELECT acct.id, acct.name, acct.kind, acct.currency,
  CASE
    WHEN acct.kind IN (${sqlKindList(VALUED_KINDS)}) AND lv.balance IS NOT NULL
      THEN ${toKrw("lv.balance", "lv.currency")}
    WHEN acct.kind = 'liability'
      THEN acct.opening_krw + COALESCE(o.amt, 0) - COALESCE(i.amt, 0)
    ELSE acct.opening_krw + COALESCE(i.amt, 0) - COALESCE(o.amt, 0)
  END AS balanceKrw
FROM acct
LEFT JOIN inflow i ON i.aid = acct.id
LEFT JOIN outflow o ON o.aid = acct.id
LEFT JOIN latest_val lv ON lv.account_id = acct.id
ORDER BY acct.sort_order, acct.id
`;

export function computeBalances(rate: number): AccountBalance[] {
  return getFinanceDb().prepare(BALANCES_SQL).all({ r: rate }) as AccountBalance[];
}

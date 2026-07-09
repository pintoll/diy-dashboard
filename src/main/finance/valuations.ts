import { getFinanceDb } from "./db";
import { assertDate } from "./month";
import type { Valuation, ValuationInput, ValuationRow } from "./types";

function toValuation(row: ValuationRow): Valuation {
  return {
    id: row.id,
    accountId: row.account_id,
    asOfDate: row.as_of_date,
    balance: row.balance,
    currency: row.currency,
    memo: row.memo,
  };
}

export function listValuations(accountId: number): Valuation[] {
  const rows = getFinanceDb()
    .prepare(
      `SELECT id, account_id, as_of_date, balance, currency, memo
       FROM account_valuations
       WHERE account_id = ?
       ORDER BY as_of_date DESC`
    )
    .all(accountId) as ValuationRow[];
  return rows.map(toValuation);
}

// A valuation is an absolute balance as of a date, not a flow. It is what lets
// an investment or crypto account be marked to market without a price feed.
// One snapshot per account per day; re-marking the same day overwrites it.
export function upsertValuation(input: ValuationInput): void {
  assertDate(input.asOfDate);
  if (!Number.isInteger(input.balance)) {
    throw new Error("Balance must be an integer in minor units");
  }

  getFinanceDb()
    .prepare(
      `INSERT INTO account_valuations (account_id, as_of_date, balance, currency, memo)
       VALUES (@accountId, @asOfDate, @balance, @currency, @memo)
       ON CONFLICT(account_id, as_of_date) DO UPDATE SET
         balance = excluded.balance,
         currency = excluded.currency,
         memo = excluded.memo`
    )
    .run({
      accountId: input.accountId,
      asOfDate: input.asOfDate,
      balance: input.balance,
      currency: input.currency,
      memo: input.memo?.trim() || null,
    });
}

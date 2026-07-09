import { computeBalances } from "./accounts";
import { getFinanceDb } from "./db";
import { currentYm, shiftYm, ymRange } from "./month";
import { toKrw } from "./sql";
import {
  ASSET_SINK_KINDS,
  sqlKindList,
  type AccountKind,
  type AssetSlice,
  type FinanceOverview,
  type MonthlySummary,
} from "./types";

// The distinction this whole feature exists for:
//
//   spending    money that left your net worth (an expense)
//   intoAssets  money that left the source account but is still yours, because
//               it landed in savings, an investment, crypto, or paid down debt
//   leftOver    income that never moved anywhere
//
// A cash-to-cash transfer lands in none of the buckets. It is net-worth neutral
// and moving it between checking accounts is not a financial event.
const MONTHLY_SQL = `
WITH tx AS (
  SELECT t.kind,
         ${toKrw("t.amount", "t.currency")} AS norm,
         ta.kind AS to_kind
  FROM transactions t
  LEFT JOIN accounts ta ON ta.id = t.to_account_id
  WHERE t.date >= @monthStart AND t.date < @monthEnd
)
SELECT
  COALESCE(SUM(CASE WHEN kind = 'income'  THEN norm END), 0) AS income,
  COALESCE(SUM(CASE WHEN kind = 'expense' THEN norm END), 0) AS spending,
  COALESCE(SUM(CASE WHEN kind = 'transfer'
                     AND to_kind IN (${sqlKindList(ASSET_SINK_KINDS)})
                    THEN norm END), 0)                       AS intoAssets
FROM tx
`;

type MonthlyRow = { income: number; spending: number; intoAssets: number };

export function monthlySummary(ym: string, rate: number): MonthlySummary {
  const { monthStart, monthEnd } = ymRange(ym);
  const row = getFinanceDb()
    .prepare(MONTHLY_SQL)
    .get({ r: rate, monthStart, monthEnd }) as MonthlyRow;

  const { income, spending, intoAssets } = row;
  const totalOut = spending + intoAssets;
  const leftOver = income - totalOut;

  return {
    ym,
    income,
    spending,
    intoAssets,
    totalOut,
    leftOver,
    // The share of income that is still yours at month end. Equivalent to
    // (income - spending) / income, since intoAssets + leftOver = income - spending.
    savingsRate: income > 0 ? (intoAssets + leftOver) / income : 0,
  };
}

// Oldest first, ending at `endYm` inclusive, so a bar chart reads left to right.
export function recentMonths(
  months: number,
  rate: number,
  endYm?: string
): MonthlySummary[] {
  const end = endYm ?? currentYm();
  const count = Math.max(1, Math.min(24, Math.floor(months)));
  const result: MonthlySummary[] = [];
  for (let i = count - 1; i >= 0; i--) {
    result.push(monthlySummary(shiftYm(end, -i), rate));
  }
  return result;
}

export function overview(rate: number): FinanceOverview {
  const balances = computeBalances(rate);

  const totals = new Map<AccountKind, number>();
  let liabilities = 0;

  for (const account of balances) {
    if (account.kind === "liability") {
      liabilities += account.balanceKrw;
      continue;
    }
    totals.set(account.kind, (totals.get(account.kind) ?? 0) + account.balanceKrw);
  }

  const assets: AssetSlice[] = [...totals].map(([kind, total]) => ({ kind, total }));
  const assetTotal = assets.reduce((sum, slice) => sum + slice.total, 0);

  return {
    netWorth: assetTotal - liabilities,
    assets,
    liabilities,
    balances,
  };
}

// Shared contract for the finance feature. `*Row` types mirror the SQLite
// columns (snake_case); the plain types are the DTOs that cross IPC to the
// renderer (camelCase). Every other file in this folder imports from here.

export type Currency = "KRW" | "USD";
export type AccountKind =
  | "cash"
  | "savings"
  | "investment"
  | "crypto"
  | "liability";
export type TransactionKind = "income" | "expense" | "transfer";
export type CategoryKind = "expense" | "income";

// Minor units per major unit. KRW has no subunit (20000 = 20,000 won); USD is
// cents (2000 = $20.00). Amounts are always stored as integers in the minor
// unit of their own row's currency, never as floats.
export const CURRENCY_SCALE: Record<Currency, number> = { KRW: 0, USD: 2 };

// Account kinds where money lands without leaving your net worth. A transfer
// into one of these is "Into Assets", not spending. Liability is included
// because paying down debt preserves net worth exactly as saving does.
export const ASSET_SINK_KINDS: readonly AccountKind[] = [
  "savings",
  "investment",
  "crypto",
  "liability",
];

// Kinds whose balance comes from the latest manual valuation rather than from
// summing flows, because their value moves without a transaction.
export const VALUED_KINDS: readonly AccountKind[] = ["investment", "crypto"];

// Renders a readonly kind list as a SQL `IN` tuple, so the constants above stay
// the single source of truth instead of being retyped inside query strings.
export function sqlKindList(kinds: readonly AccountKind[]): string {
  return kinds.map((k) => `'${k}'`).join(",");
}

export type AccountRow = {
  id: number;
  name: string;
  kind: AccountKind;
  currency: Currency;
  opening_balance: number;
  is_archived: number;
  sort_order: number;
};

export type CategoryRow = {
  id: number;
  name: string;
  group_name: string;
  kind: CategoryKind;
  is_fixed: number;
  sort_order: number;
};

export type TransactionRow = {
  id: number;
  kind: TransactionKind;
  date: string;
  amount: number;
  currency: Currency;
  from_account_id: number | null;
  to_account_id: number | null;
  category_id: number | null;
  memo: string | null;
  recurring_rule_id: number | null;
  amount_krw: number;
  from_account_name: string | null;
  to_account_name: string | null;
  category_name: string | null;
};

export type RecurringRuleRow = {
  id: number;
  name: string;
  kind: TransactionKind;
  amount: number;
  currency: Currency;
  variable: number;
  billing_day: number;
  category_id: number | null;
  from_account_id: number | null;
  to_account_id: number | null;
  start_ym: string;
  end_ym: string | null;
  active: number;
  category_name: string | null;
};

export type ValuationRow = {
  id: number;
  account_id: number;
  as_of_date: string;
  balance: number;
  currency: Currency;
  memo: string | null;
};

export type Account = {
  id: number;
  name: string;
  kind: AccountKind;
  currency: Currency;
  openingBalance: number;
  isArchived: boolean;
  sortOrder: number;
};

export type AccountInput = {
  name: string;
  kind: AccountKind;
  currency: Currency;
  openingBalance: number;
  sortOrder?: number;
};

export type Category = {
  id: number;
  name: string;
  groupName: string;
  kind: CategoryKind;
  isFixed: boolean;
  sortOrder: number;
};

export type CategoryInput = {
  name: string;
  groupName: string;
  kind: CategoryKind;
  isFixed: boolean;
};

export type Transaction = {
  id: number;
  kind: TransactionKind;
  date: string;
  amount: number;
  currency: Currency;
  fromAccountId: number | null;
  toAccountId: number | null;
  categoryId: number | null;
  memo: string | null;
  recurringRuleId: number | null;
  // Amount normalized to KRW won at the current manual rate, for display and
  // aggregation. Never persisted: it reflows whenever the rate changes.
  amountKrw: number;
  fromAccountName: string | null;
  toAccountName: string | null;
  categoryName: string | null;
};

export type TransactionInput = {
  kind: TransactionKind;
  date: string;
  amount: number;
  currency: Currency;
  fromAccountId?: number | null;
  toAccountId?: number | null;
  categoryId?: number | null;
  memo?: string | null;
  recurringRuleId?: number | null;
};

export type TransactionFilter = {
  ym?: string;
  limit?: number;
};

export type RecurringRule = {
  id: number;
  name: string;
  kind: TransactionKind;
  amount: number;
  currency: Currency;
  variable: boolean;
  billingDay: number;
  categoryId: number | null;
  fromAccountId: number | null;
  toAccountId: number | null;
  startYm: string;
  endYm: string | null;
  active: boolean;
  categoryName: string | null;
};

export type RecurringRuleInput = {
  name: string;
  kind: TransactionKind;
  amount: number;
  currency: Currency;
  variable: boolean;
  billingDay: number;
  categoryId?: number | null;
  fromAccountId?: number | null;
  toAccountId?: number | null;
  startYm: string;
  endYm?: string | null;
  active?: boolean;
};

// A rule that is due in a month and has neither been confirmed nor skipped.
// `dueDate` is the billing day clamped into the month (a rule billed on the
// 31st resolves to Feb 28 or 29).
export type PendingCharge = RecurringRule & { dueDate: string };

export type ConfirmChargeInput = {
  ruleId: number;
  ym: string;
  amount?: number;
  date?: string;
};

export type SkipChargeInput = {
  ruleId: number;
  ym: string;
};

export type Valuation = {
  id: number;
  accountId: number;
  asOfDate: string;
  balance: number;
  currency: Currency;
  memo: string | null;
};

export type ValuationInput = {
  accountId: number;
  asOfDate: string;
  balance: number;
  currency: Currency;
  memo?: string | null;
};

// All figures in KRW won. `intoAssets` is money that left the source account
// but is still yours; `spending` is money that left your net worth.
export type MonthlySummary = {
  ym: string;
  income: number;
  spending: number;
  intoAssets: number;
  totalOut: number;
  leftOver: number;
  savingsRate: number;
};

export type AccountBalance = {
  id: number;
  name: string;
  kind: AccountKind;
  currency: Currency;
  balanceKrw: number;
};

export type AssetSlice = {
  kind: AccountKind;
  total: number;
};

export type FinanceOverview = {
  netWorth: number;
  assets: AssetSlice[];
  liabilities: number;
  balances: AccountBalance[];
};

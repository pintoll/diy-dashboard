import { getFinanceDb } from "./db";
import { assertDate, ymRange } from "./month";
import { toKrw } from "./sql";
import type {
  Transaction,
  TransactionFilter,
  TransactionInput,
  TransactionRow,
} from "./types";

type NormalizedTransaction = {
  kind: TransactionInput["kind"];
  date: string;
  amount: number;
  currency: TransactionInput["currency"];
  fromAccountId: number | null;
  toAccountId: number | null;
  categoryId: number | null;
  memo: string | null;
  recurringRuleId: number | null;
};

// Mirrors the CHECK constraints in the schema, but throws a message a person
// can act on instead of a raw SQLITE_CONSTRAINT.
function normalize(input: TransactionInput): NormalizedTransaction {
  assertDate(input.date);

  if (!Number.isInteger(input.amount) || input.amount < 0) {
    throw new Error("Amount must be a non-negative integer in minor units");
  }
  if (input.currency !== "KRW" && input.currency !== "USD") {
    throw new Error(`Unsupported currency: ${input.currency}`);
  }

  const from = input.fromAccountId ?? null;
  const to = input.toAccountId ?? null;

  if (input.kind === "income" && (to === null || from !== null)) {
    throw new Error("Income needs a destination account and no source account");
  }
  if (input.kind === "expense" && (from === null || to !== null)) {
    throw new Error("Expense needs a source account and no destination account");
  }
  if (input.kind === "transfer") {
    if (from === null || to === null) {
      throw new Error("Transfer needs both a source and a destination account");
    }
    if (from === to) {
      throw new Error("Transfer needs two different accounts");
    }
  }

  return {
    kind: input.kind,
    date: input.date,
    amount: input.amount,
    currency: input.currency,
    fromAccountId: from,
    toAccountId: to,
    categoryId: input.categoryId ?? null,
    memo: input.memo?.trim() || null,
    recurringRuleId: input.recurringRuleId ?? null,
  };
}

function toTransaction(row: TransactionRow): Transaction {
  return {
    id: row.id,
    kind: row.kind,
    date: row.date,
    amount: row.amount,
    currency: row.currency,
    fromAccountId: row.from_account_id,
    toAccountId: row.to_account_id,
    categoryId: row.category_id,
    memo: row.memo,
    recurringRuleId: row.recurring_rule_id,
    amountKrw: row.amount_krw,
    fromAccountName: row.from_account_name,
    toAccountName: row.to_account_name,
    categoryName: row.category_name,
  };
}

const LIST_SQL = `
SELECT t.id, t.kind, t.date, t.amount, t.currency,
       t.from_account_id, t.to_account_id, t.category_id,
       t.memo, t.recurring_rule_id,
       ${toKrw("t.amount", "t.currency")} AS amount_krw,
       fa.name AS from_account_name,
       ta.name AS to_account_name,
       c.name  AS category_name
FROM transactions t
LEFT JOIN accounts fa   ON fa.id = t.from_account_id
LEFT JOIN accounts ta   ON ta.id = t.to_account_id
LEFT JOIN categories c  ON c.id  = t.category_id
WHERE (@monthStart IS NULL OR (t.date >= @monthStart AND t.date < @monthEnd))
ORDER BY t.date DESC, t.id DESC
LIMIT @limit
`;

export function listTransactions(
  filter: TransactionFilter | undefined,
  rate: number
): Transaction[] {
  const range = filter?.ym ? ymRange(filter.ym) : null;
  const rows = getFinanceDb()
    .prepare(LIST_SQL)
    .all({
      r: rate,
      monthStart: range?.monthStart ?? null,
      monthEnd: range?.monthEnd ?? null,
      // SQLite treats a negative LIMIT as unbounded.
      limit: filter?.limit ?? -1,
    }) as TransactionRow[];
  return rows.map(toTransaction);
}

const INSERT_SQL = `
INSERT INTO transactions
  (kind, date, amount, currency, from_account_id, to_account_id,
   category_id, memo, recurring_rule_id)
VALUES
  (@kind, @date, @amount, @currency, @fromAccountId, @toAccountId,
   @categoryId, @memo, @recurringRuleId)
`;

export function createTransaction(input: TransactionInput): number {
  const info = getFinanceDb().prepare(INSERT_SQL).run(normalize(input));
  return Number(info.lastInsertRowid);
}

const UPDATE_SQL = `
UPDATE transactions SET
  kind = @kind, date = @date, amount = @amount, currency = @currency,
  from_account_id = @fromAccountId, to_account_id = @toAccountId,
  category_id = @categoryId, memo = @memo, recurring_rule_id = @recurringRuleId
WHERE id = @id
`;

type StoredTransaction = Pick<
  TransactionRow,
  | "kind"
  | "date"
  | "amount"
  | "currency"
  | "from_account_id"
  | "to_account_id"
  | "category_id"
  | "memo"
  | "recurring_rule_id"
>;

// A patch can flip `kind`, which changes which account columns are legal. Merge
// against the stored row and re-run the full validation rather than trusting
// that the caller sent a coherent subset.
export function updateTransaction(
  id: number,
  patch: Partial<TransactionInput>
): void {
  const db = getFinanceDb();
  const existing = db
    .prepare(
      `SELECT kind, date, amount, currency, from_account_id, to_account_id,
              category_id, memo, recurring_rule_id
       FROM transactions WHERE id = ?`
    )
    .get(id) as StoredTransaction | undefined;

  if (!existing) throw new Error(`No transaction with id ${id}`);

  const merged = normalize({
    kind: patch.kind ?? existing.kind,
    date: patch.date ?? existing.date,
    amount: patch.amount ?? existing.amount,
    currency: patch.currency ?? existing.currency,
    fromAccountId:
      patch.fromAccountId !== undefined
        ? patch.fromAccountId
        : existing.from_account_id,
    toAccountId:
      patch.toAccountId !== undefined ? patch.toAccountId : existing.to_account_id,
    categoryId:
      patch.categoryId !== undefined ? patch.categoryId : existing.category_id,
    memo: patch.memo !== undefined ? patch.memo : existing.memo,
    recurringRuleId:
      patch.recurringRuleId !== undefined
        ? patch.recurringRuleId
        : existing.recurring_rule_id,
  });

  db.prepare(UPDATE_SQL).run({ ...merged, id });
}

export function deleteTransaction(id: number): void {
  getFinanceDb().prepare("DELETE FROM transactions WHERE id = ?").run(id);
}

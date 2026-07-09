import { getFinanceDb } from "./db";
import { assertYm, dueDateFor, ymOf, ymRange } from "./month";
import { buildSetClause } from "./sql";
import { createTransaction } from "./transactions";
import type {
  ConfirmChargeInput,
  PendingCharge,
  RecurringRule,
  RecurringRuleInput,
  RecurringRuleRow,
  SkipChargeInput,
} from "./types";

const RULE_COLUMNS: Record<keyof RecurringRuleInput, string> = {
  name: "name",
  kind: "kind",
  amount: "amount",
  currency: "currency",
  variable: "variable",
  billingDay: "billing_day",
  categoryId: "category_id",
  fromAccountId: "from_account_id",
  toAccountId: "to_account_id",
  startYm: "start_ym",
  endYm: "end_ym",
  active: "active",
};

const SELECT_RULE = `
SELECT r.id, r.name, r.kind, r.amount, r.currency, r.variable, r.billing_day,
       r.category_id, r.from_account_id, r.to_account_id,
       r.start_ym, r.end_ym, r.active,
       c.name AS category_name
FROM recurring_rules r
LEFT JOIN categories c ON c.id = r.category_id
`;

function toRule(row: RecurringRuleRow): RecurringRule {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    amount: row.amount,
    currency: row.currency,
    variable: row.variable === 1,
    billingDay: row.billing_day,
    categoryId: row.category_id,
    fromAccountId: row.from_account_id,
    toAccountId: row.to_account_id,
    startYm: row.start_ym,
    endYm: row.end_ym,
    active: row.active === 1,
    categoryName: row.category_name,
  };
}

export function listRules(): RecurringRule[] {
  const rows = getFinanceDb()
    .prepare(`${SELECT_RULE} ORDER BY r.active DESC, r.billing_day, r.name`)
    .all() as RecurringRuleRow[];
  return rows.map(toRule);
}

function getRule(id: number): RecurringRule {
  const row = getFinanceDb()
    .prepare(`${SELECT_RULE} WHERE r.id = ?`)
    .get(id) as RecurringRuleRow | undefined;
  if (!row) throw new Error(`No recurring rule with id ${id}`);
  return toRule(row);
}

export function createRule(input: RecurringRuleInput): number {
  if (!input.name.trim()) throw new Error("Rule name is required");
  assertYm(input.startYm);
  if (input.endYm) assertYm(input.endYm);
  if (!Number.isInteger(input.amount) || input.amount < 0) {
    throw new Error("Amount must be a non-negative integer in minor units");
  }
  if (input.billingDay < 1 || input.billingDay > 31) {
    throw new Error("Billing day must be between 1 and 31");
  }

  const info = getFinanceDb()
    .prepare(
      `INSERT INTO recurring_rules
         (name, kind, amount, currency, variable, billing_day,
          category_id, from_account_id, to_account_id, start_ym, end_ym, active)
       VALUES
         (@name, @kind, @amount, @currency, @variable, @billingDay,
          @categoryId, @fromAccountId, @toAccountId, @startYm, @endYm, @active)`
    )
    .run({
      name: input.name.trim(),
      kind: input.kind,
      amount: input.amount,
      currency: input.currency,
      variable: input.variable ? 1 : 0,
      billingDay: input.billingDay,
      categoryId: input.categoryId ?? null,
      fromAccountId: input.fromAccountId ?? null,
      toAccountId: input.toAccountId ?? null,
      startYm: input.startYm,
      endYm: input.endYm ?? null,
      active: input.active === false ? 0 : 1,
    });

  return Number(info.lastInsertRowid);
}

export function updateRule(id: number, patch: Partial<RecurringRuleInput>): void {
  if (patch.startYm) assertYm(patch.startYm);
  if (patch.endYm) assertYm(patch.endYm);

  const { clause, params } = buildSetClause(patch, RULE_COLUMNS);
  if (!clause) return;
  getFinanceDb()
    .prepare(`UPDATE recurring_rules SET ${clause} WHERE id = @id`)
    .run({ ...params, id });
}

// Transactions already posted from this rule are kept; they just lose the link.
// The expense happened, whatever became of the subscription.
export function deleteRule(id: number): void {
  const db = getFinanceDb();
  db.transaction(() => {
    db.prepare(
      "UPDATE transactions SET recurring_rule_id = NULL WHERE recurring_rule_id = ?"
    ).run(id);
    db.prepare("DELETE FROM recurring_skips WHERE rule_id = ?").run(id);
    db.prepare("DELETE FROM recurring_rules WHERE id = ?").run(id);
  })();
}

// "Due this month" is derived, never materialized. A rule is pending when it is
// active, in its date window, and has neither posted a transaction nor been
// skipped for the month. Confirming inserts a linked transaction, which makes
// the NOT EXISTS drop it from this list; there is no status column to drift.
const PENDING_SQL = `
${SELECT_RULE}
WHERE r.active = 1
  AND r.start_ym <= @ym
  AND (r.end_ym IS NULL OR r.end_ym >= @ym)
  AND NOT EXISTS (
    SELECT 1 FROM transactions t
    WHERE t.recurring_rule_id = r.id
      AND t.date >= @monthStart AND t.date < @monthEnd
  )
  AND NOT EXISTS (
    SELECT 1 FROM recurring_skips s
    WHERE s.rule_id = r.id AND s.ym = @ym
  )
ORDER BY r.billing_day, r.name
`;

export function pendingCharges(ym: string): PendingCharge[] {
  const { monthStart, monthEnd } = ymRange(ym);
  const rows = getFinanceDb()
    .prepare(PENDING_SQL)
    .all({ ym, monthStart, monthEnd }) as RecurringRuleRow[];

  return rows.map((row) => ({
    ...toRule(row),
    dueDate: dueDateFor(ym, row.billing_day),
  }));
}

function hasPostedFor(ruleId: number, ym: string): boolean {
  const { monthStart, monthEnd } = ymRange(ym);
  const row = getFinanceDb()
    .prepare(
      `SELECT 1 AS hit FROM transactions
       WHERE recurring_rule_id = @ruleId
         AND date >= @monthStart AND date < @monthEnd
       LIMIT 1`
    )
    .get({ ruleId, monthStart, monthEnd });
  return row !== undefined;
}

// Confirming a charge is what turns an expectation into a fact. `amount` is
// supplied when the real bill differs from the estimate, which is the normal
// case for usage-based infra.
export function confirmCharge(input: ConfirmChargeInput): number {
  assertYm(input.ym);
  const rule = getRule(input.ruleId);

  if (hasPostedFor(rule.id, input.ym)) {
    throw new Error(`${rule.name} is already confirmed for ${input.ym}`);
  }

  const date = input.date ?? dueDateFor(input.ym, rule.billingDay);
  if (ymOf(date) !== input.ym) {
    throw new Error(`Date ${date} is outside ${input.ym}`);
  }

  return createTransaction({
    kind: rule.kind,
    date,
    amount: input.amount ?? rule.amount,
    currency: rule.currency,
    fromAccountId: rule.fromAccountId,
    toAccountId: rule.toAccountId,
    categoryId: rule.categoryId,
    memo: rule.name,
    recurringRuleId: rule.id,
  });
}

// Skipping records "this rule did not charge this month" without inserting a
// zero-amount transaction that would pollute the ledger.
export function skipCharge(input: SkipChargeInput): void {
  assertYm(input.ym);
  getFinanceDb()
    .prepare("INSERT OR IGNORE INTO recurring_skips (rule_id, ym) VALUES (?, ?)")
    .run(input.ruleId, input.ym);
}

export function unskipCharge(input: SkipChargeInput): void {
  assertYm(input.ym);
  getFinanceDb()
    .prepare("DELETE FROM recurring_skips WHERE rule_id = ? AND ym = ?")
    .run(input.ruleId, input.ym);
}

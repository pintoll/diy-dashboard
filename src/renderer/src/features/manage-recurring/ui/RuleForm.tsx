import { useState } from "react";
import {
  currentYm,
  ledgerErrorMessage,
  requireLedgerApi,
  TRANSACTION_KIND_LABEL,
  useFinanceStore,
  type Currency,
  type RecurringRule,
  type TransactionKind,
} from "@/src/entities/finance-ledger";
import {
  AccountSelect,
  AmountField,
  CategorySelect,
} from "@/src/entities/finance-ledger/client";
import {
  minorToInputValue,
  parseAmountToMinor,
} from "@/src/shared/lib/format-currency";
import { cn } from "@/src/shared/lib/utils";
import { Button } from "@/src/shared/ui/button";
import { Field } from "@/src/shared/ui/field";
import { Input } from "@/src/shared/ui/input";
import { Label } from "@/src/shared/ui/label";
import { Switch } from "@/src/shared/ui/switch";

const KINDS: TransactionKind[] = ["expense", "income", "transfer"];

type Props = {
  rule?: RecurringRule;
  onDone: () => void;
};

export function RuleForm({ rule, onDone }: Props) {
  const refresh = useFinanceStore((s) => s.refresh);

  const [name, setName] = useState(rule?.name ?? "");
  const [kind, setKind] = useState<TransactionKind>(rule?.kind ?? "expense");
  const [currency, setCurrency] = useState<Currency>(rule?.currency ?? "KRW");
  const [amount, setAmount] = useState(
    rule ? minorToInputValue(rule.amount, rule.currency) : ""
  );
  const [variable, setVariable] = useState(rule?.variable ?? false);
  const [billingDay, setBillingDay] = useState(String(rule?.billingDay ?? 1));
  const [fromId, setFromId] = useState(
    rule?.fromAccountId ? String(rule.fromAccountId) : ""
  );
  const [toId, setToId] = useState(rule?.toAccountId ? String(rule.toAccountId) : "");
  const [categoryId, setCategoryId] = useState(
    rule?.categoryId ? String(rule.categoryId) : ""
  );
  const [startYm, setStartYm] = useState(rule?.startYm ?? currentYm());
  const [active, setActive] = useState(rule?.active ?? true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const needsFrom = kind === "expense" || kind === "transfer";
  const needsTo = kind === "income" || kind === "transfer";
  const needsCategory = kind !== "transfer";

  function changeKind(next: TransactionKind) {
    setKind(next);
    setError(null);
    if (next === "income") setFromId("");
    if (next === "expense") setToId("");
    if (next === "transfer") setCategoryId("");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const minorAmount = parseAmountToMinor(amount, currency);
    const day = Number(billingDay);

    if (!name.trim()) return setError("Give the rule a name");
    if (minorAmount === null || minorAmount <= 0) {
      return setError("Enter an amount greater than zero");
    }
    if (!Number.isInteger(day) || day < 1 || day > 31) {
      return setError("Billing day must be between 1 and 31");
    }
    if (needsFrom && !fromId) return setError("Choose the account it is billed to");
    if (needsTo && !toId) return setError("Choose the account it lands in");
    if (needsCategory && !categoryId) return setError("Choose a category");

    const input = {
      name: name.trim(),
      kind,
      amount: minorAmount,
      currency,
      variable,
      billingDay: day,
      fromAccountId: needsFrom ? Number(fromId) : null,
      toAccountId: needsTo ? Number(toId) : null,
      categoryId: needsCategory ? Number(categoryId) : null,
      startYm,
      active,
    };

    setSaving(true);
    try {
      const api = requireLedgerApi();
      if (rule) await api.recurring.update(rule.id, input);
      else await api.recurring.create(input);
      await refresh();
      onDone();
    } catch (err) {
      setError(ledgerErrorMessage(err));
      setSaving(false);
    }
  }

  async function remove() {
    if (!rule) return;
    setSaving(true);
    try {
      await requireLedgerApi().recurring.remove(rule.id);
      await refresh();
      onDone();
    } catch (err) {
      setError(ledgerErrorMessage(err));
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex gap-1 rounded-md bg-muted p-1">
        {KINDS.map((option) => (
          <Button
            key={option}
            type="button"
            size="sm"
            variant={kind === option ? "default" : "ghost"}
            className="flex-1"
            onClick={() => changeKind(option)}
          >
            {TRANSACTION_KIND_LABEL[option]}
          </Button>
        ))}
      </div>

      <Field label="Name">
        <Input
          autoFocus
          placeholder="Claude Max"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>

      <div className="grid grid-cols-2 items-start gap-3">
        <AmountField
          label={variable ? "Typical amount" : "Amount"}
          amount={amount}
          onAmountChange={setAmount}
          currency={currency}
          onCurrencyChange={setCurrency}
        />
        <Field label="Billing day">
          <Input
            type="number"
            min={1}
            max={31}
            value={billingDay}
            onChange={(e) => setBillingDay(e.target.value)}
            className="tabular-nums"
          />
        </Field>
      </div>

      <label className="flex items-start justify-between gap-4 rounded-md border border-border px-3 py-2.5">
        <span className="flex flex-col gap-0.5">
          <Label className="text-sm">Amount varies each month</Label>
          <span className="text-xs text-muted-foreground">
            Usage-based bills ask you for the real figure before posting.
          </span>
        </span>
        <Switch checked={variable} onCheckedChange={setVariable} />
      </label>

      <div className={cn("grid gap-3", needsFrom && needsTo && "grid-cols-2")}>
        {needsFrom && (
          <Field label={kind === "transfer" ? "From" : "Billed to"}>
            <AccountSelect value={fromId} onChange={setFromId} excludeId={toId} />
          </Field>
        )}
        {needsTo && (
          <Field label={kind === "transfer" ? "To" : "Received into"}>
            <AccountSelect value={toId} onChange={setToId} excludeId={fromId} />
          </Field>
        )}
      </div>

      {needsCategory && (
        <Field label="Category">
          <CategorySelect
            value={categoryId}
            onChange={setCategoryId}
            kind={kind === "income" ? "income" : "expense"}
          />
        </Field>
      )}

      <div className="grid grid-cols-2 items-end gap-3">
        <Field label="First billed">
          <Input
            type="month"
            value={startYm}
            onChange={(e) => setStartYm(e.target.value)}
          />
        </Field>
        {rule && (
          <label className="flex h-9 items-center justify-between gap-3 rounded-md border border-border px-3">
            <Label className="text-sm">Active</Label>
            <Switch checked={active} onCheckedChange={setActive} />
          </label>
        )}
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex items-center justify-between gap-2">
        {rule ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={saving}
            onClick={remove}
            className="text-destructive hover:text-destructive"
          >
            Delete
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onDone} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {rule ? "Save" : "Add rule"}
          </Button>
        </div>
      </div>
    </form>
  );
}

import { useState } from "react";
import {
  ledgerErrorMessage,
  requireLedgerApi,
  todayIso,
  TRANSACTION_KIND_LABEL,
  useFinanceStore,
  type Currency,
  type Transaction,
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

const KINDS: TransactionKind[] = ["expense", "income", "transfer"];

type Props = {
  transaction?: Transaction;
  onDone: () => void;
};

export function TransactionForm({ transaction, onDone }: Props) {
  const refresh = useFinanceStore((s) => s.refresh);

  const [kind, setKind] = useState<TransactionKind>(transaction?.kind ?? "expense");
  const [date, setDate] = useState(transaction?.date ?? todayIso());
  const [currency, setCurrency] = useState<Currency>(transaction?.currency ?? "KRW");
  const [amount, setAmount] = useState(
    transaction ? minorToInputValue(transaction.amount, transaction.currency) : ""
  );
  const [fromId, setFromId] = useState(
    transaction?.fromAccountId ? String(transaction.fromAccountId) : ""
  );
  const [toId, setToId] = useState(
    transaction?.toAccountId ? String(transaction.toAccountId) : ""
  );
  const [categoryId, setCategoryId] = useState(
    transaction?.categoryId ? String(transaction.categoryId) : ""
  );
  const [memo, setMemo] = useState(transaction?.memo ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const needsFrom = kind === "expense" || kind === "transfer";
  const needsTo = kind === "income" || kind === "transfer";
  const needsCategory = kind !== "transfer";

  // Switching kind can strand an account in a slot the new kind does not use,
  // which the main process would reject. Clear it here instead.
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
    if (minorAmount === null || minorAmount <= 0) {
      setError("Enter an amount greater than zero");
      return;
    }
    if (needsFrom && !fromId) {
      setError("Choose the account the money leaves");
      return;
    }
    if (needsTo && !toId) {
      setError("Choose the account the money lands in");
      return;
    }
    if (needsCategory && !categoryId) {
      setError("Choose a category");
      return;
    }

    const input = {
      kind,
      date,
      amount: minorAmount,
      currency,
      fromAccountId: needsFrom ? Number(fromId) : null,
      toAccountId: needsTo ? Number(toId) : null,
      categoryId: needsCategory ? Number(categoryId) : null,
      memo: memo.trim() || null,
    };

    setSaving(true);
    try {
      const api = requireLedgerApi();
      if (transaction) await api.transactions.update(transaction.id, input);
      else await api.transactions.create(input);
      await refresh();
      onDone();
    } catch (err) {
      setError(ledgerErrorMessage(err));
      setSaving(false);
    }
  }

  async function remove() {
    if (!transaction) return;
    setSaving(true);
    try {
      await requireLedgerApi().transactions.remove(transaction.id);
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

      <div className="grid grid-cols-2 items-start gap-3">
        <AmountField
          autoFocus
          amount={amount}
          onAmountChange={setAmount}
          currency={currency}
          onCurrencyChange={setCurrency}
        />
        <Field label="Date">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>

      <div className={cn("grid gap-3", needsFrom && needsTo && "grid-cols-2")}>
        {needsFrom && (
          <Field label={kind === "transfer" ? "From" : "Paid from"}>
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

      <Field label="Memo">
        <Input
          placeholder="Optional"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
        />
      </Field>

      {kind === "transfer" && (
        <p className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
          A transfer moves money between your own accounts. It never counts as
          spending, and your net worth does not change.
        </p>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex items-center justify-between gap-2">
        {transaction ? (
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
            {transaction ? "Save" : "Add"}
          </Button>
        </div>
      </div>
    </form>
  );
}

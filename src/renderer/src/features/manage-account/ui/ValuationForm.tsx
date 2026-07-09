import { useState } from "react";
import {
  ledgerErrorMessage,
  requireLedgerApi,
  todayIso,
  useFinanceStore,
  type Account,
  type Currency,
} from "@/src/entities/finance-ledger";
import { AmountField } from "@/src/entities/finance-ledger/client";
import { parseAmountToMinor } from "@/src/shared/lib/format-currency";
import { Button } from "@/src/shared/ui/button";
import { Field } from "@/src/shared/ui/field";
import { Input } from "@/src/shared/ui/input";

type Props = {
  account: Account;
  onDone: () => void;
};

// Investment and crypto balances move without any transaction, so they are read
// from the latest mark rather than summed from flows. This is the seam the
// stock-portfolio feature will grow into: a valuation is already a per-account
// level as of a date, and only needs per-holding rows added underneath.
export function ValuationForm({ account, onDone }: Props) {
  const refresh = useFinanceStore((s) => s.refresh);

  const [balance, setBalance] = useState("");
  const [currency, setCurrency] = useState<Currency>(account.currency);
  const [asOfDate, setAsOfDate] = useState(todayIso());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const minor = parseAmountToMinor(balance, currency);
    if (minor === null) return setError("Enter the account's current value");

    setSaving(true);
    try {
      await requireLedgerApi().valuations.upsert({
        accountId: account.id,
        asOfDate,
        balance: minor,
        currency,
      });
      await refresh();
      onDone();
    } catch (err) {
      setError(ledgerErrorMessage(err));
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 items-start gap-3">
        <AmountField
          autoFocus
          label="Value now"
          amount={balance}
          onAmountChange={setBalance}
          currency={currency}
          onCurrencyChange={setCurrency}
        />
        <Field label="As of">
          <Input
            type="date"
            value={asOfDate}
            onChange={(e) => setAsOfDate(e.target.value)}
          />
        </Field>
      </div>

      <p className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
        Marking a value is not income. It replaces what {account.name} is worth
        in your net worth, and leaves your monthly flow untouched.
      </p>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          Mark value
        </Button>
      </div>
    </form>
  );
}

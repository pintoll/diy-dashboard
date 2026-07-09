import { useState } from "react";
import {
  ACCOUNT_KIND_LABEL,
  ledgerErrorMessage,
  requireLedgerApi,
  useFinanceStore,
  type Account,
  type AccountKind,
  type Currency,
} from "@/src/entities/finance-ledger";
import { AmountField, KindDot } from "@/src/entities/finance-ledger/client";
import {
  minorToInputValue,
  parseAmountToMinor,
} from "@/src/shared/lib/format-currency";
import { Button } from "@/src/shared/ui/button";
import { Field } from "@/src/shared/ui/field";
import { Input } from "@/src/shared/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/shared/ui/select";

const KINDS: AccountKind[] = [
  "cash",
  "savings",
  "investment",
  "crypto",
  "liability",
];

const KIND_HINT: Record<AccountKind, string> = {
  cash: "Checking and wallets. Money you can spend right now.",
  savings: "Deposits and recurring savings. Money you moved out of reach.",
  investment: "Brokerage accounts. Value comes from what you mark it at.",
  crypto: "Exchanges and wallets. Value comes from what you mark it at.",
  liability: "Loans and debt. Subtracted from your net worth.",
};

type Props = {
  account?: Account;
  onDone: () => void;
};

export function AccountForm({ account, onDone }: Props) {
  const refresh = useFinanceStore((s) => s.refresh);

  const [name, setName] = useState(account?.name ?? "");
  const [kind, setKind] = useState<AccountKind>(account?.kind ?? "cash");
  const [currency, setCurrency] = useState<Currency>(account?.currency ?? "KRW");
  const [opening, setOpening] = useState(
    account ? minorToInputValue(account.openingBalance, account.currency) : "0"
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const openingBalance = parseAmountToMinor(opening || "0", currency);
    if (!name.trim()) return setError("Give the account a name");
    if (openingBalance === null) return setError("Opening balance is not a number");

    setSaving(true);
    try {
      const api = requireLedgerApi();
      const input = { name: name.trim(), kind, currency, openingBalance };
      if (account) await api.accounts.update(account.id, input);
      else await api.accounts.create(input);
      await refresh();
      onDone();
    } catch (err) {
      setError(ledgerErrorMessage(err));
      setSaving(false);
    }
  }

  async function archive() {
    if (!account) return;
    setSaving(true);
    try {
      await requireLedgerApi().accounts.archive(account.id);
      await refresh();
      onDone();
    } catch (err) {
      setError(ledgerErrorMessage(err));
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Field label="Name">
        <Input
          autoFocus
          placeholder="Checking"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>

      <Field label="Kind" hint={KIND_HINT[kind]}>
        <Select value={kind} onValueChange={(v) => setKind(v as AccountKind)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {KINDS.map((option) => (
              <SelectItem key={option} value={option}>
                <KindDot kind={option} />
                {ACCOUNT_KIND_LABEL[option]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <AmountField
        label={kind === "liability" ? "Amount owed today" : "Opening balance"}
        amount={opening}
        onAmountChange={setOpening}
        currency={currency}
        onCurrencyChange={setCurrency}
      />

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex items-center justify-between gap-2">
        {account ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={saving}
            onClick={archive}
            className="text-destructive hover:text-destructive"
          >
            Archive
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onDone} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {account ? "Save" : "Add account"}
          </Button>
        </div>
      </div>
    </form>
  );
}

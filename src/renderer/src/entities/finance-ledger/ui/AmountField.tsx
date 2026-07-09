import { formatKrw, parseAmountToMinor } from "@/src/shared/lib/format-currency";
import { Field } from "@/src/shared/ui/field";
import { Input } from "@/src/shared/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/shared/ui/select";
import type { Currency } from "../model/finance-ledger.types";
import { useFinanceStore } from "../model/use-finance-store";

type Props = {
  label?: string;
  amount: string;
  onAmountChange: (value: string) => void;
  currency: Currency;
  onCurrencyChange: (value: Currency) => void;
  autoFocus?: boolean;
};

// Amount plus its currency. USD is the common case for infra billing, so the
// field shows what the charge costs in won at the manually configured rate
// rather than making you convert in your head.
export function AmountField({
  label = "Amount",
  amount,
  onAmountChange,
  currency,
  onCurrencyChange,
  autoFocus,
}: Props) {
  const rate = useFinanceStore((s) => s.rate);
  const minor = parseAmountToMinor(amount, currency);
  const showPreview = currency === "USD" && minor !== null && rate > 0;

  return (
    <Field
      label={label}
      hint={
        showPreview ? (
          <span className="tabular-nums">
            {`≈ ${formatKrw(Math.round((minor * rate) / 100))} at ${rate.toLocaleString("en-US")} / USD`}
          </span>
        ) : undefined
      }
    >
      <div className="flex gap-2">
        <Input
          autoFocus={autoFocus}
          inputMode="decimal"
          placeholder="0"
          value={amount}
          onChange={(e) => onAmountChange(e.target.value)}
          className="tabular-nums"
        />
        <Select
          value={currency}
          onValueChange={(v) => onCurrencyChange(v as Currency)}
        >
          <SelectTrigger className="w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="KRW">KRW</SelectItem>
            <SelectItem value="USD">USD</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </Field>
  );
}

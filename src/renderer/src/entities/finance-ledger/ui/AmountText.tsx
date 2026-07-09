import { formatKrw } from "@/src/shared/lib/format-currency";
import { cn } from "@/src/shared/lib/utils";
import type { TransactionKind } from "../model/finance-ledger.types";

type Props = {
  won: number;
  kind: TransactionKind;
  className?: string;
};

// A transfer carries no sign and no color: the money moved between your own
// accounts, so nothing was gained or lost. Only income and expense are events.
const TONE: Record<TransactionKind, { sign: string; color: string }> = {
  income: { sign: "+", color: "text-emerald-400" },
  expense: { sign: "-", color: "text-rose-400" },
  transfer: { sign: "", color: "text-muted-foreground" },
};

export function AmountText({ won, kind, className }: Props) {
  const { sign, color } = TONE[kind];
  return (
    <span className={cn("tabular-nums", color, className)}>
      {sign}
      {formatKrw(won)}
    </span>
  );
}

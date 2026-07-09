import { cn } from "@/src/shared/lib/utils";
import { ACCOUNT_KIND_COLOR } from "../model/account-kind";
import type { AccountKind } from "../model/finance-ledger.types";

type Props = {
  kind: AccountKind;
  className?: string;
};

export function KindDot({ kind, className }: Props) {
  return (
    <span
      aria-hidden
      className={cn("inline-block h-2.5 w-2.5 shrink-0 rounded-sm", className)}
      style={{ background: ACCOUNT_KIND_COLOR[kind] }}
    />
  );
}

import { useState } from "react";
import { LineChart, Pencil } from "lucide-react";
import {
  ACCOUNT_KIND_LABEL,
  useFinanceStore,
  type Account,
  type Overview,
} from "@/src/entities/finance-ledger";
import { KindDot } from "@/src/entities/finance-ledger/client";
import {
  AccountDialog,
  AddAccountButton,
  FxRateSetting,
  ValuationDialog,
} from "@/src/features/manage-account/client";
import { formatKrw } from "@/src/shared/lib/format-currency";
import { Button } from "@/src/shared/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/shared/ui/card";

type Props = {
  overview: Overview;
};

// Only these kinds move without a transaction, so only these get a "mark value"
// affordance. Cash and savings balances are already exact.
const MARKABLE = new Set(["investment", "crypto"]);

export function AccountsPanel({ overview }: Props) {
  const accounts = useFinanceStore((s) => s.accounts);
  const [editing, setEditing] = useState<Account | null>(null);
  const [marking, setMarking] = useState<Account | null>(null);

  const byId = new Map(accounts.map((account) => [account.id, account]));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Accounts</CardTitle>
        <CardDescription>
          Balances in won. USD accounts convert at the rate you set.
        </CardDescription>
        <CardAction>
          <AddAccountButton />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col">
          {overview.balances.map((balance) => {
            const account = byId.get(balance.id);
            return (
              <div
                key={balance.id}
                className="group flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-muted/40"
              >
                <KindDot kind={balance.kind} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{balance.name}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {ACCOUNT_KIND_LABEL[balance.kind]}
                    {balance.currency !== "KRW" ? ` · ${balance.currency}` : ""}
                  </span>
                </span>

                <span
                  className={
                    balance.kind === "liability"
                      ? "text-sm tabular-nums text-destructive"
                      : "text-sm tabular-nums"
                  }
                >
                  {balance.kind === "liability" ? "-" : ""}
                  {formatKrw(balance.balanceKrw)}
                </span>

                <span className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                  {account && MARKABLE.has(account.kind) && (
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      aria-label={`Mark ${account.name} value`}
                      onClick={() => setMarking(account)}
                    >
                      <LineChart />
                    </Button>
                  )}
                  {account && (
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      aria-label={`Edit ${account.name}`}
                      onClick={() => setEditing(account)}
                    >
                      <Pencil />
                    </Button>
                  )}
                </span>
              </div>
            );
          })}
        </div>

        <div className="border-t border-border pt-3">
          <FxRateSetting />
        </div>
      </CardContent>

      {editing && (
        <AccountDialog
          account={editing}
          open
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
        />
      )}
      {marking && (
        <ValuationDialog
          account={marking}
          open
          onOpenChange={(open) => {
            if (!open) setMarking(null);
          }}
        />
      )}
    </Card>
  );
}

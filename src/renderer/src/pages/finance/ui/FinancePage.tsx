import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { formatYmLabel, useFinanceStore } from "@/src/entities/finance-ledger";
import { AddTransactionButton } from "@/src/features/manage-transaction/client";
import {
  PendingQueue,
  RecurringRulesButton,
} from "@/src/features/manage-recurring/client";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/shared/ui/card";
import { AccountsPanel } from "./AccountsPanel";
import { FlowTrendChart } from "./FlowTrendChart";
import { MonthSummaryCard } from "./MonthSummaryCard";
import { NetWorthCard } from "./NetWorthCard";
import { TransactionList } from "./TransactionList";

export function FinancePage() {
  const ensureLoaded = useFinanceStore((s) => s.ensureLoaded);
  const status = useFinanceStore((s) => s.status);
  const error = useFinanceStore((s) => s.error);
  const overview = useFinanceStore((s) => s.overview);
  const summary = useFinanceStore((s) => s.summary);
  const trend = useFinanceStore((s) => s.trend);
  const transactions = useFinanceStore((s) => s.transactions);
  const pending = useFinanceStore((s) => s.pending);
  const ym = useFinanceStore((s) => s.ym);

  useEffect(() => {
    void ensureLoaded();
  }, [ensureLoaded]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-8">
        <header className="flex items-center justify-between gap-3">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Dashboard
          </Link>
          <AddTransactionButton />
        </header>

        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">Ledger</h1>
          <p className="text-sm text-muted-foreground">
            What you own, and where this month&apos;s money went.
          </p>
        </div>

        {status === "error" && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {overview && <NetWorthCard overview={overview} />}

        {summary && <MonthSummaryCard summary={summary} />}

        <Card>
          <CardHeader>
            <CardTitle>Recurring</CardTitle>
            <CardDescription>
              {pending.length === 0
                ? `Everything due in ${formatYmLabel(ym)} is confirmed.`
                : `${pending.length} waiting for ${formatYmLabel(ym)}. Confirm what you were actually charged.`}
            </CardDescription>
            <CardAction>
              <RecurringRulesButton />
            </CardAction>
          </CardHeader>
          <CardContent>
            <PendingQueue />
          </CardContent>
        </Card>

        <TransactionList transactions={transactions} />

        <FlowTrendChart trend={trend} />

        {overview && <AccountsPanel overview={overview} />}
      </div>
    </div>
  );
}

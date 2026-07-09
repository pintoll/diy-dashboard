import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import {
  formatYmLabel,
  useFinanceStore,
} from "@/src/entities/finance-ledger";
import { AssetDistributionBar, FlowBar } from "@/src/entities/finance-ledger/client";
import { formatKrw } from "@/src/shared/lib/format-currency";

export type MoneyFlowConfig = Record<string, never>;

export function MoneyFlowClient() {
  const ensureLoaded = useFinanceStore((s) => s.ensureLoaded);
  const status = useFinanceStore((s) => s.status);
  const error = useFinanceStore((s) => s.error);
  const overview = useFinanceStore((s) => s.overview);
  const summary = useFinanceStore((s) => s.summary);
  const pending = useFinanceStore((s) => s.pending);
  const ym = useFinanceStore((s) => s.ym);

  useEffect(() => {
    void ensureLoaded();
  }, [ensureLoaded]);

  if (status === "error") {
    return (
      <p className="flex h-full items-center justify-center px-4 text-center text-xs text-muted-foreground">
        {error}
      </p>
    );
  }

  if (!overview || !summary) {
    return (
      <p className="flex h-full items-center justify-center text-xs text-muted-foreground">
        Loading...
      </p>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex flex-col">
          <span className="text-[9px] uppercase tracking-wide text-muted-foreground">
            Net worth
          </span>
          <span className="text-xl font-semibold tabular-nums">
            {formatKrw(overview.netWorth)}
          </span>
        </div>
        <span className="text-[10px] text-muted-foreground">
          {formatYmLabel(ym)}
        </span>
      </div>

      <AssetDistributionBar assets={overview.assets} compact />

      <div className="border-t border-border pt-3">
        <FlowBar summary={summary} compact />
      </div>

      <div className="mt-auto flex shrink-0 items-center justify-between gap-2">
        {pending.length > 0 ? (
          <span className="text-[10px] text-muted-foreground">
            {pending.length} to confirm
          </span>
        ) : (
          <span />
        )}
        <Link
          to="/finance"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Open ledger
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}

import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  FLOW_COLOR,
  formatYmLabel,
  isFutureYm,
  shiftYm,
  useFinanceStore,
  type MonthlySummary,
} from "@/src/entities/finance-ledger";
import { FlowBar } from "@/src/entities/finance-ledger/client";
import { formatKrw } from "@/src/shared/lib/format-currency";
import { Button } from "@/src/shared/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/shared/ui/card";

type Props = {
  summary: MonthlySummary;
};

export function MonthSummaryCard({ summary }: Props) {
  const ym = useFinanceStore((s) => s.ym);
  const setYm = useFinanceStore((s) => s.setYm);

  const nextYm = shiftYm(ym, 1);
  const atPresent = isFutureYm(nextYm);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1.5">
            <CardTitle>Money flow</CardTitle>
            <CardDescription>
              Where this month&apos;s income went, and how much of it is still
              yours.
            </CardDescription>
          </div>
          <div className="flex items-center gap-1">
            <span className="mr-1 text-xs tabular-nums text-muted-foreground">
              {formatYmLabel(ym)}
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Previous month"
              onClick={() => void setYm(shiftYm(ym, -1))}
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Next month"
              disabled={atPresent}
              onClick={() => void setYm(nextYm)}
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <FlowBar summary={summary} />

        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md bg-border sm:grid-cols-4">
          <Tile label="Income" value={summary.income} />
          <Tile
            label="Spending"
            value={summary.spending}
            color={FLOW_COLOR.spending}
            hint="left your net worth"
          />
          <Tile
            label="Into Assets"
            value={summary.intoAssets}
            color={FLOW_COLOR.intoAssets}
            hint="still yours"
          />
          <Tile label="Total Out" value={summary.totalOut} hint="left your accounts" />
        </div>

        {summary.income > 0 && (
          <p className="text-xs text-muted-foreground">
            You kept{" "}
            <span className="font-medium tabular-nums text-foreground">
              {`${Math.round(summary.savingsRate * 100)}%`}
            </span>{" "}
            of what you earned. Only spending reduces that share, so moving money
            into savings or investments does not cost you anything here.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function Tile({
  label,
  value,
  color,
  hint,
}: {
  label: string;
  value: number;
  color?: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1 bg-card px-3 py-2.5">
      <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        {color && (
          <span
            aria-hidden
            className="inline-block h-2 w-2 shrink-0 rounded-[2px]"
            style={{ background: color }}
          />
        )}
        {label}
      </span>
      <span className="text-base font-medium tabular-nums">{formatKrw(value)}</span>
      {hint && <span className="text-[10px] text-muted-foreground">{hint}</span>}
    </div>
  );
}

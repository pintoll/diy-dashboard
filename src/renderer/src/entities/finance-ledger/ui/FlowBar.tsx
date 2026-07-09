import { formatKrw } from "@/src/shared/lib/format-currency";
import { cn } from "@/src/shared/lib/utils";
import { FLOW_COLOR } from "../model/account-kind";
import type { MonthlySummary } from "../model/finance-ledger.types";

type Segment = { label: string; value: number; color: string; hint: string };

type Props = {
  summary: MonthlySummary;
  compact?: boolean;
};

// One bar the width of your income, cut into where the money went. The whole
// point of the split is that only the orange segment left your net worth: green
// moved into savings, investments or debt paydown, and blue never moved at all.
//
// When you outspend your income the bar is scaled to total outflow instead, and
// the shortfall is called out rather than drawn as a negative segment.
export function FlowBar({ summary, compact = false }: Props) {
  const { income, spending, intoAssets, totalOut, leftOver } = summary;
  const overspent = leftOver < 0;
  const total = overspent ? totalOut : income;

  const segments: Segment[] = [
    {
      label: "Spending",
      value: spending,
      color: FLOW_COLOR.spending,
      hint: "Gone. Your net worth is lower by this much.",
    },
    {
      label: "Into Assets",
      value: intoAssets,
      color: FLOW_COLOR.intoAssets,
      hint: "Savings, investments and debt paydown. Still yours.",
    },
    ...(overspent
      ? []
      : [
          {
            label: "Left over",
            value: leftOver,
            color: FLOW_COLOR.leftOver,
            hint: "Income that never moved anywhere.",
          },
        ]),
  ];

  if (total === 0) {
    return (
      <div className="flex flex-col gap-2">
        <div className="h-2.5 w-full rounded-[4px] border border-dashed border-border" />
        <p className={cn("text-muted-foreground", compact ? "text-[10px]" : "text-xs")}>
          No money moved this month.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <span
          className={cn(
            "uppercase tracking-wide text-muted-foreground",
            compact ? "text-[9px]" : "text-[10px]"
          )}
        >
          Income
        </span>
        <span
          className={cn(
            "font-medium tabular-nums",
            compact ? "text-sm" : "text-base"
          )}
        >
          {formatKrw(income)}
        </span>
      </div>

      {/* 2px surface gaps keep adjacent fills separable without a border. */}
      <div
        className={cn("flex w-full gap-[2px]", compact ? "h-2" : "h-2.5")}
        role="img"
        aria-label={`Of ${formatKrw(income)} income: ${segments
          .map((s) => `${s.label} ${formatKrw(s.value)}`)
          .join(", ")}`}
      >
        {segments
          .filter((segment) => segment.value > 0)
          .map((segment) => (
            <div
              key={segment.label}
              title={`${segment.label}: ${formatKrw(segment.value)}. ${segment.hint}`}
              className="h-full first:rounded-l-[4px] last:rounded-r-[4px]"
              style={{
                width: `${(segment.value / total) * 100}%`,
                background: segment.color,
              }}
            />
          ))}
      </div>

      <div className="flex flex-col gap-1">
        {segments.map((segment) => (
          <div
            key={segment.label}
            className={cn(
              "flex items-center justify-between gap-3",
              compact ? "text-[11px]" : "text-xs"
            )}
          >
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span
                aria-hidden
                className="inline-block h-2 w-2 shrink-0 rounded-[2px]"
                style={{ background: segment.color }}
              />
              {segment.label}
            </span>
            <span className="tabular-nums text-foreground">
              {formatKrw(segment.value)}
            </span>
          </div>
        ))}

        {overspent && (
          <div
            className={cn(
              "flex items-center justify-between gap-3 border-t border-border pt-1",
              compact ? "text-[11px]" : "text-xs"
            )}
          >
            <span className="text-destructive">Overspent</span>
            <span className="tabular-nums text-destructive">
              {formatKrw(-leftOver)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

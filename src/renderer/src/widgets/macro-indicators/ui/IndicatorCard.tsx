import { cn } from "@/src/shared/lib/utils";
import type { SeriesSnapshot } from "@/src/entities/market-indicator";
import type { IndicatorMeta } from "../model/indicators-catalog";
import type { Timeframe } from "../model/timeframe";
import { getTimeframeWindow } from "../model/timeframe";
import { Sparkline } from "./Sparkline";

function formatValue(value: number, meta: IndicatorMeta): string {
  switch (meta.unit) {
    case "percent":
      return `${value.toFixed(meta.fractionDigits)}%`;
    case "currency":
      return value.toLocaleString("en-US", {
        minimumFractionDigits: meta.fractionDigits,
        maximumFractionDigits: meta.fractionDigits,
      });
    default:
      return value.toFixed(meta.fractionDigits);
  }
}

function formatDelta(delta: number, meta: IndicatorMeta): string {
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta.toFixed(meta.fractionDigits)}`;
}

type IndicatorCardProps = {
  meta: IndicatorMeta;
  snapshot: SeriesSnapshot | undefined;
  timeframe: Timeframe;
  isLoading: boolean;
};

export function IndicatorCard({
  meta,
  snapshot,
  timeframe,
  isLoading,
}: IndicatorCardProps) {
  const points = snapshot?.points ?? [];
  const { windowPoints, anchor, latest } = getTimeframeWindow(points, timeframe);

  const delta = latest && anchor ? latest.value - anchor.value : 0;
  const deltaPct =
    latest && anchor && anchor.value !== 0
      ? (delta / anchor.value) * 100
      : 0;
  const direction = delta > 0 ? "up" : delta < 0 ? "down" : "flat";

  const colorClass =
    direction === "up"
      ? "text-emerald-500"
      : direction === "down"
        ? "text-rose-500"
        : "text-muted-foreground/60";
  const strokeColor =
    direction === "up"
      ? "#10b981"
      : direction === "down"
        ? "#f43f5e"
        : "#94a3b8";

  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-border/40 bg-card/40 p-2.5 min-w-0">
      <div className="flex items-baseline justify-between gap-1.5 min-w-0">
        <span
          className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70 truncate"
          title={meta.description}
        >
          {meta.label}
        </span>
        <span className="text-[9px] tabular-nums text-muted-foreground/40">
          {meta.seriesId}
        </span>
      </div>

      {latest ? (
        <>
          <div className="text-base font-medium tabular-nums">
            {formatValue(latest.value, meta)}
          </div>
          <div className={cn("text-[10px] tabular-nums", colorClass)}>
            {formatDelta(delta, meta)} ({deltaPct >= 0 ? "+" : ""}
            {deltaPct.toFixed(2)}%)
          </div>
          <Sparkline points={windowPoints} color={strokeColor} />
        </>
      ) : (
        <div className="text-xs text-muted-foreground/40 py-2">
          {isLoading ? "Loading…" : "—"}
        </div>
      )}
    </div>
  );
}

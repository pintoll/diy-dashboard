import { memo } from "react";
import { cn } from "@/src/shared/lib/utils";
import type { SeriesPoint, SeriesSnapshot } from "@/src/entities/market-indicator";
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

function formatPct(pct: number): string {
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

type Direction = "up" | "down" | "flat";

type Change = {
  delta: number;
  pct: number;
  direction: Direction;
};

const DIRECTION_STYLE: Record<Direction, { class: string; stroke: string; arrow: string }> = {
  up: { class: "text-emerald-500", stroke: "#10b981", arrow: "▲" },
  down: { class: "text-rose-500", stroke: "#f43f5e", arrow: "▼" },
  flat: { class: "text-muted-foreground/60", stroke: "#94a3b8", arrow: "·" },
};

function computeChange(latest: SeriesPoint, anchor: SeriesPoint): Change {
  const delta = latest.value - anchor.value;
  const pct = anchor.value !== 0 ? (delta / anchor.value) * 100 : 0;
  const direction = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  return { delta, pct, direction };
}

type IndicatorCardProps = {
  meta: IndicatorMeta;
  snapshot: SeriesSnapshot | undefined;
  timeframe: Timeframe;
  isLoading: boolean;
};

function IndicatorCardComponent({
  meta,
  snapshot,
  timeframe,
  isLoading,
}: IndicatorCardProps) {
  const points = snapshot?.points ?? [];
  const { windowPoints, anchor, latest } = getTimeframeWindow(points, timeframe);
  const prevDay = points.length >= 2 ? points[points.length - 2] : null;

  const windowChange = latest && anchor ? computeChange(latest, anchor) : null;
  const dayChange = latest && prevDay ? computeChange(latest, prevDay) : null;
  const windowStyle = DIRECTION_STYLE[windowChange?.direction ?? "flat"];
  const dayStyle = dayChange ? DIRECTION_STYLE[dayChange.direction] : null;

  return (
    <div className="@container flex flex-col gap-1.5 rounded-md border border-border/40 bg-card/40 p-2.5 min-w-0">
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
          <div className="flex items-baseline justify-between gap-2 min-w-0">
            <span className="text-base font-medium tabular-nums">
              {formatValue(latest.value, meta)}
            </span>
            {dayChange && dayStyle && (
              <span
                className={cn(
                  "text-[10px] tabular-nums whitespace-nowrap",
                  dayStyle.class
                )}
              >
                {dayStyle.arrow} {formatDelta(dayChange.delta, meta)}
                <span className="hidden @[140px]:inline">
                  {" "}
                  ({formatPct(dayChange.pct)})
                </span>
              </span>
            )}
          </div>

          <div className="flex items-baseline gap-1.5 text-[10px] tabular-nums">
            <span className="text-muted-foreground/50 font-medium w-5 shrink-0">
              {timeframe}
            </span>
            {windowChange ? (
              <span className={windowStyle.class}>
                {formatDelta(windowChange.delta, meta)} (
                {formatPct(windowChange.pct)})
              </span>
            ) : (
              <span className="text-muted-foreground/40">—</span>
            )}
          </div>

          <Sparkline points={windowPoints} color={windowStyle.stroke} />
        </>
      ) : (
        <div className="text-xs text-muted-foreground/40 py-2">
          {isLoading ? "Loading…" : "—"}
        </div>
      )}
    </div>
  );
}

export const IndicatorCard = memo(IndicatorCardComponent);

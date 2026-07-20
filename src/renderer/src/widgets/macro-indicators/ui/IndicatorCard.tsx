import { memo } from "react";
import { cn } from "@/src/shared/lib/utils";
import {
  DEFAULT_DISPLAY,
  type IndicatorConnector,
  type IndicatorUnit,
  type SeriesPoint,
  type SeriesSnapshot,
} from "@/src/entities/market-indicator";
import type { Timeframe } from "../model/timeframe";
import { getTimeframeWindow } from "../model/timeframe";
import { Sparkline } from "./Sparkline";

type Display = { unit: IndicatorUnit; fractionDigits: number };

function formatValue(value: number, display: Display): string {
  switch (display.unit) {
    case "percent":
      return `${value.toFixed(display.fractionDigits)}%`;
    case "currency":
      return value.toLocaleString("en-US", {
        minimumFractionDigits: display.fractionDigits,
        maximumFractionDigits: display.fractionDigits,
      });
    default:
      return value.toFixed(display.fractionDigits);
  }
}

function formatDelta(delta: number, display: Display): string {
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta.toFixed(display.fractionDigits)}`;
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
  connector: IndicatorConnector;
  snapshot: SeriesSnapshot | undefined;
  error: string | undefined;
  timeframe: Timeframe;
  isLoading: boolean;
};

function IndicatorCardComponent({
  connector,
  snapshot,
  error,
  timeframe,
  isLoading,
}: IndicatorCardProps) {
  const display = connector.display ?? DEFAULT_DISPLAY;
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
          title={connector.label}
        >
          {connector.label}
        </span>
        <span className="text-[9px] tabular-nums text-muted-foreground/40">
          {connector.id}
        </span>
      </div>

      {latest ? (
        <>
          <div className="flex items-baseline justify-between gap-2 min-w-0">
            <span className="text-base font-medium tabular-nums">
              {formatValue(latest.value, display)}
            </span>
            {dayChange && dayStyle && (
              <span
                className={cn(
                  "text-[10px] tabular-nums whitespace-nowrap",
                  dayStyle.class
                )}
              >
                {dayStyle.arrow} {formatDelta(dayChange.delta, display)}
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
                {formatDelta(windowChange.delta, display)} (
                {formatPct(windowChange.pct)})
              </span>
            ) : (
              <span className="text-muted-foreground/40">—</span>
            )}
          </div>

          <Sparkline points={windowPoints} color={windowStyle.stroke} />
        </>
      ) : error ? (
        // The connector's own failure, shown in place of its value. Definitions
        // are user- and agent-authored, so a bad path or an expired credential
        // has to be legible from the card rather than only in a log.
        <div
          className="text-[10px] leading-snug text-destructive/70 py-1 line-clamp-3"
          title={error}
        >
          {error}
        </div>
      ) : (
        <div className="text-xs text-muted-foreground/40 py-2">
          {isLoading ? "Loading…" : "—"}
        </div>
      )}
    </div>
  );
}

export const IndicatorCard = memo(IndicatorCardComponent);

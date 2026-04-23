import type { SeriesPoint } from "@/src/entities/market-indicator";

export type Timeframe = "1W" | "1M" | "3M" | "6M" | "1Y" | "5Y";

export const TIMEFRAMES: readonly Timeframe[] = [
  "1W",
  "1M",
  "3M",
  "6M",
  "1Y",
  "5Y",
];

const TIMEFRAME_DAYS: Record<Timeframe, number> = {
  "1W": 7,
  "1M": 30,
  "3M": 91,
  "6M": 182,
  "1Y": 365,
  "5Y": 1825,
};

export const TIMEFRAME_LABELS: Record<Timeframe, string> = {
  "1W": "1주",
  "1M": "1개월",
  "3M": "3개월",
  "6M": "6개월",
  "1Y": "1년",
  "5Y": "5년",
};

export type TimeframeWindow = {
  windowPoints: SeriesPoint[];
  anchor: SeriesPoint | null;
  latest: SeriesPoint | null;
};

export function getTimeframeWindow(
  points: SeriesPoint[],
  timeframe: Timeframe
): TimeframeWindow {
  if (points.length === 0) {
    return { windowPoints: [], anchor: null, latest: null };
  }

  const latest = points[points.length - 1];
  const latestMs = new Date(latest.date).getTime();
  const cutoffMs = latestMs - TIMEFRAME_DAYS[timeframe] * 24 * 60 * 60 * 1000;

  let windowStartIndex = points.length - 1;
  for (let i = points.length - 1; i >= 0; i--) {
    if (new Date(points[i].date).getTime() >= cutoffMs) {
      windowStartIndex = i;
    } else {
      break;
    }
  }

  const windowPoints = points.slice(windowStartIndex);
  const anchor = windowPoints[0] ?? latest;

  return { windowPoints, anchor, latest };
}

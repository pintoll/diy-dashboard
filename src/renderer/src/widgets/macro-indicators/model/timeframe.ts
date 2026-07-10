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
  "1W": "1 week",
  "1M": "1 month",
  "3M": "3 months",
  "6M": "6 months",
  "1Y": "1 year",
  "5Y": "5 years",
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

  const startIndex = points.findIndex(
    (p) => new Date(p.date).getTime() >= cutoffMs
  );
  const windowPoints = startIndex === -1 ? [latest] : points.slice(startIndex);
  const anchor = windowPoints[0] ?? latest;

  return { windowPoints, anchor, latest };
}

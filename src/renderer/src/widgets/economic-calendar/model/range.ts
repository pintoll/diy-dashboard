import type { RangeKey } from "./economic-calendar.types";

export const RANGE_KEYS: readonly RangeKey[] = [
  "thisWeek",
  "nextWeek",
  "twoWeeks",
];

export const RANGE_LABEL: Record<RangeKey, string> = {
  thisWeek: "This Week",
  nextWeek: "Next Week",
  twoWeeks: "2 Weeks",
};

const KST_TZ = "Asia/Seoul";
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Window fetched from main process: covers lookback + lookahead so that
// range toggles stay offline. Sized to keep one FMP call per refresh.
const FETCH_LOOKBACK_DAYS = 7;
const FETCH_LOOKAHEAD_DAYS = 28;

function kstYmd(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: KST_TZ });
}

function kstDayOfWeek(d: Date): number {
  // 0 = Sunday ... 6 = Saturday, interpreted in KST.
  const weekday = d.toLocaleDateString("en-US", {
    timeZone: KST_TZ,
    weekday: "short",
  });
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);
}

function startOfKstWeek(d: Date): Date {
  const dow = kstDayOfWeek(d);
  // Week starts Monday: offset = (dow === 0 ? 6 : dow - 1).
  const offset = dow === 0 ? 6 : dow - 1;
  return new Date(d.getTime() - offset * MS_PER_DAY);
}

export function getFetchWindow(now: Date = new Date()): {
  from: string;
  to: string;
} {
  const from = new Date(now.getTime() - FETCH_LOOKBACK_DAYS * MS_PER_DAY);
  const to = new Date(now.getTime() + FETCH_LOOKAHEAD_DAYS * MS_PER_DAY);
  return { from: kstYmd(from), to: kstYmd(to) };
}

export function getRangeBounds(
  rangeKey: RangeKey,
  now: Date = new Date()
): { from: string; to: string } {
  const weekStart = startOfKstWeek(now);
  switch (rangeKey) {
    case "thisWeek": {
      const to = new Date(weekStart.getTime() + 6 * MS_PER_DAY);
      return { from: kstYmd(weekStart), to: kstYmd(to) };
    }
    case "nextWeek": {
      const from = new Date(weekStart.getTime() + 7 * MS_PER_DAY);
      const to = new Date(from.getTime() + 6 * MS_PER_DAY);
      return { from: kstYmd(from), to: kstYmd(to) };
    }
    case "twoWeeks": {
      const to = new Date(weekStart.getTime() + 13 * MS_PER_DAY);
      return { from: kstYmd(weekStart), to: kstYmd(to) };
    }
  }
}

export function kstDateKey(isoDatetime: string): string {
  return kstYmd(new Date(isoDatetime));
}

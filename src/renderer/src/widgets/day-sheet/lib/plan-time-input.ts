import { isPlanTime, planEndMinutes, planMinutes } from "@shared/plan-time";

// Parsing for the sheet's one time-editing affordance: a single text field
// holding the whole range ("10:00-14:00"). Client-side validation applies the
// exact server rule (todos/plan.ts assertRange via @shared/plan-time), so the
// two can never disagree on what is a valid range; the server stays the
// authority for everything else (e.g. the entry vanishing mid-edit).

const MINUTES_PER_DAY = 24 * 60;

// Whatever a user is likely to type or paste between the two times: hyphen,
// en/em dash, tilde, with or without spaces.
const RANGE_SEPARATOR = /\s*[-\u2013\u2014~]\s*/;

/** "9:30" -> "09:30"; otherwise strict HH:MM (isPlanTime); null on garbage. */
export function normalizePlanTime(raw: string): string | null {
  const trimmed = raw.trim();
  const padded = /^\d:\d\d$/.test(trimmed) ? `0${trimmed}` : trimmed;
  return isPlanTime(padded) ? padded : null;
}

/**
 * Parses a full range. Null when either time is invalid or the range breaks
 * the server rule: end strictly after start in lived order, where an end of
 * "05:00" means end-of-day. Rejects zero-length and 05:00-crossing ranges,
 * accepts the midnight wrap ("23:00-01:00") and the whole-day
 * "05:00"-"05:00".
 */
export function parseTimeRange(
  raw: string
): { start: string; end: string } | null {
  const parts = raw.trim().split(RANGE_SEPARATOR);
  if (parts.length !== 2) return null;
  const start = normalizePlanTime(parts[0]);
  const end = normalizePlanTime(parts[1]);
  if (start === null || end === null) return null;
  if (planEndMinutes(end) <= planMinutes(start)) return null;
  return { start, end };
}

export function formatTimeRange(start: string, end: string): string {
  return `${start}\u2013${end}`;
}

function minutesToHm(planMin: number): string {
  const clock = (planMin + 5 * 60) % MINUTES_PER_DAY;
  const h = Math.floor(clock / 60);
  const m = clock % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * The default block for a new line: now rounded up to the nearest :00/:30
 * (an aligned now stays put), one hour long, clamped to the 05:00 boundary a
 * plan entry cannot cross. In the day's last half hour the start stays at now
 * so the rounding itself cannot escape the day; a "05:00" end means
 * end-of-day.
 */
export function suggestRange(nowHm: string): { start: string; end: string } {
  const now = planMinutes(nowHm);
  let startMin = Math.ceil(now / 30) * 30;
  if (startMin >= MINUTES_PER_DAY) startMin = now;
  const endMin = Math.min(startMin + 60, MINUTES_PER_DAY);
  return { start: minutesToHm(startMin), end: minutesToHm(endMin) };
}

// Clock times inside a plan entry ("HH:MM") live on the app's 05:00-to-05:00
// day (@shared/day): a time below "05:00" means the small hours of the *next*
// calendar day, still belonging to the day being planned
// (docs/design/assistant-behavior.md). Sorting by the raw string would put a
// 01:00 block before the morning; sorting by planMinutes puts 05:00 first and
// 04:59 last — the order the day is actually lived in.
//
// Shared for the same reason @shared/day is: main validates these times at the
// write boundary (todos/plan.ts) and the day-sheet widget will order by them at
// render time, and the two must not drift. This module stays throw-free —
// ValidationError is a main-process concept — so services wrap it, mirroring
// the @shared/day / todos/date.ts split.

import { DAY_START_HOUR } from "./day";

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** The plan-minute line's modulus, and planEndMinutes' end-of-day value. */
export const MINUTES_PER_DAY = 24 * 60;

const DAY_START_MIN = DAY_START_HOUR * 60;

/** Strict "HH:MM": two digits each, 00:00–23:59. No "9:00", no "24:00". */
export function isPlanTime(value: unknown): value is string {
  return typeof value === "string" && TIME_PATTERN.test(value);
}

/**
 * Minutes since the day's 05:00 start: "05:00" → 0, "04:59" → 1439. Sorting
 * plan entries by this value lists them in lived order across the midnight
 * wrap. Callers must validate with isPlanTime first.
 */
export function planMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h * 60 + m - DAY_START_MIN + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

/**
 * planMinutes for an entry's *end*, where "05:00" means end-of-day (1440)
 * rather than start-of-day (0) — otherwise a "03:00-05:00" block ending at the
 * boundary would be unrepresentable. The single validity rule
 * `planEndMinutes(end) > planMinutes(start)` then rejects zero-length entries
 * and entries crossing the 05:00 boundary while accepting the midnight wrap
 * (23:00-01:00). One corollary is deliberate: "05:00"-"05:00" (0 < 1440) is
 * the only valid start==end pair and encodes the whole-day block —
 * start-of-day to end-of-day.
 */
export function planEndMinutes(time: string): number {
  const minutes = planMinutes(time);
  return minutes === 0 ? MINUTES_PER_DAY : minutes;
}

/**
 * Inverse of planMinutes: the clock "HH:MM" a plan-minute value names. Accepts
 * planEndMinutes' end-of-day too — 1440 wraps back to "05:00". Lives here so
 * no caller re-derives the day-start anchor from a literal and silently
 * drifts if DAY_START_HOUR ever moves.
 */
export function planTimeFromMinutes(minutes: number): string {
  const clock = (minutes + DAY_START_MIN) % MINUTES_PER_DAY;
  const h = String(Math.floor(clock / 60)).padStart(2, "0");
  const m = String(clock % 60).padStart(2, "0");
  return `${h}:${m}`;
}

/**
 * Lived-order comparator for plan entries: earliest `start` on the 05:00 day
 * first. The one ordering rule for every surface that lists a plan — main's
 * list/snapshot code and the day-sheet widget must sort with this, not a
 * local copy, or the same plan can render in different orders. Equal starts
 * compare 0, so a stable sort keeps the caller's input order: feed rows in
 * insertion (rowid) order to make that the tie-break.
 */
export function comparePlanStart(a: { start: string }, b: { start: string }): number {
  return planMinutes(a.start) - planMinutes(b.start);
}

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

const MINUTES_PER_DAY = 24 * 60;

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
 * (23:00-01:00).
 */
export function planEndMinutes(time: string): number {
  const minutes = planMinutes(time);
  return minutes === 0 ? MINUTES_PER_DAY : minutes;
}

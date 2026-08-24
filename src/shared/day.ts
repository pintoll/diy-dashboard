// The app's day runs 05:00 to 05:00 in Asia/Seoul, not midnight to midnight
// (docs/design/assistant-behavior.md). Work done at 02:00 belongs to the day
// that started the previous morning: that is the day it was planned into, and
// the day the person doing it thinks they are still in. On calendar days the
// same work stamps `completed_on` a day late, flips the today widget's list
// mid-session, and drops every still-open todo into Overdue at midnight.
//
// Before this module, main and the renderer each carried a hand-copied
// `kstToday()` — the duplication @shared/pomodoro-time exists to prevent. One
// module imported by both is the enforcement: the default date main writes and
// the day the renderer highlights cannot drift apart.
//
// Pure by construction — `now` is an argument, the same convention
// @shared/pomodoro-time uses — so the boundary is testable against a fixed
// clock rather than the wall.

const TIME_ZONE = "Asia/Seoul";

const MS_PER_HOUR = 60 * 60 * 1000;

const MS_PER_DAY = 24 * MS_PER_HOUR;

/** The hour a day begins. Setting this to 0 puts the app back on calendar days. */
export const DAY_START_HOUR = 5;

/**
 * The day `now` (epoch ms) belongs to, as yyyy-MM-dd.
 *
 * Shifting the instant back by DAY_START_HOUR and only then formatting in
 * Asia/Seoul is exact rather than approximate: KST has no DST, so its offset is
 * a constant +09:00 and the shift can never land on a skipped or repeated wall
 * clock hour. Pinning the zone also makes the result independent of the machine
 * timezone, which is the reason todos moved off local time in the first place.
 */
export function dayOf(now: number): string {
  return new Date(now - DAY_START_HOUR * MS_PER_HOUR).toLocaleDateString("en-CA", {
    timeZone: TIME_ZONE,
  });
}

/** The day happening right now. */
export function today(): string {
  return dayOf(Date.now());
}

/**
 * The instant (epoch ms) day `day` begins — 05:00 on its calendar date in
 * Asia/Seoul. The inverse of dayOf, exact for the same reason: KST's offset is
 * a constant +09:00. `day` must already be a valid yyyy-MM-dd string.
 */
export function dayStartMs(day: string): number {
  const hour = String(DAY_START_HOUR).padStart(2, "0");
  return Date.parse(`${day}T${hour}:00:00+09:00`);
}

/**
 * The instant day `day` ends, exclusive: the next day's dayStartMs.
 * `[dayStartMs(day), dayEndMs(day))` is *the* day window — every consumer that
 * buckets instants into days (fold queries, the yesterday resolver, analytics)
 * must build it from this pair, never from a local `+ 24h`. Adding a constant
 * 24h is exact only because KST has no DST; that assumption lives here, once.
 */
export function dayEndMs(day: string): number {
  return dayStartMs(day) + MS_PER_DAY;
}

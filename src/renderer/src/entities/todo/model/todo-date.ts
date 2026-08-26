// Labels for todo dates. Which day the app is *on*, and the arithmetic that
// moves between day keys, deliberately are not here: they live in @shared/day,
// imported by both processes so main and the renderer cannot disagree about
// them. Day shifting and the Monday rule are re-exported rather than re-derived
// — two copies of the week-start rule are two things that can drift.
import { addDays, weekStartOf } from "@shared/day";

export { addDays };

// Labels treat yyyy-MM-dd as a pure calendar date pinned to UTC, so formatting
// can never cross a DST or machine-timezone boundary.
function toUtc(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

/** The Monday-to-Sunday week containing `date`, as seven yyyy-MM-dd strings. */
export function weekOf(date: string): string[] {
  const monday = weekStartOf(date);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** "Wed, Jul 9" — row and section labels. */
export function formatShortDate(date: string): string {
  return toUtc(date).toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/** "Wednesday, Jul 9, 2026" — the day-view heading. */
export function formatDateHeading(date: string): string {
  return toUtc(date).toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** "Wed" — week strip column header. */
export function weekdayShort(date: string): string {
  return toUtc(date).toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "short",
  });
}

/** Day-of-month as a number string, "9" — week strip cell. */
export function dayOfMonth(date: string): string {
  return String(toUtc(date).getUTCDate());
}

// Todos standardize on Asia/Seoul (like daily-news) so main and renderer can
// never disagree on "today" even if the machine timezone drifts. Own copy of
// the KST helper: main and renderer are bundled separately.
const KST_TIME_ZONE = "Asia/Seoul";

/** Current date in Asia/Seoul as yyyy-MM-dd. */
export function kstToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: KST_TIME_ZONE });
}

// All arithmetic below treats yyyy-MM-dd as a pure calendar date pinned to
// UTC, so shifting days can never cross a DST or timezone boundary.
function toUtc(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

function toIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const d = toUtc(date);
  d.setUTCDate(d.getUTCDate() + days);
  return toIso(d);
}

/** The Monday-to-Sunday week containing `date`, as seven yyyy-MM-dd strings. */
export function weekOf(date: string): string[] {
  const day = toUtc(date).getUTCDay(); // 0 = Sunday
  const monday = addDays(date, day === 0 ? -6 : 1 - day);
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

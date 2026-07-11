const KST_TIME_ZONE = "Asia/Seoul";

/** Current date in Asia/Seoul as yyyy-MM-dd. */
export function kstToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: KST_TIME_ZONE });
}

/** Current hour (0-23) in Asia/Seoul. */
export function kstHour(): number {
  const hour = new Date().toLocaleString("en-US", {
    timeZone: KST_TIME_ZONE,
    hour: "2-digit",
    hour12: false,
  });
  return Number(hour) % 24;
}

/** The Asia/Seoul date `days` days before now, as yyyy-MM-dd. */
export function kstDateDaysAgo(days: number): string {
  const ms = Date.now() - days * 24 * 60 * 60 * 1000;
  return new Date(ms).toLocaleDateString("en-CA", { timeZone: KST_TIME_ZONE });
}

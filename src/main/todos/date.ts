import { ValidationError } from "./types";

// Todos standardize on Asia/Seoul (like daily-news) so main and renderer can
// never disagree on "today" even if the machine timezone drifts. Own copy of
// the KST helper: main and renderer are bundled separately.
const KST_TIME_ZONE = "Asia/Seoul";

/** Current date in Asia/Seoul as yyyy-MM-dd. */
export function kstToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: KST_TIME_ZONE });
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Validates a yyyy-MM-dd string and rejects impossible dates (2026-02-31). */
export function assertDate(value: string, field = "date"): string {
  if (!DATE_PATTERN.test(value)) {
    throw new ValidationError(`${field} must be yyyy-MM-dd, got "${value}"`);
  }
  const [y, m, d] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(y, m - 1, d));
  if (
    parsed.getUTCFullYear() !== y ||
    parsed.getUTCMonth() !== m - 1 ||
    parsed.getUTCDate() !== d
  ) {
    throw new ValidationError(`${field} is not a real date: "${value}"`);
  }
  return value;
}

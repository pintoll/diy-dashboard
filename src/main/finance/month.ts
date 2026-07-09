// Month arithmetic for the finance queries. Lives in `src/main` rather than
// being shared with the renderer because electron-vite bundles the two targets
// separately (the renderer keeps its own copy of the display-side helpers).

const YM_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function pad4(n: number): string {
  return String(n).padStart(4, "0");
}

export function assertYm(ym: string): void {
  if (!YM_PATTERN.test(ym)) throw new Error(`Invalid month: ${ym}`);
}

export function assertDate(date: string): void {
  if (!DATE_PATTERN.test(date)) throw new Error(`Invalid date: ${date}`);
}

// Half-open range [monthStart, monthEnd) covering `ym`. Every month-scoped
// query filters on this instead of `substr(date,1,7) = :ym`, because a range
// predicate can use the `date` index and a substr() call cannot.
export function ymRange(ym: string): { monthStart: string; monthEnd: string } {
  assertYm(ym);
  const [year, month] = ym.split("-").map(Number);
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return {
    monthStart: `${ym}-01`,
    monthEnd: `${pad4(nextYear)}-${pad2(nextMonth)}-01`,
  };
}

export function daysInMonth(ym: string): number {
  assertYm(ym);
  const [year, month] = ym.split("-").map(Number);
  // Day 0 of the following month is the last day of `month`.
  return new Date(year, month, 0).getDate();
}

// Resolve a rule's billing day inside a concrete month. A rule billed on the
// 31st still charges in February, so clamp rather than produce an invalid date.
export function dueDateFor(ym: string, billingDay: number): string {
  const day = Math.min(Math.max(1, billingDay), daysInMonth(ym));
  return `${ym}-${pad2(day)}`;
}

export function shiftYm(ym: string, delta: number): string {
  assertYm(ym);
  const [year, month] = ym.split("-").map(Number);
  const zeroBased = year * 12 + (month - 1) + delta;
  return `${pad4(Math.floor(zeroBased / 12))}-${pad2((zeroBased % 12) + 1)}`;
}

export function ymOf(date: string): string {
  assertDate(date);
  return date.slice(0, 7);
}

export function currentYm(): string {
  const now = new Date();
  return `${pad4(now.getFullYear())}-${pad2(now.getMonth() + 1)}`;
}

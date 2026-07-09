// Display-side month helpers. The main process keeps its own copy because
// electron-vite bundles the two targets separately.

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function currentYm(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
}

export function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

export function shiftYm(ym: string, delta: number): string {
  const [year, month] = ym.split("-").map(Number);
  const zeroBased = year * 12 + (month - 1) + delta;
  return `${Math.floor(zeroBased / 12)}-${pad2((zeroBased % 12) + 1)}`;
}

// "2026-07" -> "July 2026"
export function formatYmLabel(ym: string): string {
  const [year, month] = ym.split("-").map(Number);
  return `${MONTHS[month - 1]} ${year}`;
}

// "2026-07" -> "Jul"
export function formatYmShort(ym: string): string {
  const [, month] = ym.split("-").map(Number);
  return MONTHS[month - 1].slice(0, 3);
}

// "2026-07-03" -> "Jul 3". Parsed componentwise so the string is not read as UTC.
export function formatDateLabel(date: string): string {
  const [, month, day] = date.split("-").map(Number);
  return `${MONTHS[month - 1].slice(0, 3)} ${day}`;
}

export function isFutureYm(ym: string): boolean {
  return ym > currentYm();
}

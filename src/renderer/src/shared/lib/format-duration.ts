// Duration formatters shared across the focus-analytics page. Kept together so
// hour/second display stays consistent between cards.

// Whole-hour value rendered to one decimal, e.g. 3.5 -> "3.5h".
export function formatHours(value: number): string {
  return `${value.toFixed(1)}h`;
}

// Second count rendered as the coarsest non-zero unit, e.g. 3720 -> "1h 2m".
export function formatSeconds(sec: number): string {
  const total = Math.max(0, Math.floor(sec));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  if (m > 0) return `${m}m`;
  return `${total}s`;
}

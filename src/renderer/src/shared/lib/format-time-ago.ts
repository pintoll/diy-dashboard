export function formatTimeAgo(isoString: string): string {
  return formatMsAgo(new Date(isoString).getTime());
}

/**
 * The same label from an instant rather than an ISO string — for timestamps
 * that need converting first, such as SQLite's zoneless `CURRENT_TIMESTAMP`
 * columns (`@shared/sqlite-time`).
 */
export function formatMsAgo(ms: number): string {
  const diff = Date.now() - ms;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

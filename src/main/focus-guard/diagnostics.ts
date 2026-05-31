// Shared diagnostics recording for the focus guards. app-guard (kill-on-sight)
// and site-guard (hosts block) keep their own diagnostics objects but share the
// history-trim policy and error stringification.

export const HISTORY_LIMIT = 30;

export interface GuardHistoryEntry<A extends string> {
  at: number;
  action: A;
  ok: boolean;
  message?: string;
}

interface RecordableDiagnostics<A extends string> {
  lastAction: A | null;
  lastActionAt: number | null;
  lastError: string | null;
  history: GuardHistoryEntry<A>[];
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err);
}

export function recordDiagnostic<A extends string>(
  diagnostics: RecordableDiagnostics<A>,
  action: A,
  ok: boolean,
  message?: string,
): void {
  const at = Date.now();
  diagnostics.lastAction = action;
  diagnostics.lastActionAt = at;
  diagnostics.lastError = ok ? null : (message ?? "unknown error");
  diagnostics.history.push({ at, action, ok, message });
  if (diagnostics.history.length > HISTORY_LIMIT) {
    diagnostics.history.splice(0, diagnostics.history.length - HISTORY_LIMIT);
  }
}

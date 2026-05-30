import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export type AppGuardAction = "enforce" | "release" | "kill";

export interface AppGuardHistoryEntry {
  at: number;
  action: AppGuardAction;
  ok: boolean;
  message?: string;
}

export interface AppGuardDiagnostics {
  platform: string;
  supported: boolean;
  enforcing: boolean;
  blockedExes: string[];
  killCount: number;
  lastKilledExe: string | null;
  lastKilledAt: number | null;
  lastAction: AppGuardAction | null;
  lastActionAt: number | null;
  lastError: string | null;
  history: AppGuardHistoryEntry[];
}

const HISTORY_LIMIT = 30;

const blockedExes = new Set<string>();

const diagnostics: AppGuardDiagnostics = {
  platform: process.platform,
  supported: process.platform === "win32",
  enforcing: false,
  blockedExes: [],
  killCount: 0,
  lastKilledExe: null,
  lastKilledAt: null,
  lastAction: null,
  lastActionAt: null,
  lastError: null,
  history: [],
};

function errorMessage(err: unknown): string {
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err);
}

function record(action: AppGuardAction, ok: boolean, message?: string): void {
  const at = Date.now();
  diagnostics.lastAction = action;
  diagnostics.lastActionAt = at;
  diagnostics.lastError = ok ? null : (message ?? "unknown error");
  diagnostics.history.push({ at, action, ok, message });
  if (diagnostics.history.length > HISTORY_LIMIT) {
    diagnostics.history.splice(0, diagnostics.history.length - HISTORY_LIMIT);
  }
}

export function enforce(exeList: string[]): AppGuardDiagnostics {
  blockedExes.clear();
  for (const exe of exeList) {
    const cleaned = exe.trim().toLowerCase();
    if (cleaned.length > 0) blockedExes.add(cleaned);
  }
  diagnostics.enforcing = true;
  diagnostics.blockedExes = [...blockedExes];
  record("enforce", true, `${blockedExes.size} exe(s)`);
  return diagnostics;
}

export function release(): AppGuardDiagnostics {
  blockedExes.clear();
  diagnostics.enforcing = false;
  diagnostics.blockedExes = [];
  record("release", true);
  return diagnostics;
}

export function getStatus(): AppGuardDiagnostics {
  return diagnostics;
}

export function getDiagnostics(): AppGuardDiagnostics {
  return diagnostics;
}

/**
 * Poll hook: if enforcing and the foreground exe is on the blocklist, kill it.
 * Called once per active-window poll tick. Never throws — the poll must survive
 * any kill failure. taskkill (vs process.kill) is more reliable for GUI apps and
 * /T tears down the process tree.
 */
export async function handleForeground(
  exeName: string,
  pid: number | undefined
): Promise<void> {
  if (!diagnostics.enforcing || !blockedExes.has(exeName)) return;
  if (typeof pid !== "number") {
    record("kill", false, `${exeName}: no pid`);
    return;
  }
  try {
    await execFileAsync("taskkill", ["/F", "/T", "/PID", String(pid)]);
    diagnostics.killCount += 1;
    diagnostics.lastKilledExe = exeName;
    diagnostics.lastKilledAt = Date.now();
    record("kill", true, exeName);
  } catch (err) {
    record("kill", false, `${exeName}: ${errorMessage(err)}`);
  }
}

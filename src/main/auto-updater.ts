import { app, BrowserWindow } from "electron";
import { appendFileSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { UpdateInfo, ProgressInfo, Logger } from "electron-updater";

let autoUpdater: import("electron-updater").AppUpdater;
let targetWindow: BrowserWindow | null = null;

const INITIAL_CHECK_DELAY_MS = 5_000;
// The window is only hidden on close, so a single startup check means a release
// published mid-session is never seen until the user happens to restart.
const RECHECK_INTERVAL_MS = 60 * 60 * 1000;

let logFilePath: string | null = null;
let initialCheckTimer: ReturnType<typeof setTimeout> | null = null;
let recheckTimer: ReturnType<typeof setInterval> | null = null;

function formatLogArg(value: unknown): string {
  if (value instanceof Error) return value.stack ?? value.message;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

// Truncate rather than rotate: this is a diagnostic tail, not an audit trail,
// and a second file would double the disk cost for history nobody reads. The
// check is a stat per write, which only happens on warn/error now.
const MAX_LOG_BYTES = 512 * 1024;

function writeLog(level: string, args: unknown[]): void {
  try {
    if (logFilePath === null) {
      const dir = app.getPath("logs");
      mkdirSync(dir, { recursive: true });
      logFilePath = join(dir, "updater.log");
    }
    const line = args.map(formatLogArg).join(" ");
    const entry = `${new Date().toISOString()} [${level}] ${line}\n`;
    const size = statSync(logFilePath, { throwIfNoEntry: false })?.size ?? 0;
    if (size + entry.length > MAX_LOG_BYTES) writeFileSync(logFilePath, "");
    appendFileSync(logFilePath, entry);
  } catch {
    // Logging is diagnostics only — it must never be the thing that breaks updates.
  }
}

// electron-updater's own logger defaults to `console`, which goes nowhere in a
// packaged Windows GUI build (no stdout attached). Without this, every failure
// below is invisible.
//
// `info` is dropped on purpose. The app lives in the tray and rechecks hourly,
// so electron-updater's checking / resolving / not-available stream is almost
// all of the volume, each line a synchronous append on the main thread — for a
// message that says nothing happened. The diagnostic value is in the failures.
const updaterLogger: Logger = {
  info: () => {},
  warn: (message?: unknown) => writeLog("warn", [message]),
  error: (message?: unknown) => writeLog("error", [message]),
};

async function getAutoUpdater(): Promise<import("electron-updater").AppUpdater> {
  if (!autoUpdater) {
    const mod = (await import("electron-updater")) as typeof import("electron-updater") & {
      default?: typeof import("electron-updater");
    };
    // electron-updater is CommonJS and exposes `autoUpdater` through a lazy
    // Object.defineProperty getter. cjs-module-lexer cannot see through that
    // form, so importing it from this ESM main bundle yields a namespace whose
    // `autoUpdater` is undefined — the real one hangs off `default`.
    const resolved = (mod.default ?? mod).autoUpdater;
    if (!resolved) {
      throw new Error("electron-updater did not expose an autoUpdater instance");
    }
    autoUpdater = resolved;
  }
  return autoUpdater;
}

// Every status push goes through here. `targetWindow` is captured once and the
// hourly recheck outlives the window: on quit (or any teardown that destroys the
// BrowserWindow while the process lingers) a bare `.webContents.send` throws
// "Object has been destroyed", which would escape checkForUpdates' catch and
// surface as an unhandled rejection.
function sendStatus(payload: Record<string, unknown>): void {
  if (targetWindow === null || targetWindow.isDestroyed()) return;
  targetWindow.webContents.send("update-status", payload);
}

function reportError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  writeLog("error", [error]);
  sendStatus({ status: "error", message });
}

export async function initAutoUpdater(mainWindow: BrowserWindow): Promise<void> {
  targetWindow = mainWindow;

  let updater: import("electron-updater").AppUpdater;
  try {
    updater = await getAutoUpdater();
  } catch (error) {
    // This used to reject into nothing: the caller never caught it and no event
    // listener existed yet, so the renderer was never told either.
    reportError(error);
    return;
  }

  updater.logger = updaterLogger;

  // The feed is resolved from the bundled app-update.yml that electron-builder
  // generates from the `publish` block (GitHub, pintoll/diy-dashboard). The repo
  // is public, so releases are fetched anonymously — no token, no `setFeedURL`
  // override, and nothing credential-shaped baked into the shipped binary.
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;

  updater.on("checking-for-update", () => {
    sendStatus({ status: "checking" });
  });

  updater.on("update-available", (info: UpdateInfo) => {
    sendStatus({ status: "available", version: info.version });
  });

  updater.on("update-not-available", () => {
    sendStatus({ status: "not-available" });
  });

  updater.on("download-progress", (progress: ProgressInfo) => {
    sendStatus({ status: "downloading", percent: progress.percent });
  });

  updater.on("update-downloaded", (info: UpdateInfo) => {
    sendStatus({ status: "downloaded", version: info.version });
  });

  updater.on("error", (error: Error) => {
    reportError(error);
  });
}

export async function checkForUpdates(): Promise<void> {
  try {
    const updater = await getAutoUpdater();
    await updater.checkForUpdates();
  } catch (error) {
    reportError(error);
  }
}

export function scheduleUpdateChecks(): void {
  stopUpdateChecks();
  initialCheckTimer = setTimeout(() => void checkForUpdates(), INITIAL_CHECK_DELAY_MS);
  recheckTimer = setInterval(() => void checkForUpdates(), RECHECK_INTERVAL_MS);
}

// Called on quit: a check that fires while the app is tearing down can only
// report into a window that is already gone.
export function stopUpdateChecks(): void {
  if (initialCheckTimer !== null) clearTimeout(initialCheckTimer);
  if (recheckTimer !== null) clearInterval(recheckTimer);
  initialCheckTimer = null;
  recheckTimer = null;
}

export async function quitAndInstall(): Promise<void> {
  try {
    const updater = await getAutoUpdater();
    updater.quitAndInstall();
  } catch (error) {
    reportError(error);
  }
}

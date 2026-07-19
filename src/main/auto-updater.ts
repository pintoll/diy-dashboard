import { app, BrowserWindow } from "electron";
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { UpdateInfo, ProgressInfo, Logger } from "electron-updater";

let autoUpdater: import("electron-updater").AppUpdater;
let targetWindow: BrowserWindow | null = null;

const INITIAL_CHECK_DELAY_MS = 5_000;
// The window is only hidden on close, so a single startup check means a release
// published mid-session is never seen until the user happens to restart.
const RECHECK_INTERVAL_MS = 60 * 60 * 1000;

let logFilePath: string | null = null;

function formatLogArg(value: unknown): string {
  if (value instanceof Error) return value.stack ?? value.message;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function writeLog(level: string, args: unknown[]): void {
  try {
    if (logFilePath === null) {
      const dir = app.getPath("logs");
      mkdirSync(dir, { recursive: true });
      logFilePath = join(dir, "updater.log");
    }
    const line = args.map(formatLogArg).join(" ");
    appendFileSync(logFilePath, `${new Date().toISOString()} [${level}] ${line}\n`);
  } catch {
    // Logging is diagnostics only — it must never be the thing that breaks updates.
  }
}

// electron-updater's own logger defaults to `console`, which goes nowhere in a
// packaged Windows GUI build (no stdout attached). Without this, every failure
// below is invisible.
const updaterLogger: Logger = {
  info: (message?: unknown) => writeLog("info", [message]),
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

function reportError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  writeLog("error", [error]);
  targetWindow?.webContents.send("update-status", { status: "error", message });
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
    mainWindow.webContents.send("update-status", { status: "checking" });
  });

  updater.on("update-available", (info: UpdateInfo) => {
    mainWindow.webContents.send("update-status", {
      status: "available",
      version: info.version,
    });
  });

  updater.on("update-not-available", () => {
    mainWindow.webContents.send("update-status", { status: "not-available" });
  });

  updater.on("download-progress", (progress: ProgressInfo) => {
    mainWindow.webContents.send("update-status", {
      status: "downloading",
      percent: progress.percent,
    });
  });

  updater.on("update-downloaded", (info: UpdateInfo) => {
    mainWindow.webContents.send("update-status", {
      status: "downloaded",
      version: info.version,
    });
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
  setTimeout(() => void checkForUpdates(), INITIAL_CHECK_DELAY_MS);
  setInterval(() => void checkForUpdates(), RECHECK_INTERVAL_MS);
}

export async function quitAndInstall(): Promise<void> {
  try {
    const updater = await getAutoUpdater();
    updater.quitAndInstall();
  } catch (error) {
    reportError(error);
  }
}

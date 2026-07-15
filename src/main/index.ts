import {
  app,
  BrowserWindow,
  ipcMain,
  Notification,
  Tray,
  Menu,
  nativeImage,
  powerMonitor,
  screen,
  shell,
} from "electron";
import path from "path";
import { pathToFileURL } from "url";
import { initAutoUpdater, checkForUpdates, quitAndInstall } from "./auto-updater";
import { registerMarketIpc } from "./market/ipc";
import { registerFocusGuardIpc } from "./focus-guard/ipc";
import { handleForeground } from "./focus-guard/app-guard";
import { unblock as unblockSites, stripFocusBlockSync } from "./focus-guard/site-guard";
import { registerDailyNewsIpc } from "./daily-news/ipc";
import { registerSettingsIpc } from "./settings/ipc";
import { migrateSecretsToSafeStorage } from "./settings/store";
import { startDailyNewsScheduler } from "./daily-news/scheduler";
import { registerFinanceIpc } from "./finance/ipc";
import { registerTodosIpc } from "./todos/ipc";
import { registerPomodoroIpc } from "./pomodoro/ipc";
import { startAgentApi, stopAgentApi } from "./agent-api/server";
import { registerPomodoroBridgeIpc } from "./agent-api/pomodoro-bridge";

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
const DEFAULT_TRAY_TOOLTIP = "DIY Dashboard";

// Closing the window only hides it to the tray, so a "closed" app is still
// running. Without this lock, launching the app again spawns a rival instance:
// two trays, two news schedulers, two active-window pollers, and a fight over
// the agent-api port that leaves the visible window unable to see writes the
// agent makes against the other instance. Surface the existing window instead.
const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow === null) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
}

function createTray(): void {
  const iconPath = path.join(__dirname, "../../resources/tray-icon.png");
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });

  tray = new Tray(icon);
  tray.setToolTip(DEFAULT_TRAY_TOOLTIP);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Show",
      click: () => {
        mainWindow?.show();
      },
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  tray.on("click", () => {
    mainWindow?.show();
  });
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.mjs"),
      contextIsolation: true,
      sandbox: false,
      backgroundThrottling: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // URLs here include untrusted RSS/Gemini news links. Only real web links
    // may reach the OS: file:, UNC paths, and protocol handlers like ms-msdt:
    // are openExternal code-execution footguns.
    if (/^https?:/i.test(url)) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  // The app never navigates after load (HashRouter changes only the fragment),
  // so block real navigations: a compromised renderer must not be able to
  // replace itself with a remote origin that still holds the full IPC bridge.
  const rendererRoot = pathToFileURL(path.join(__dirname, "../renderer")).href + "/";
  mainWindow.webContents.on("will-navigate", (event, url) => {
    const devServerUrl = process.env["ELECTRON_RENDERER_URL"];
    const isDevServer = !app.isPackaged && !!devServerUrl && url.startsWith(devServerUrl);
    if (!isDevServer && !url.startsWith(rendererRoot)) {
      event.preventDefault();
    }
  });

  mainWindow.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  if (!app.isPackaged && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}

// IPC handlers
ipcMain.handle(
  "show-notification",
  (_event, payload: { title?: unknown; body?: unknown }) => {
    // IPC boundary: don't trust the renderer's payload shape. The caps keep a
    // hijacked renderer from stuffing arbitrary content into system alerts.
    const title =
      typeof payload?.title === "string" ? payload.title.slice(0, 128) : "";
    const body =
      typeof payload?.body === "string" ? payload.body.slice(0, 512) : "";
    if (title === "" && body === "") return;
    const notification = new Notification({ title, body });

    notification.on("click", () => {
      mainWindow?.show();
    });

    notification.show();
  }
);

ipcMain.handle("is-notification-supported", () => {
  return Notification.isSupported();
});

ipcMain.handle("pomodoro:get-idle-time", () => {
  return powerMonitor.getSystemIdleTime();
});

ipcMain.handle("pomodoro:flash-frame", () => {
  mainWindow?.flashFrame(true);
});

let activeWindowPollInterval: NodeJS.Timeout | null = null;
let activeSessionRefCount = 0;
type ActiveWindowFn = () => Promise<{
  title?: string;
  bounds?: { x: number; y: number; width: number; height: number };
  owner?: { name?: string; processId?: number };
} | null | undefined>;
let cachedActiveWindow: ActiveWindowFn | null | "unavailable" = null;

type PollOutcome =
  | "ok"
  | "addon_not_loaded"
  | "addon_threw"
  | "no_result"
  | "missing_fields"
  | "empty_exe"
  | "off_primary";

type DetectionDiagnostics = {
  platform: string;
  pollSupported: boolean;
  addonState: "pending" | "loaded" | "unavailable";
  addonError: string | null;
  pollIntervalActive: boolean;
  pollsAttempted: number;
  outcomes: Record<PollOutcome, number>;
  lastOutcome: PollOutcome | null;
  lastSentExe: string | null;
  lastSentAt: number | null;
  lastErrorMessage: string | null;
};

function makeOutcomeCounters(): Record<PollOutcome, number> {
  return {
    ok: 0,
    addon_not_loaded: 0,
    addon_threw: 0,
    no_result: 0,
    missing_fields: 0,
    empty_exe: 0,
    off_primary: 0,
  };
}

const detectionDiagnostics: DetectionDiagnostics = {
  platform: process.platform,
  pollSupported: process.platform === "win32",
  addonState: "pending",
  addonError: null,
  pollIntervalActive: false,
  pollsAttempted: 0,
  outcomes: makeOutcomeCounters(),
  lastOutcome: null,
  lastSentExe: null,
  lastSentAt: null,
  lastErrorMessage: null,
};

async function loadActiveWindow(): Promise<ActiveWindowFn | null> {
  if (cachedActiveWindow === "unavailable") return null;
  if (cachedActiveWindow !== null) return cachedActiveWindow;
  try {
    const mod = (await import("get-windows")) as { activeWindow?: ActiveWindowFn };
    if (typeof mod.activeWindow !== "function") {
      cachedActiveWindow = "unavailable";
      detectionDiagnostics.addonState = "unavailable";
      detectionDiagnostics.addonError =
        "get-windows export 'activeWindow' is not a function";
      console.error("[pomodoro-detect] addon export missing");
      return null;
    }
    cachedActiveWindow = mod.activeWindow;
    detectionDiagnostics.addonState = "loaded";
    detectionDiagnostics.addonError = null;
    console.log("[pomodoro-detect] addon loaded");
    return cachedActiveWindow;
  } catch (err) {
    cachedActiveWindow = "unavailable";
    detectionDiagnostics.addonState = "unavailable";
    detectionDiagnostics.addonError =
      err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.error("[pomodoro-detect] addon load failed:", err);
    return null;
  }
}

function recordOutcome(outcome: PollOutcome): void {
  detectionDiagnostics.outcomes[outcome] += 1;
  detectionDiagnostics.lastOutcome = outcome;
}

async function pollActiveWindow(): Promise<void> {
  const target = mainWindow;
  if (target === null || target.isDestroyed()) return;

  detectionDiagnostics.pollsAttempted += 1;

  const activeWindow = await loadActiveWindow();
  if (activeWindow === null) {
    recordOutcome("addon_not_loaded");
    return;
  }

  let result;
  try {
    result = await activeWindow();
  } catch (err) {
    recordOutcome("addon_threw");
    detectionDiagnostics.lastErrorMessage =
      err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.error("[pomodoro-detect] activeWindow() threw:", err);
    return;
  }

  if (!result) {
    recordOutcome("no_result");
    return;
  }
  if (!result.bounds || !result.owner) {
    recordOutcome("missing_fields");
    return;
  }

  const exeName = result.owner.name?.toLowerCase() ?? "";
  if (exeName === "") {
    recordOutcome("empty_exe");
    return;
  }

  // App block (kill-on-sight): kill a blocked foreground app on any monitor.
  // Runs before the primary-display filter below, which is telemetry-only.
  void handleForeground(exeName, result.owner.processId);

  const center = {
    x: Math.round(result.bounds.x + result.bounds.width / 2),
    y: Math.round(result.bounds.y + result.bounds.height / 2),
  };
  const primaryId = screen.getPrimaryDisplay().id;
  const nearestId = screen.getDisplayNearestPoint(center).id;
  if (nearestId !== primaryId) {
    recordOutcome("off_primary");
    return;
  }

  if (target.isDestroyed()) return;

  recordOutcome("ok");
  detectionDiagnostics.lastSentExe = exeName;
  detectionDiagnostics.lastSentAt = Date.now();
  target.webContents.send("pomodoro:active-window", {
    exeName,
    title: result.title ?? "",
  });
}

ipcMain.handle("pomodoro:session-started", () => {
  if (process.platform !== "win32") return;
  if (activeSessionRefCount === 0) {
    detectionDiagnostics.pollsAttempted = 0;
    detectionDiagnostics.outcomes = makeOutcomeCounters();
    detectionDiagnostics.lastOutcome = null;
    detectionDiagnostics.lastSentExe = null;
    detectionDiagnostics.lastSentAt = null;
    detectionDiagnostics.lastErrorMessage = null;
  }
  activeSessionRefCount += 1;
  if (activeWindowPollInterval !== null) return;
  detectionDiagnostics.pollIntervalActive = true;
  activeWindowPollInterval = setInterval(() => {
    void pollActiveWindow();
  }, 10_000);
});

ipcMain.handle("pomodoro:session-ended", () => {
  if (process.platform !== "win32") return;
  activeSessionRefCount = Math.max(0, activeSessionRefCount - 1);
  if (activeSessionRefCount > 0) return;
  if (activeWindowPollInterval !== null) {
    clearInterval(activeWindowPollInterval);
    activeWindowPollInterval = null;
  }
  detectionDiagnostics.pollIntervalActive = false;
});

ipcMain.handle("pomodoro:get-detection-diagnostics", () => detectionDiagnostics);

ipcMain.handle("tray:set-tooltip", (_event, text: string | null) => {
  if (tray === null || tray.isDestroyed()) return;
  const next = typeof text === "string" && text.length > 0 ? text : DEFAULT_TRAY_TOOLTIP;
  tray.setToolTip(next);
});

ipcMain.handle("check-for-updates", () => {
  return checkForUpdates();
});

ipcMain.handle("quit-and-install-update", () => {
  quitAndInstall();
});

let isQuitting = false;

app.on("before-quit", () => {
  isQuitting = true;
  // A rejected second instance quits through here too. It owns none of this
  // shared state, and stripping the hosts block would unblock sites for the
  // live instance's running focus session.
  if (!gotSingleInstanceLock) return;
  // Release the hosts block on real quit (close-to-tray does not fire this, so
  // an active session keeps blocking while hidden and releases only on quit).
  stripFocusBlockSync();
  stopAgentApi();
});

app.on("window-all-closed", () => {
  // No-op: keep app alive in tray
});

function createAppMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    { role: "fileMenu" },
    { role: "editMenu" },
    { role: "viewMenu" },
    { role: "windowMenu" },
    {
      role: "help",
      submenu: [
        {
          label: `Version ${app.getVersion()}`,
          enabled: false,
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(async () => {
  // The lock loser is already quitting; it must not create a tray, bind the
  // agent-api port, or start the scheduler on its way out.
  if (!gotSingleInstanceLock) return;

  // Before anything that reads an API key (IPC handlers, the news scheduler):
  // upgrades plaintext keys from pre-safeStorage settings.json files in place.
  migrateSecretsToSafeStorage();

  createAppMenu();
  createTray();
  registerMarketIpc();
  registerFocusGuardIpc();
  registerDailyNewsIpc();
  registerSettingsIpc();
  registerFinanceIpc();
  registerTodosIpc();
  registerPomodoroIpc();
  registerPomodoroBridgeIpc();
  startAgentApi();
  startDailyNewsScheduler();
  // A focus session is never active on a fresh launch (sessionActive is
  // ephemeral), so strip any hosts block left over from a crash or force-quit —
  // keeps the "any exit = unblock" invariant airtight across restarts.
  if (process.platform === "win32") {
    void unblockSites();
  }
  createWindow();

  if (app.isPackaged && mainWindow) {
    await initAutoUpdater(mainWindow);
    setTimeout(() => checkForUpdates(), 5000);
  }
});

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
import { initAutoUpdater, checkForUpdates, quitAndInstall } from "./auto-updater";
import { registerMarketIpc } from "./market/ipc";

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

function createTray(): void {
  const iconPath = path.join(__dirname, "../../resources/tray-icon.png");
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });

  tray = new Tray(icon);
  tray.setToolTip("DIY Dashboard");

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
    shell.openExternal(url);
    return { action: "deny" };
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
  (_event, { title, body }: { title: string; body: string }) => {
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
  owner?: { name?: string };
} | null | undefined>;
let cachedActiveWindow: ActiveWindowFn | null | "unavailable" = null;

async function loadActiveWindow(): Promise<ActiveWindowFn | null> {
  if (cachedActiveWindow === "unavailable") return null;
  if (cachedActiveWindow !== null) return cachedActiveWindow;
  try {
    const mod = (await import("get-windows")) as { activeWindow?: ActiveWindowFn };
    if (typeof mod.activeWindow !== "function") {
      cachedActiveWindow = "unavailable";
      return null;
    }
    cachedActiveWindow = mod.activeWindow;
    return cachedActiveWindow;
  } catch {
    cachedActiveWindow = "unavailable";
    return null;
  }
}

async function pollActiveWindow(): Promise<void> {
  const target = mainWindow;
  if (target === null || target.isDestroyed()) return;

  const activeWindow = await loadActiveWindow();
  if (activeWindow === null) return;

  let result;
  try {
    result = await activeWindow();
  } catch {
    return;
  }
  if (!result || !result.bounds || !result.owner) return;

  const exeName = result.owner.name?.toLowerCase() ?? "";
  if (exeName === "") return;

  const center = {
    x: Math.round(result.bounds.x + result.bounds.width / 2),
    y: Math.round(result.bounds.y + result.bounds.height / 2),
  };
  const primaryId = screen.getPrimaryDisplay().id;
  const nearestId = screen.getDisplayNearestPoint(center).id;
  if (nearestId !== primaryId) return;

  if (target.isDestroyed()) return;
  target.webContents.send("pomodoro:active-window", {
    exeName,
    title: result.title ?? "",
  });
}

ipcMain.handle("pomodoro:session-started", () => {
  if (process.platform !== "win32") return;
  activeSessionRefCount += 1;
  if (activeWindowPollInterval !== null) return;
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
  createAppMenu();
  createTray();
  registerMarketIpc();
  createWindow();

  if (app.isPackaged && mainWindow) {
    await initAutoUpdater(mainWindow);
    setTimeout(() => checkForUpdates(), 5000);
  }
});

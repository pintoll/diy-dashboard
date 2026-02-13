import {
  app,
  BrowserWindow,
  ipcMain,
  Notification,
  Tray,
  Menu,
  nativeImage,
  shell,
} from "electron";
import path from "path";
import { initAutoUpdater, checkForUpdates, quitAndInstall } from "./auto-updater";

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

app.whenReady().then(async () => {
  createTray();
  createWindow();

  if (app.isPackaged && mainWindow) {
    await initAutoUpdater(mainWindow);
    setTimeout(() => checkForUpdates(), 5000);
  }
});

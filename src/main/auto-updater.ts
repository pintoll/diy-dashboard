import { BrowserWindow } from "electron";
import type { UpdateInfo, ProgressInfo } from "electron-updater";

let autoUpdater: import("electron-updater").AppUpdater;

async function getAutoUpdater(): Promise<import("electron-updater").AppUpdater> {
  if (!autoUpdater) {
    const mod = await import("electron-updater");
    autoUpdater = mod.autoUpdater;
  }
  return autoUpdater;
}

export async function initAutoUpdater(mainWindow: BrowserWindow): Promise<void> {
  const updater = await getAutoUpdater();

  updater.setFeedURL({
    provider: "github",
    owner: "pintoll",
    repo: "diy-dashboard",
    token: "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",
  });
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
    mainWindow.webContents.send("update-status", {
      status: "error",
      message: error.message,
    });
  });
}

export async function checkForUpdates(): Promise<void> {
  const updater = await getAutoUpdater();
  await updater.checkForUpdates();
}

export async function quitAndInstall(): Promise<void> {
  const updater = await getAutoUpdater();
  updater.quitAndInstall();
}

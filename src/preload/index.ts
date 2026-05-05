import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("marketAPI", {
  fred: {
    getSeries: (seriesId: string, limit?: number) =>
      ipcRenderer.invoke("market:fred:getSeries", { seriesId, limit }),
    getMany: (seriesIds: string[], limit?: number) =>
      ipcRenderer.invoke("market:fred:getMany", { seriesIds, limit }),
    getReleaseDates: (releaseIds: number[], from: string, to: string) =>
      ipcRenderer.invoke("market:fred:getReleaseDates", {
        releaseIds,
        from,
        to,
      }),
  },
});

contextBridge.exposeInMainWorld("electronAPI", {
  showNotification: (payload: { title: string; body: string }) =>
    ipcRenderer.invoke("show-notification", payload),
  isNotificationSupported: () =>
    ipcRenderer.invoke("is-notification-supported"),
  onUpdateStatus: (callback: (payload: UpdateStatusPayload) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: UpdateStatusPayload) =>
      callback(payload);
    ipcRenderer.on("update-status", listener);
    return () => {
      ipcRenderer.removeListener("update-status", listener);
    };
  },
  checkForUpdates: () => ipcRenderer.invoke("check-for-updates"),
  quitAndInstallUpdate: () => ipcRenderer.invoke("quit-and-install-update"),
  getIdleTime: () => ipcRenderer.invoke("pomodoro:get-idle-time"),
  flashFrame: () => ipcRenderer.invoke("pomodoro:flash-frame"),
});

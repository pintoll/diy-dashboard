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
  notifyPomodoroSessionStarted: () =>
    ipcRenderer.invoke("pomodoro:session-started"),
  notifyPomodoroSessionEnded: () =>
    ipcRenderer.invoke("pomodoro:session-ended"),
  getDetectionDiagnostics: () =>
    ipcRenderer.invoke("pomodoro:get-detection-diagnostics"),
  setTrayTooltip: (text: string | null) =>
    ipcRenderer.invoke("tray:set-tooltip", text),
  onActiveWindow: (callback: (data: ActiveWindowPayload) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: ActiveWindowPayload) =>
      callback(data);
    ipcRenderer.on("pomodoro:active-window", listener);
    return () => {
      ipcRenderer.removeListener("pomodoro:active-window", listener);
    };
  },
});

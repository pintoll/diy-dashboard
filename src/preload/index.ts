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
  siteGuard: {
    getStatus: () => ipcRenderer.invoke("focus:site:get-status"),
    grantPermission: () => ipcRenderer.invoke("focus:site:grant-permission"),
    block: (domains: string[]) => ipcRenderer.invoke("focus:site:block", domains),
    unblock: () => ipcRenderer.invoke("focus:site:unblock"),
  },
  appGuard: {
    getStatus: () => ipcRenderer.invoke("focus:app:get-status"),
    enforce: (exes: string[]) => ipcRenderer.invoke("focus:app:enforce", exes),
    release: () => ipcRenderer.invoke("focus:app:release"),
  },
  onActiveWindow: (callback: (data: ActiveWindowPayload) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: ActiveWindowPayload) =>
      callback(data);
    ipcRenderer.on("pomodoro:active-window", listener);
    return () => {
      ipcRenderer.removeListener("pomodoro:active-window", listener);
    };
  },
  dailyNews: {
    fetch: () => ipcRenderer.invoke("dailyNews:fetch"),
    sendFeedback: (payload: {
      articleId: number;
      action: "like" | "dislike" | "unlike" | "undislike" | "click";
    }) => ipcRenderer.invoke("dailyNews:feedback", payload),
    onStatus: (callback: (status: DailyNewsStatus) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, status: DailyNewsStatus) =>
        callback(status);
      ipcRenderer.on("dailyNews:status", listener);
      return () => {
        ipcRenderer.removeListener("dailyNews:status", listener);
      };
    },
  },
  settings: {
    getGeminiKey: () => ipcRenderer.invoke("settings:getGeminiKey"),
    setGeminiKey: (key: string) =>
      ipcRenderer.invoke("settings:setGeminiKey", key),
  },
  finance: {
    accounts: {
      list: () => ipcRenderer.invoke("finance:accounts:list"),
      create: (input: FinanceAccountInput) =>
        ipcRenderer.invoke("finance:accounts:create", input),
      update: (id: number, patch: Partial<FinanceAccountInput>) =>
        ipcRenderer.invoke("finance:accounts:update", { id, patch }),
      archive: (id: number) => ipcRenderer.invoke("finance:accounts:archive", id),
    },
    categories: {
      list: () => ipcRenderer.invoke("finance:categories:list"),
      create: (input: FinanceCategoryInput) =>
        ipcRenderer.invoke("finance:categories:create", input),
    },
    transactions: {
      list: (filter?: FinanceTransactionFilter) =>
        ipcRenderer.invoke("finance:transactions:list", filter),
      create: (input: FinanceTransactionInput) =>
        ipcRenderer.invoke("finance:transactions:create", input),
      update: (id: number, patch: Partial<FinanceTransactionInput>) =>
        ipcRenderer.invoke("finance:transactions:update", { id, patch }),
      remove: (id: number) => ipcRenderer.invoke("finance:transactions:delete", id),
    },
    valuations: {
      list: (accountId: number) =>
        ipcRenderer.invoke("finance:valuations:list", accountId),
      upsert: (input: FinanceValuationInput) =>
        ipcRenderer.invoke("finance:valuations:upsert", input),
    },
    recurring: {
      list: () => ipcRenderer.invoke("finance:recurring:list"),
      create: (input: FinanceRecurringRuleInput) =>
        ipcRenderer.invoke("finance:recurring:create", input),
      update: (id: number, patch: Partial<FinanceRecurringRuleInput>) =>
        ipcRenderer.invoke("finance:recurring:update", { id, patch }),
      remove: (id: number) => ipcRenderer.invoke("finance:recurring:delete", id),
      pending: (ym: string) => ipcRenderer.invoke("finance:recurring:pending", ym),
      confirm: (input: FinanceConfirmChargeInput) =>
        ipcRenderer.invoke("finance:recurring:confirm", input),
      skip: (input: FinanceSkipChargeInput) =>
        ipcRenderer.invoke("finance:recurring:skip", input),
      unskip: (input: FinanceSkipChargeInput) =>
        ipcRenderer.invoke("finance:recurring:unskip", input),
    },
    summary: {
      monthly: (ym: string) => ipcRenderer.invoke("finance:summary:monthly", ym),
      recent: (months: number, endYm?: string) =>
        ipcRenderer.invoke("finance:summary:recent", { months, endYm }),
    },
    overview: () => ipcRenderer.invoke("finance:overview"),
    rate: {
      get: () => ipcRenderer.invoke("finance:rate:get"),
      set: (rate: number) => ipcRenderer.invoke("finance:rate:set", rate),
    },
  },
});

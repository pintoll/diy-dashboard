import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("marketAPI", {
  connectors: {
    list: () => ipcRenderer.invoke("connectors:list"),
    upsert: (connector: unknown) =>
      ipcRenderer.invoke("connectors:upsert", connector),
    patch: (id: string, patch: unknown) =>
      ipcRenderer.invoke("connectors:patch", { id, patch }),
    remove: (id: string) => ipcRenderer.invoke("connectors:remove", { id }),
    test: (connector: unknown) =>
      ipcRenderer.invoke("connectors:test", { connector }),
    fetchSeries: (ids: string[], limit: number) =>
      ipcRenderer.invoke("connectors:fetchSeries", { ids, limit }),
    fetchEvents: (ids: string[], from: string, to: string) =>
      ipcRenderer.invoke("connectors:fetchEvents", { ids, from, to }),
  },
  credentials: {
    list: () => ipcRenderer.invoke("credentials:list"),
    set: (name: string, secret: string, allowedHost: string) =>
      ipcRenderer.invoke("credentials:set", { name, secret, allowedHost }),
    remove: (name: string) => ipcRenderer.invoke("credentials:remove", { name }),
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
  // Renderer-authoritative pomodoro timer bridge for the local agent API: push
  // raw store snapshots to main, and execute commands main forwards back.
  pomodoroBridge: {
    sendSnapshot: (payload: PomodoroBridgePush) =>
      ipcRenderer.send("pomodoro:bridge:snapshot", payload),
    onCommand: (callback: (command: PomodoroBridgeCommand) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, command: PomodoroBridgeCommand) =>
        callback(command);
      ipcRenderer.on("pomodoro:bridge:command", listener);
      return () => {
        ipcRenderer.removeListener("pomodoro:bridge:command", listener);
      };
    },
    sendCommandResult: (payload: PomodoroCommandResult) =>
      ipcRenderer.send("pomodoro:bridge:command-result", payload),
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
  pomodoro: {
    list: () => ipcRenderer.invoke("pomodoro:sessions:list"),
    record: (session: PomodoroSessionDTO) =>
      ipcRenderer.invoke("pomodoro:sessions:record", session),
    updateNote: (id: string, note: string | null) =>
      ipcRenderer.invoke("pomodoro:sessions:update-note", { id, note }),
    import: (sessions: PomodoroSessionDTO[]) =>
      ipcRenderer.invoke("pomodoro:sessions:import", sessions),
  },
  todos: {
    list: (filter?: TodoListFilter) => ipcRenderer.invoke("todos:list", filter),
    overdue: (before?: string) => ipcRenderer.invoke("todos:overdue", before),
    backlog: () => ipcRenderer.invoke("todos:backlog"),
    create: (input: TodoCreateInput) => ipcRenderer.invoke("todos:create", input),
    update: (id: string, patch: TodoPatch) =>
      ipcRenderer.invoke("todos:update", { id, patch }),
    remove: (id: string) => ipcRenderer.invoke("todos:delete", id),
    titlesByIds: (ids: string[]) =>
      ipcRenderer.invoke("todos:titles-by-ids", ids),
    reorder: (date: string | null, ids: string[]) =>
      ipcRenderer.invoke("todos:reorder", { date, ids }),
    active: {
      get: () => ipcRenderer.invoke("todos:active:get"),
      set: (id: string | null) => ipcRenderer.invoke("todos:active:set", id),
    },
    desk: {
      get: () => ipcRenderer.invoke("todos:desk:get"),
      add: (id: string) => ipcRenderer.invoke("todos:desk:add", id),
      remove: (id: string) => ipcRenderer.invoke("todos:desk:remove", id),
      clear: () => ipcRenderer.invoke("todos:desk:clear"),
    },
    recordWork: (input: TodoRecordWorkInput) =>
      ipcRenderer.invoke("todos:record-work", input),
    onChanged: (callback: (payload: TodosChangedPayload) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: TodosChangedPayload) =>
        callback(payload);
      ipcRenderer.on("todos:changed", listener);
      return () => {
        ipcRenderer.removeListener("todos:changed", listener);
      };
    },
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

type UpdateStatusPayload =
  | { status: "checking" }
  | { status: "available"; version: string }
  | { status: "not-available" }
  | { status: "downloading"; percent: number }
  | { status: "downloaded"; version: string }
  | { status: "error"; message: string };

interface ActiveWindowPayload {
  exeName: string;
  title: string;
}

type DetectionPollOutcome =
  | "ok"
  | "addon_not_loaded"
  | "addon_threw"
  | "no_result"
  | "missing_fields"
  | "empty_exe"
  | "off_primary";

interface DetectionDiagnostics {
  platform: string;
  pollSupported: boolean;
  addonState: "pending" | "loaded" | "unavailable";
  addonError: string | null;
  pollIntervalActive: boolean;
  pollsAttempted: number;
  outcomes: Record<DetectionPollOutcome, number>;
  lastOutcome: DetectionPollOutcome | null;
  lastSentExe: string | null;
  lastSentAt: number | null;
  lastErrorMessage: string | null;
}

type SiteGuardAction = "grant" | "block" | "unblock" | "probe";

interface SiteGuardHistoryEntry {
  at: number;
  action: SiteGuardAction;
  ok: boolean;
  message?: string;
}

interface SiteGuardDiagnostics {
  platform: string;
  supported: boolean;
  hostsPath: string;
  hasWritePermission: boolean | null;
  isBlocked: boolean;
  blockedDomains: string[];
  lastAction: SiteGuardAction | null;
  lastActionAt: number | null;
  lastError: string | null;
  history: SiteGuardHistoryEntry[];
}

interface SiteGuardAPI {
  getStatus: () => Promise<SiteGuardDiagnostics>;
  grantPermission: () => Promise<SiteGuardDiagnostics>;
  block: (domains: string[]) => Promise<SiteGuardDiagnostics>;
  unblock: () => Promise<SiteGuardDiagnostics>;
}

interface ElectronAPI {
  showNotification: (payload: { title: string; body: string }) => Promise<void>;
  isNotificationSupported: () => Promise<boolean>;
  onUpdateStatus: (callback: (payload: UpdateStatusPayload) => void) => () => void;
  checkForUpdates: () => Promise<void>;
  quitAndInstallUpdate: () => Promise<void>;
  getIdleTime: () => Promise<number>;
  flashFrame: () => Promise<void>;
  notifyPomodoroSessionStarted: () => Promise<void>;
  notifyPomodoroSessionEnded: () => Promise<void>;
  onActiveWindow: (callback: (data: ActiveWindowPayload) => void) => () => void;
  getDetectionDiagnostics: () => Promise<DetectionDiagnostics>;
  setTrayTooltip: (text: string | null) => Promise<void>;
  siteGuard: SiteGuardAPI;
}

interface MarketSeriesPoint {
  date: string;
  value: number;
}

interface MarketSeriesSnapshot {
  id: string;
  points: MarketSeriesPoint[];
  fetchedAt: string;
}

interface FredReleaseDateEntry {
  releaseId: number;
  releaseName: string;
  date: string;
}

interface MarketAPI {
  fred: {
    getSeries: (seriesId: string, limit?: number) => Promise<MarketSeriesSnapshot>;
    getMany: (seriesIds: string[], limit?: number) => Promise<MarketSeriesSnapshot[]>;
    getReleaseDates: (
      releaseIds: number[],
      from: string,
      to: string
    ) => Promise<FredReleaseDateEntry[]>;
  };
}

interface Window {
  electronAPI?: ElectronAPI;
  marketAPI?: MarketAPI;
}

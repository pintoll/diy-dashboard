type UpdateStatusPayload =
  | { status: "checking" }
  | { status: "available"; version: string }
  | { status: "not-available" }
  | { status: "downloading"; percent: number }
  | { status: "downloaded"; version: string }
  | { status: "error"; message: string };

interface ElectronAPI {
  showNotification: (payload: { title: string; body: string }) => Promise<void>;
  isNotificationSupported: () => Promise<boolean>;
  onUpdateStatus: (callback: (payload: UpdateStatusPayload) => void) => () => void;
  checkForUpdates: () => Promise<void>;
  quitAndInstallUpdate: () => Promise<void>;
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

interface MarketAPI {
  fred: {
    getSeries: (seriesId: string, limit?: number) => Promise<MarketSeriesSnapshot>;
    getMany: (seriesIds: string[], limit?: number) => Promise<MarketSeriesSnapshot[]>;
  };
}

interface Window {
  electronAPI?: ElectronAPI;
  marketAPI?: MarketAPI;
}

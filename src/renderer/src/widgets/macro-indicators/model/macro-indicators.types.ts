import type { SeriesSnapshot } from "@/src/entities/market-indicator";
import type { Timeframe } from "./timeframe";

export type MacroIndicatorsConfig = Record<string, never>;

export type FetchStatus = "idle" | "loading" | "success" | "error";

export type MacroIndicatorsState = {
  snapshots: Record<string, SeriesSnapshot>;
  lastFetchedAt: string | null;
  status: FetchStatus;
  errorMessage: string | null;
  missingApiKey: boolean;
  timeframe: Timeframe;
};

export type MacroIndicatorsActions = {
  fetchAll: () => Promise<void>;
  setTimeframe: (timeframe: Timeframe) => void;
};

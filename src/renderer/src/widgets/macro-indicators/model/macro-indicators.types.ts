import type { SeriesSnapshot } from "@/src/entities/market-indicator";

export type MacroIndicatorsConfig = Record<string, never>;

export type FetchStatus = "idle" | "loading" | "success" | "error";

export type MacroIndicatorsState = {
  snapshots: Record<string, SeriesSnapshot>;
  lastFetchedAt: string | null;
  status: FetchStatus;
  errorMessage: string | null;
  missingApiKey: boolean;
};

export type MacroIndicatorsActions = {
  fetchAll: () => Promise<void>;
};

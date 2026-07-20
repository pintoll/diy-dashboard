import type {
  IndicatorConnector,
  SeriesSnapshot,
} from "@/src/entities/market-indicator";
import type { Timeframe } from "./timeframe";

export type MacroIndicatorsConfig = Record<string, never>;

export type FetchStatus = "idle" | "loading" | "success" | "error";

export type MacroIndicatorsState = {
  // The catalog is no longer a compile-time constant: it comes from
  // connectors.json, so a source added through dyd shows up on the next load
  // with no code change.
  connectors: IndicatorConnector[];
  snapshots: Record<string, SeriesSnapshot>;
  // Per-connector failures, keyed by connector id. One broken source reports on
  // its own card instead of blanking the widget.
  errors: Record<string, string>;
  lastFetchedAt: string | null;
  status: FetchStatus;
  errorMessage: string | null;
  timeframe: Timeframe;
  activeGroup: string | null;
};

export type MacroIndicatorsActions = {
  fetchAll: () => Promise<void>;
  setTimeframe: (timeframe: Timeframe) => void;
  setActiveGroup: (group: string) => void;
};

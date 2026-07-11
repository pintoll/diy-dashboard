import { useMemo } from "react";
import { createWidgetStore } from "@/src/shared/lib/create-widget-store";
import {
  MISSING_FRED_API_KEY_ERROR,
  type SeriesSnapshot,
} from "@/src/entities/market-indicator";
import { ALL_SERIES_IDS } from "./indicators-catalog";
import type {
  MacroIndicatorsActions,
  MacroIndicatorsState,
} from "./macro-indicators.types";
import type { Timeframe } from "./timeframe";

type MacroIndicatorsStore = MacroIndicatorsState & MacroIndicatorsActions;

const STORE_VERSION = 2;
const POINTS_LIMIT = 1300;
const DEFAULT_TIMEFRAME: Timeframe = "1M";
export const STALE_AFTER_MS = 6 * 60 * 60 * 1000;

export function isStale(lastFetchedAt: string | null): boolean {
  if (!lastFetchedAt) return true;
  return Date.now() - new Date(lastFetchedAt).getTime() > STALE_AFTER_MS;
}

export function useMacroIndicatorsStore(instanceId: string) {
  const store = useMemo(() => {
    const initialState: MacroIndicatorsStore = {
      snapshots: {},
      lastFetchedAt: null,
      status: "idle",
      errorMessage: null,
      missingApiKey: false,
      timeframe: DEFAULT_TIMEFRAME,

      fetchAll: async () => {},
      setTimeframe: () => {},
    };

    return createWidgetStore<MacroIndicatorsStore>(
      instanceId,
      initialState,
      (set) => ({
        ...initialState,

        fetchAll: async () => {
          if (!window.marketAPI) {
            set({
              status: "error",
              errorMessage: "marketAPI bridge unavailable",
            });
            return;
          }

          set({ status: "loading", errorMessage: null });
          try {
            const results = await window.marketAPI.fred.getMany(
              [...ALL_SERIES_IDS],
              POINTS_LIMIT
            );
            const snapshots: Record<string, SeriesSnapshot> = {};
            for (const snap of results) {
              snapshots[snap.id] = snap;
            }
            set({
              snapshots,
              lastFetchedAt: new Date().toISOString(),
              status: "success",
              errorMessage: null,
              missingApiKey: false,
            });
          } catch (err) {
            const message =
              err instanceof Error ? err.message : "Failed to fetch indicators";
            const missingKey = message.endsWith(MISSING_FRED_API_KEY_ERROR);
            set({
              status: "error",
              errorMessage: missingKey ? null : message,
              missingApiKey: missingKey,
            });
          }
        },

        setTimeframe: (timeframe: Timeframe) => {
          set({ timeframe });
        },
      }),
      {
        name: "macro-indicators",
        persist: true,
        version: STORE_VERSION,
        migrate: (persisted, version) => {
          const state = persisted as MacroIndicatorsStore;
          if (version < 2) {
            return {
              ...state,
              timeframe: DEFAULT_TIMEFRAME,
              snapshots: {},
              lastFetchedAt: null,
              status: "idle",
              errorMessage: null,
              missingApiKey: false,
            };
          }
          return state;
        },
        // Persist only what is worth restoring: the ~0.5MB snapshots, when they
        // were fetched, and the selected timeframe. Dropping the transient
        // status/error/missingApiKey fields means a `set({status:'loading'})`
        // no longer changes the persisted payload, and the store always
        // rehydrates in an idle state rather than a stuck loading/error one.
        partialize: (state) => ({
          snapshots: state.snapshots,
          lastFetchedAt: state.lastFetchedAt,
          timeframe: state.timeframe,
        }),
        // Coalesce writes so a timeframe click or loading flip does not run a
        // synchronous 0.5MB JSON.stringify + localStorage.setItem on the main
        // thread every time. The payload is a refetchable cache (6h staleness),
        // so losing the last write to an abrupt reload just triggers a refetch.
        debounceWriteMs: 500,
      }
    );
  }, [instanceId]);

  return store;
}

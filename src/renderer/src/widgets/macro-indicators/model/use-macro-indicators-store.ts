import { useMemo } from "react";
import { createWidgetStore } from "@/src/shared/lib/create-widget-store";
import type { SeriesSnapshot } from "@/src/entities/market-indicator";
import { ALL_SERIES_IDS } from "./indicators-catalog";
import type {
  MacroIndicatorsActions,
  MacroIndicatorsState,
} from "./macro-indicators.types";

type MacroIndicatorsStore = MacroIndicatorsState & MacroIndicatorsActions;

const STORE_VERSION = 1;
const POINTS_LIMIT = 90;
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

      fetchAll: async () => {},
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
            const missingKey = /MISSING_FRED_API_KEY/.test(message);
            set({
              status: "error",
              errorMessage: missingKey ? null : message,
              missingApiKey: missingKey,
            });
          }
        },
      }),
      {
        name: "macro-indicators",
        persist: true,
        version: STORE_VERSION,
      }
    );
  }, [instanceId]);

  return store;
}

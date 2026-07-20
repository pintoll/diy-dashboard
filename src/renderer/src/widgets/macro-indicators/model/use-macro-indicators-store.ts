import { useMemo } from "react";
import { createWidgetStore } from "@/src/shared/lib/create-widget-store";
import type {
  IndicatorConnector,
  SeriesSnapshot,
} from "@/src/entities/market-indicator";
import type {
  MacroIndicatorsActions,
  MacroIndicatorsState,
} from "./macro-indicators.types";
import type { Timeframe } from "./timeframe";

type MacroIndicatorsStore = MacroIndicatorsState & MacroIndicatorsActions;

const STORE_VERSION = 3;
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
      connectors: [],
      snapshots: {},
      errors: {},
      lastFetchedAt: null,
      status: "idle",
      errorMessage: null,
      timeframe: DEFAULT_TIMEFRAME,
      activeGroup: null,

      fetchAll: async () => {},
      setTimeframe: () => {},
      setActiveGroup: () => {},
    };

    return createWidgetStore<MacroIndicatorsStore>(
      instanceId,
      initialState,
      (set, get) => ({
        ...initialState,

        fetchAll: async () => {
          const api = window.marketAPI;
          if (!api) {
            set({ status: "error", errorMessage: "marketAPI bridge unavailable" });
            return;
          }

          set({ status: "loading", errorMessage: null });
          try {
            // The connector list is re-read on every fetch rather than cached:
            // it is edited out-of-process (dyd, Settings), so this is the point
            // where the widget notices a source was added or disabled.
            const definitions = await api.connectors.list();
            const series: IndicatorConnector[] = definitions
              .filter((c) => c.kind === "series" && c.enabled)
              .map((c) => ({
                id: c.id,
                kind: "series",
                label: c.label,
                group: c.group,
                enabled: c.enabled,
                order: c.order,
                display: c.display,
                meta: c.meta,
              }));

            if (series.length === 0) {
              set({
                connectors: [],
                snapshots: {},
                errors: {},
                status: "success",
                errorMessage: null,
                lastFetchedAt: new Date().toISOString(),
              });
              return;
            }

            const results = await api.connectors.fetchSeries(
              series.map((c) => c.id),
              POINTS_LIMIT
            );

            const snapshots: Record<string, SeriesSnapshot> = {};
            const errors: Record<string, string> = {};
            for (const result of results) {
              if (result.ok) {
                snapshots[result.id] = result.data;
              } else {
                errors[result.id] = result.error;
              }
            }

            // Keep the active group only if it still exists; a group can vanish
            // when its last connector is removed or disabled.
            const activeGroup = get().activeGroup;
            const stillPresent =
              activeGroup !== null &&
              series.some((c) => c.group === activeGroup);

            set({
              connectors: series,
              snapshots,
              errors,
              activeGroup: stillPresent ? activeGroup : null,
              lastFetchedAt: new Date().toISOString(),
              status: "success",
              errorMessage: null,
            });
          } catch (err) {
            const message =
              err instanceof Error ? err.message : "Failed to fetch indicators";
            set({ status: "error", errorMessage: message });
          }
        },

        setTimeframe: (timeframe: Timeframe) => {
          set({ timeframe });
        },

        setActiveGroup: (group: string) => {
          set({ activeGroup: group });
        },
      }),
      {
        name: "macro-indicators",
        persist: true,
        version: STORE_VERSION,
        migrate: (persisted, version) => {
          const state = persisted as MacroIndicatorsStore;
          // v3 replaced the hardcoded FRED catalog with connector definitions.
          // Snapshots are keyed by connector id, which happens to match the old
          // series ids, but the shape around them changed and the data is
          // cheap to refetch, so drop it rather than reason about it.
          if (version < 3) {
            return {
              ...state,
              connectors: [],
              snapshots: {},
              errors: {},
              lastFetchedAt: null,
              status: "idle",
              errorMessage: null,
              activeGroup: null,
              timeframe: DEFAULT_TIMEFRAME,
            };
          }
          return state;
        },
        // Persist only what is worth restoring: the ~0.5MB snapshots, when they
        // were fetched, and the user's tab/timeframe choices. Dropping the
        // transient status/error fields means a `set({status:'loading'})` no
        // longer changes the persisted payload, and the store always rehydrates
        // idle rather than stuck loading. `connectors` is persisted so the tab
        // bar renders from cache on mount instead of flashing empty.
        partialize: (state) => ({
          connectors: state.connectors,
          snapshots: state.snapshots,
          lastFetchedAt: state.lastFetchedAt,
          timeframe: state.timeframe,
          activeGroup: state.activeGroup,
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

import { useMemo } from "react";
import { createWidgetStore } from "@/src/shared/lib/create-widget-store";
import type { CalendarEvent } from "@/src/entities/calendar-event";
import { MISSING_FRED_API_KEY_ERROR } from "@/src/entities/market-indicator";
import type {
  EconomicCalendarActions,
  EconomicCalendarState,
  MinImportanceFilter,
  RangeKey,
  TypeFilter,
} from "./economic-calendar.types";
import { getFetchWindow } from "./range";
import { RELEASE_IDS, RELEASE_META_BY_ID } from "./releases-catalog";

type EconomicCalendarStore = EconomicCalendarState & EconomicCalendarActions;

const STORE_VERSION = 2;
const DEFAULT_RANGE: RangeKey = "thisWeek";
const DEFAULT_TYPE_FILTER: TypeFilter = "all";
const DEFAULT_MIN_IMPORTANCE: MinImportanceFilter = 1;
export const STALE_AFTER_MS = 6 * 60 * 60 * 1000;

export function isStale(lastFetchedAt: string | null): boolean {
  if (!lastFetchedAt) return true;
  return Date.now() - new Date(lastFetchedAt).getTime() > STALE_AFTER_MS;
}

export function useEconomicCalendarStore(instanceId: string) {
  const store = useMemo(() => {
    const initialState: EconomicCalendarStore = {
      events: [],
      lastFetchedAt: null,
      status: "idle",
      errorMessage: null,
      missingApiKey: false,
      rangeKey: DEFAULT_RANGE,
      typeFilter: DEFAULT_TYPE_FILTER,
      minImportance: DEFAULT_MIN_IMPORTANCE,

      fetchRange: async () => {},
      setRange: () => {},
      setTypeFilter: () => {},
      setMinImportance: () => {},
    };

    return createWidgetStore<EconomicCalendarStore>(
      instanceId,
      initialState,
      (set) => ({
        ...initialState,

        fetchRange: async () => {
          if (!window.marketAPI) {
            set({
              status: "error",
              errorMessage: "marketAPI bridge unavailable",
            });
            return;
          }

          set({ status: "loading", errorMessage: null });
          try {
            const { from, to } = getFetchWindow();
            const entries = await window.marketAPI.fred.getReleaseDates(
              [...RELEASE_IDS],
              from,
              to
            );
            const events: CalendarEvent[] = entries.map((entry) => {
              const meta = RELEASE_META_BY_ID[entry.releaseId];
              return {
                kind: "macro" as const,
                id: `${entry.releaseId}|${entry.date}`,
                // FRED returns date only (no time). Anchor to 08:30 ET which
                // is the canonical release time for BLS/BEA reports. Stored
                // as ISO to keep UI formatting consistent.
                datetime: `${entry.date}T13:30:00Z`,
                country: meta?.country ?? "US",
                importance: meta?.importance ?? 2,
                name: meta?.displayName ?? entry.releaseName,
                releaseId: entry.releaseId,
              };
            });
            set({
              events,
              lastFetchedAt: new Date().toISOString(),
              status: "success",
              errorMessage: null,
              missingApiKey: false,
            });
          } catch (err) {
            const message =
              err instanceof Error ? err.message : "Failed to fetch calendar";
            const missingKey = message.endsWith(MISSING_FRED_API_KEY_ERROR);
            set({
              status: "error",
              errorMessage: missingKey ? null : message,
              missingApiKey: missingKey,
            });
          }
        },

        setRange: (rangeKey: RangeKey) => {
          set({ rangeKey });
        },

        setTypeFilter: (typeFilter: TypeFilter) => {
          set({ typeFilter });
        },

        setMinImportance: (minImportance: MinImportanceFilter) => {
          set({ minImportance });
        },
      }),
      {
        name: "economic-calendar",
        persist: true,
        version: STORE_VERSION,
        migrate: (persisted, version) => {
          const state = persisted as EconomicCalendarStore;
          if (version < 2) {
            // Pre-FRED schema had FMP-shaped events — drop them so the next
            // fetch repopulates with FRED releases.
            return {
              ...state,
              events: [],
              lastFetchedAt: null,
              status: "idle",
              errorMessage: null,
              missingApiKey: false,
            };
          }
          return state;
        },
      }
    );
  }, [instanceId]);

  return store;
}

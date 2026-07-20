import { useMemo } from "react";
import { createWidgetStore } from "@/src/shared/lib/create-widget-store";
import type {
  CalendarEvent,
  Country,
  Importance,
} from "@/src/entities/calendar-event";
import type { IndicatorConnector } from "@/src/entities/market-indicator";
import type {
  EconomicCalendarActions,
  EconomicCalendarState,
  MinImportanceFilter,
  RangeKey,
  TypeFilter,
} from "./economic-calendar.types";
import { getFetchWindow } from "./range";

type EconomicCalendarStore = EconomicCalendarState & EconomicCalendarActions;

const STORE_VERSION = 3;
const DEFAULT_RANGE: RangeKey = "thisWeek";
const DEFAULT_TYPE_FILTER: TypeFilter = "all";
const DEFAULT_MIN_IMPORTANCE: MinImportanceFilter = 1;
export const STALE_AFTER_MS = 6 * 60 * 60 * 1000;

const COUNTRIES: readonly Country[] = ["US", "KR", "EU", "JP", "CN", "UK", "OTHER"];

export function isStale(lastFetchedAt: string | null): boolean {
  if (!lastFetchedAt) return true;
  return Date.now() - new Date(lastFetchedAt).getTime() > STALE_AFTER_MS;
}

// Connector `meta` is free-form scalars by design, so the widget narrows it
// here rather than trusting the file. An unrecognised value falls back instead
// of dropping the event: a mistyped country should not hide a CPI release.
function countryOf(connector: IndicatorConnector): Country {
  const raw = connector.meta?.country;
  return typeof raw === "string" && COUNTRIES.includes(raw as Country)
    ? (raw as Country)
    : "US";
}

function importanceOf(connector: IndicatorConnector): Importance {
  const raw = connector.meta?.importance;
  return raw === 1 || raw === 2 || raw === 3 ? raw : 2;
}

export function useEconomicCalendarStore(instanceId: string) {
  const store = useMemo(() => {
    const initialState: EconomicCalendarStore = {
      events: [],
      lastFetchedAt: null,
      status: "idle",
      errorMessage: null,
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
          const api = window.marketAPI;
          if (!api) {
            set({
              status: "error",
              errorMessage: "marketAPI bridge unavailable",
            });
            return;
          }

          set({ status: "loading", errorMessage: null });
          try {
            const definitions = await api.connectors.list();
            const calendars = definitions.filter(
              (c) => c.kind === "events" && c.enabled
            );

            if (calendars.length === 0) {
              set({
                events: [],
                lastFetchedAt: new Date().toISOString(),
                status: "success",
                errorMessage: null,
              });
              return;
            }

            const { from, to } = getFetchWindow();
            const results = await api.connectors.fetchEvents(
              calendars.map((c) => c.id),
              from,
              to
            );

            const byId = new Map(calendars.map((c) => [c.id, c]));
            const events: CalendarEvent[] = [];
            const failures: string[] = [];

            for (const result of results) {
              const connector = byId.get(result.id);
              if (!result.ok) {
                failures.push(`${connector?.label ?? result.id}: ${result.error}`);
                continue;
              }
              if (!connector) continue;

              for (const entry of result.data.events) {
                events.push({
                  kind: "macro",
                  id: entry.id,
                  // Sources give a date with no time. Anchor to 08:30 ET, the
                  // canonical release time for BLS/BEA reports, and store ISO
                  // so the UI formats every event the same way.
                  datetime: `${entry.date}T13:30:00Z`,
                  country: countryOf(connector),
                  importance: importanceOf(connector),
                  // The connector's label is the curated display name; the
                  // fetched label is the provider's own wording, kept only as
                  // a fallback.
                  name: connector.label || entry.label,
                });
              }
            }

            set({
              events,
              lastFetchedAt: new Date().toISOString(),
              status: failures.length === results.length ? "error" : "success",
              // Partial failures surface as a note without discarding the
              // calendars that did load.
              errorMessage: failures.length > 0 ? failures.join("; ") : null,
            });
          } catch (err) {
            const message =
              err instanceof Error ? err.message : "Failed to fetch calendar";
            set({ status: "error", errorMessage: message });
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
          // v3 moved releases out of a hardcoded catalog into connectors, and
          // dropped the FRED-specific missingApiKey flag. Event ids changed
          // shape with it, so clear and refetch.
          if (version < 3) {
            return {
              ...state,
              events: [],
              lastFetchedAt: null,
              status: "idle",
              errorMessage: null,
            };
          }
          return state;
        },
      }
    );
  }, [instanceId]);

  return store;
}

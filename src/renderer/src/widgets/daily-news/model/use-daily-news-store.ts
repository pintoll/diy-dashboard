import { useMemo } from "react";
import { createWidgetStore } from "@/src/shared/lib/create-widget-store";
import type {
  DailyNewsState,
  DailyNewsActions,
  DailyNewsResponse,
  NewsCategory,
} from "./daily-news.types";

type DailyNewsStore = DailyNewsState & DailyNewsActions;

const NEWS_WEBHOOK_URL = "https://pintomate.duckdns.org/webhook/daily-news";
const STORE_VERSION = 1;

const DEFAULT_COLLAPSED: Record<NewsCategory, boolean> = {
  tech: false,
  finance: false,
  growth: false,
  world: false,
};

export function useDailyNewsStore(instanceId: string) {
  const store = useMemo(() => {
    const initialState: DailyNewsStore = {
      items: [],
      fetchedAt: null,
      fetchStatus: "idle",
      errorMessage: null,
      collapsedSections: { ...DEFAULT_COLLAPSED },

      fetchNews: async () => {},
      toggleSection: () => {},
      collapseAll: () => {},
      expandAll: () => {},
    };

    return createWidgetStore<DailyNewsStore>(
      instanceId,
      initialState,
      (set, get) => ({
        ...initialState,

        fetchNews: async () => {
          const hadCachedItems = (get().items ?? []).length > 0;
          set({ fetchStatus: "loading", errorMessage: null });
          try {
            const res = await fetch(NEWS_WEBHOOK_URL);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const raw = await res.json();
            const data: DailyNewsResponse = Array.isArray(raw) ? raw[0] : raw;
            set({
              items: data.items,
              fetchedAt: data.fetchedAt,
              fetchStatus: "success",
              errorMessage: null,
            });
          } catch (err) {
            const message =
              err instanceof Error ? err.message : "Failed to fetch news";
            set({
              fetchStatus: "error",
              errorMessage: message,
              ...(hadCachedItems ? {} : { items: [], fetchedAt: null }),
            });
          }
        },

        toggleSection: (category: NewsCategory) => {
          const { collapsedSections } = get();
          set({
            collapsedSections: {
              ...collapsedSections,
              [category]: !collapsedSections[category],
            },
          });
        },

        collapseAll: () => {
          set({
            collapsedSections: {
              tech: true,
              finance: true,
              growth: true,
              world: true,
            },
          });
        },

        expandAll: () => {
          set({ collapsedSections: { ...DEFAULT_COLLAPSED } });
        },
      }),
      {
        name: "daily-news",
        persist: true,
        version: STORE_VERSION,
      }
    );
  }, [instanceId]);

  return store;
}

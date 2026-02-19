import { useMemo } from "react";
import { createWidgetStore } from "@/src/shared/lib/create-widget-store";
import type {
  DailyNewsState,
  DailyNewsActions,
  DailyNewsResponse,
  NewsCategory,
} from "./daily-news.types";
import { MOCK_NEWS_ITEMS, MOCK_FETCHED_AT } from "./daily-news.mock";

type DailyNewsStore = DailyNewsState & DailyNewsActions;

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

        fetchNews: async (webhookUrl: string) => {
          if (!webhookUrl) {
            set({
              items: MOCK_NEWS_ITEMS,
              fetchedAt: MOCK_FETCHED_AT,
              fetchStatus: "success",
              errorMessage: null,
            });
            return;
          }

          const hadCachedItems = get().items.length > 0;
          set({ fetchStatus: "loading", errorMessage: null });

          try {
            const res = await fetch(webhookUrl);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data: DailyNewsResponse = await res.json();
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
              [topic]: !collapsedSections[topic],
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

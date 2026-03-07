import { useMemo } from "react";
import { createWidgetStore } from "@/src/shared/lib/create-widget-store";
import { API_ENDPOINTS } from "@/src/shared/lib/api-config";
import type {
  DailyNewsState,
  DailyNewsActions,
  DailyNewsResponse,
  FeedbackAction,
  NewsCategory,
} from "./daily-news.types";

type DailyNewsStore = DailyNewsState & DailyNewsActions;

const STORE_VERSION = 2;

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
      feedback: {},

      fetchNews: async () => {},
      toggleSection: () => {},
      collapseAll: () => {},
      expandAll: () => {},
      sendFeedback: () => {},
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
            const res = await fetch(API_ENDPOINTS.dailyNews.fetch);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const raw = await res.json();
            const data: DailyNewsResponse | undefined = Array.isArray(raw) ? raw[0] : raw;
            if (!data?.items) {
              set({ fetchStatus: hadCachedItems ? "success" : "error", errorMessage: hadCachedItems ? null : "No news available" });
              return;
            }
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

        sendFeedback: (articleId: string, action: FeedbackAction | "click") => {
          const { feedback } = get();
          const current = feedback[articleId];

          if (action !== "click") {
            const next = { ...feedback };

            if (current === action) {
              delete next[articleId];
            } else {
              next[articleId] = action;
            }

            set({ feedback: next });
          }

          const parsedId = Number(String(articleId).replace(/\D/g, ""));
          const isCancel = action !== "click" && current === action;

          if (!parsedId) return;

          fetch(API_ENDPOINTS.dailyNews.feedback, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              articleId: parsedId,
              action: isCancel ? `un${action}` : action,
            }),
          }).catch(() => {});
        },
      }),
      {
        name: "daily-news",
        persist: true,
        version: STORE_VERSION,
        migrate: (persisted, version) => {
          const state = persisted as DailyNewsStore;
          if (version < 2) {
            return { ...state, feedback: {} };
          }
          return state;
        },
      }
    );
  }, [instanceId]);

  return store;
}

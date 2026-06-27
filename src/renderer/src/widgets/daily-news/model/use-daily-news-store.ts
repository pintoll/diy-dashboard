import { useMemo } from "react";
import { createWidgetStore } from "@/src/shared/lib/create-widget-store";
import type {
  DailyNewsState,
  DailyNewsActions,
  DailyNewsResponse,
  FeedbackAction,
  NewsCategory,
} from "./daily-news.types";

type DailyNewsStore = DailyNewsState & DailyNewsActions;

const STORE_VERSION = 3;

const DEFAULT_TAB: NewsCategory = "tech";

export function useDailyNewsStore(instanceId: string) {
  const store = useMemo(() => {
    const initialState: DailyNewsStore = {
      items: [],
      fetchedAt: null,
      fetchStatus: "idle",
      errorMessage: null,
      activeTab: DEFAULT_TAB,
      feedback: {},

      fetchNews: async () => {},
      setActiveTab: () => {},
      sendFeedback: () => {},
    };

    return createWidgetStore<DailyNewsStore>(
      instanceId,
      initialState,
      (set, get) => ({
        ...initialState,

        fetchNews: async () => {
          const hadCachedItems = (get().items ?? []).length > 0;
          if (!window.electronAPI) {
            set({
              fetchStatus: "error",
              errorMessage: "Daily news is only available in the desktop app",
              ...(hadCachedItems ? {} : { items: [], fetchedAt: null }),
            });
            return;
          }
          set({ fetchStatus: "loading", errorMessage: null });
          try {
            const raw = (await window.electronAPI.dailyNews.fetch()) as
              | DailyNewsResponse
              | DailyNewsResponse[];
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

        setActiveTab: (category: NewsCategory) => {
          set({ activeTab: category });
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

          window.electronAPI?.dailyNews
            .sendFeedback({
              articleId: parsedId,
              action: isCancel ? (`un${action}` as "unlike" | "undislike") : action,
            })
            .catch(() => {});
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
          if (version < 3) {
            return { ...state, activeTab: DEFAULT_TAB };
          }
          return state;
        },
      }
    );
  }, [instanceId]);

  return store;
}

import { ipcMain } from "electron";
import { ensureDailyNewsForToday } from "./scheduler";
import { getTodayNews } from "./serve";
import { recordFeedback } from "./feedback";
import type { DailyNewsResponse, FeedbackActionType } from "./types";
import { getGeminiApiKey, setGeminiApiKey } from "../settings/store";

export function registerDailyNewsIpc(): void {
  ipcMain.handle("dailyNews:fetch", async (): Promise<DailyNewsResponse> => {
    try {
      await ensureDailyNewsForToday();
    } catch (e) {
      if (String(e).includes("NO_API_KEY")) {
        throw new Error("Set your Gemini API key in Settings");
      }
      console.error("[daily-news] fetch failed:", e);
    }
    return getTodayNews();
  });

  ipcMain.handle(
    "dailyNews:feedback",
    (_event, payload: { articleId: number; action: FeedbackActionType }): void =>
      recordFeedback(payload)
  );

  ipcMain.handle("settings:getGeminiKey", (): string => getGeminiApiKey() ?? "");

  ipcMain.handle("settings:setGeminiKey", (_event, key: string): void =>
    setGeminiApiKey(key)
  );
}

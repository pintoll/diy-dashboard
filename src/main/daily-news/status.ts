import { BrowserWindow } from "electron";

// Progress events streamed from the ingest pipeline to the renderer so the
// widget can show a subtle "Updating..." indicator (for both the manual refresh
// and the background scheduler) without ever blanking the existing articles.
export type DailyNewsStatus =
  | { phase: "fetching" }
  | { phase: "scoring"; current: number; total: number }
  | { phase: "saving" }
  | { phase: "done"; inserted: number }
  | { phase: "error"; message: string };

// Broadcast to every open window; the renderer subscribes via
// window.electronAPI.dailyNews.onStatus.
export function emitDailyNewsStatus(status: DailyNewsStatus): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send("dailyNews:status", status);
  }
}

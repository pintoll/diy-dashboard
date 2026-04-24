import { ipcMain } from "electron";
import {
  fetchManySeries,
  fetchReleaseDates,
  fetchSeries,
} from "./fred-client";

export function registerMarketIpc(): void {
  ipcMain.handle(
    "market:fred:getSeries",
    (_event, payload: { seriesId: string; limit?: number }) =>
      fetchSeries(payload.seriesId, { limit: payload.limit })
  );

  ipcMain.handle(
    "market:fred:getMany",
    (_event, payload: { seriesIds: string[]; limit?: number }) =>
      fetchManySeries(payload.seriesIds, { limit: payload.limit })
  );

  ipcMain.handle(
    "market:fred:getReleaseDates",
    (_event, payload: { releaseIds: number[]; from: string; to: string }) =>
      fetchReleaseDates(payload.releaseIds, payload.from, payload.to)
  );
}

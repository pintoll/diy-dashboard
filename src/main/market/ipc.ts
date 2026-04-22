import { ipcMain } from "electron";
import { fetchManySeries, fetchSeries } from "./fred-client";

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
}

import { ipcMain } from "electron";
import {
  fetchManySeries,
  fetchReleaseDates,
  fetchSeries,
} from "./fred-client";

// IPC boundary validation: payloads cross from the renderer, and the batch
// fetchers fan out one HTTP request per element — an unchecked array is a
// main-process DoS. Real callers send at most ~10 items.
const MAX_BATCH = 50;

function assertBatch(values: unknown, label: string): asserts values is unknown[] {
  if (!Array.isArray(values) || values.length === 0 || values.length > MAX_BATCH) {
    throw new Error(`${label} must be a non-empty array of at most ${MAX_BATCH} items`);
  }
}

export function registerMarketIpc(): void {
  ipcMain.handle(
    "market:fred:getSeries",
    (_event, payload: { seriesId: string; limit?: number }) => {
      if (typeof payload?.seriesId !== "string") {
        throw new Error("seriesId must be a string");
      }
      return fetchSeries(payload.seriesId, { limit: payload.limit });
    }
  );

  ipcMain.handle(
    "market:fred:getMany",
    (_event, payload: { seriesIds: string[]; limit?: number }) => {
      assertBatch(payload?.seriesIds, "seriesIds");
      if (payload.seriesIds.some((id) => typeof id !== "string")) {
        throw new Error("seriesIds must contain only strings");
      }
      return fetchManySeries(payload.seriesIds, { limit: payload.limit });
    }
  );

  ipcMain.handle(
    "market:fred:getReleaseDates",
    (_event, payload: { releaseIds: number[]; from: string; to: string }) => {
      assertBatch(payload?.releaseIds, "releaseIds");
      if (payload.releaseIds.some((id) => typeof id !== "number")) {
        throw new Error("releaseIds must contain only numbers");
      }
      return fetchReleaseDates(payload.releaseIds, payload.from, payload.to);
    }
  );
}

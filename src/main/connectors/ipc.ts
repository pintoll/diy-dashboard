import { ipcMain } from "electron";
import {
  listCredentials,
  removeCredential,
  setCredential,
} from "./credentials";
import { fetchEvents, fetchSeries, testConnector } from "./runtime";
import {
  listConnectors,
  patchConnector,
  removeConnector,
  upsertConnector,
} from "./store";

// IPC boundary validation: payloads cross from the renderer, and the batch
// fetchers fan out one HTTP request per element — an unchecked array is a
// main-process DoS. Real callers send at most ~10 items. Connector bodies are
// validated by the store, which is the single choke point every write path
// (IPC, agent API, seeding) goes through.
const MAX_BATCH = 50;
const MAX_LIMIT = 5000;

function assertIdBatch(values: unknown, label: string): asserts values is string[] {
  if (!Array.isArray(values) || values.length === 0 || values.length > MAX_BATCH) {
    throw new Error(`${label} must be a non-empty array of at most ${MAX_BATCH} items`);
  }
  if (values.some((id) => typeof id !== "string")) {
    throw new Error(`${label} must contain only strings`);
  }
}

function assertLimit(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new Error("limit must be a positive integer");
  }
  return Math.min(value, MAX_LIMIT);
}

function assertDate(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${label} must be a YYYY-MM-DD date`);
  }
  return value;
}

export function registerConnectorsIpc(): void {
  ipcMain.handle("connectors:list", () => listConnectors());

  ipcMain.handle("connectors:upsert", (_event, payload: unknown) =>
    upsertConnector(payload)
  );

  ipcMain.handle(
    "connectors:patch",
    (_event, payload: { id: string; patch: unknown }) => {
      if (typeof payload?.id !== "string") throw new Error("id must be a string");
      return patchConnector(payload.id, payload.patch);
    }
  );

  ipcMain.handle("connectors:remove", (_event, payload: { id: string }) => {
    if (typeof payload?.id !== "string") throw new Error("id must be a string");
    removeConnector(payload.id);
  });

  ipcMain.handle("connectors:test", (_event, payload: { connector: unknown }) =>
    testConnector(payload?.connector)
  );

  ipcMain.handle(
    "connectors:fetchSeries",
    (_event, payload: { ids: string[]; limit: number }) => {
      assertIdBatch(payload?.ids, "ids");
      return fetchSeries(payload.ids, assertLimit(payload.limit));
    }
  );

  ipcMain.handle(
    "connectors:fetchEvents",
    (_event, payload: { ids: string[]; from: string; to: string }) => {
      assertIdBatch(payload?.ids, "ids");
      return fetchEvents(
        payload.ids,
        assertDate(payload?.from, "from"),
        assertDate(payload?.to, "to")
      );
    }
  );

  // Names and hosts only — the secret never travels back to the renderer. This
  // is a deliberate break from the old settings:getFredKey channel, which
  // returned the key in plaintext so the dialog could prefill it.
  ipcMain.handle("credentials:list", () => listCredentials());

  ipcMain.handle(
    "credentials:set",
    (_event, payload: { name: string; secret: string; allowedHost: string }) =>
      setCredential(payload?.name, payload?.secret, payload?.allowedHost)
  );

  ipcMain.handle("credentials:remove", (_event, payload: { name: string }) => {
    if (typeof payload?.name !== "string") {
      throw new Error("name must be a string");
    }
    return removeCredential(payload.name);
  });
}

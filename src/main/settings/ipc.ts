import { ipcMain } from "electron";
import {
  getFredApiKey,
  getGeminiApiKey,
  setFredApiKey,
  setGeminiApiKey,
} from "./store";

// IPC boundary validation: a real API key is well under this, and an
// unchecked payload would be written into settings.json as-is.
const MAX_KEY_LENGTH = 256;

function assertKey(value: unknown): asserts value is string {
  if (typeof value !== "string" || value.length > MAX_KEY_LENGTH) {
    throw new Error(
      `API key must be a string of at most ${MAX_KEY_LENGTH} characters`
    );
  }
}

export function registerSettingsIpc(): void {
  ipcMain.handle("settings:getGeminiKey", (): string => getGeminiApiKey() ?? "");

  ipcMain.handle("settings:setGeminiKey", (_event, key: unknown): void => {
    assertKey(key);
    setGeminiApiKey(key);
  });

  ipcMain.handle("settings:getFredKey", (): string => getFredApiKey() ?? "");

  ipcMain.handle("settings:setFredKey", (_event, key: unknown): void => {
    assertKey(key);
    setFredApiKey(key);
  });
}

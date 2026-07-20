import { ipcMain } from "electron";
import { getGeminiApiKey, setGeminiApiKey } from "./store";

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

// Gemini (daily-news) is the only key left here. Market data credentials moved
// to the connector credential store, which never hands a secret back to the
// renderer; see src/main/connectors/ipc.ts.
export function registerSettingsIpc(): void {
  ipcMain.handle("settings:getGeminiKey", (): string => getGeminiApiKey() ?? "");

  ipcMain.handle("settings:setGeminiKey", (_event, key: unknown): void => {
    assertKey(key);
    setGeminiApiKey(key);
  });
}

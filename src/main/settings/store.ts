import { readFileSync, writeFileSync } from "fs";
import path from "path";
import { app } from "electron";

export type AppSettings = { geminiApiKey?: string };

function settingsPath(): string {
  return path.join(app.getPath("userData"), "settings.json");
}

export function getSettings(): AppSettings {
  try {
    return JSON.parse(readFileSync(settingsPath(), "utf8")) as AppSettings;
  } catch {
    return {};
  }
}

export function setSettings(patch: Partial<AppSettings>): void {
  const next = { ...getSettings(), ...patch };
  writeFileSync(settingsPath(), JSON.stringify(next, null, 2), "utf8");
}

export function getGeminiApiKey(): string | undefined {
  return getSettings().geminiApiKey || import.meta.env.MAIN_VITE_GEMINI_API_KEY;
}

export function setGeminiApiKey(key: string): void {
  setSettings({ geminiApiKey: key });
}

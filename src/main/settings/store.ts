import { readFileSync, writeFileSync } from "fs";
import path from "path";
import { app } from "electron";

export type AppSettings = {
  geminiApiKey?: string;
  usdKrwRate?: number;
  agentApiPort?: number;
  agentApiToken?: string;
};

// Won per US dollar. The finance ledger converts USD rows to KRW at read time
// using this, so there is no FX API to key, rate-limit, or cache. Editing it
// reflows every USD figure in the ledger at once.
export const DEFAULT_USD_KRW_RATE = 1380;

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

export function getUsdKrwRate(): number {
  const rate = getSettings().usdKrwRate;
  return typeof rate === "number" && rate > 0 ? rate : DEFAULT_USD_KRW_RATE;
}

export function setUsdKrwRate(rate: number): void {
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error("Exchange rate must be a positive number");
  }
  setSettings({ usdKrwRate: rate });
}

import {
  closeSync,
  copyFileSync,
  fsyncSync,
  openSync,
  readFileSync,
  renameSync,
  writeSync,
} from "fs";
import path from "path";
import { app, safeStorage } from "electron";

export type AppSettings = {
  geminiApiKey?: string;
  geminiApiKeyEnc?: string;
  fredApiKey?: string;
  fredApiKeyEnc?: string;
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

// Parsed-settings cache. Only this module writes the file and the app is
// single-instance, so it can only go stale if the user hand-edits the file
// while the app runs. getUsdKrwRate() runs once per finance IPC call; without
// the cache each call is a sync disk read blocking the main event loop.
let cache: AppSettings | null = null;

function readSettingsFile(): AppSettings {
  let raw: string;
  try {
    raw = readFileSync(settingsPath(), "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error("settings.json read failed:", err);
    }
    return {};
  }
  try {
    return JSON.parse(raw) as AppSettings;
  } catch (err) {
    // A corrupt file must not silently become {}: the next write would then
    // clobber the Gemini key, agent token, and FX rate. Keep a copy around.
    try {
      copyFileSync(settingsPath(), settingsPath() + ".corrupt");
    } catch {
      // Backup is best-effort; the error below is the signal that survives.
    }
    console.error(
      "settings.json is corrupt; backed up as settings.json.corrupt:",
      err
    );
    return {};
  }
}

export function getSettings(): AppSettings {
  if (cache === null) cache = readSettingsFile();
  // Copy so callers can't mutate the cache behind setSettings' back.
  return { ...cache };
}

export function setSettings(patch: Partial<AppSettings>): void {
  const next = { ...getSettings(), ...patch };
  const target = settingsPath();
  const tmp = target + ".tmp";
  // Write-then-rename with fsync: a crash mid-write can truncate the file
  // being written, but never the settings.json the next launch will read.
  const fd = openSync(tmp, "w");
  try {
    writeSync(fd, JSON.stringify(next, null, 2));
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, target);
  cache = next;
}

// API keys live in the `<name>Enc` fields as safeStorage-encrypted base64
// whenever the OS supports it (DPAPI / Keychain / libsecret); the plaintext
// `<name>` fields are the fallback for platforms where it does not. Reads
// prefer the encrypted field; a value that no longer decrypts (OS keychain
// reset) reads as unset so the user can re-enter it in Settings. There is no
// build-time env fallback: keys are runtime-entered only, so they can never
// end up baked into a distributed binary.
type SecretKey = "geminiApiKey" | "fredApiKey";

function getSecret(name: SecretKey): string | undefined {
  const settings = getSettings();
  const enc = settings[`${name}Enc`];
  if (enc) {
    try {
      return safeStorage.decryptString(Buffer.from(enc, "base64")) || undefined;
    } catch (err) {
      console.error(`Failed to decrypt ${name}; re-enter it in Settings:`, err);
      return undefined;
    }
  }
  return settings[name] || undefined;
}

function setSecret(name: SecretKey, value: string): void {
  const trimmed = value.trim();
  const encrypt = trimmed !== "" && safeStorage.isEncryptionAvailable();
  const patch: Partial<AppSettings> = {};
  // An explicit `undefined` survives the spread in setSettings and is then
  // dropped by JSON.stringify, so it deletes the twin field (and clears the
  // key entirely when the input was emptied).
  patch[name] = encrypt || trimmed === "" ? undefined : trimmed;
  patch[`${name}Enc`] = encrypt
    ? safeStorage.encryptString(trimmed).toString("base64")
    : undefined;
  setSettings(patch);
}

// One-time upgrade of plaintext keys written before safeStorage existed.
// Called at startup: safeStorage is only usable once the app is ready.
export function migrateSecretsToSafeStorage(): void {
  if (!safeStorage.isEncryptionAvailable()) return;
  const settings = getSettings();
  for (const name of ["geminiApiKey", "fredApiKey"] as const) {
    const plain = settings[name];
    if (plain) setSecret(name, plain);
  }
}

export function getGeminiApiKey(): string | undefined {
  return getSecret("geminiApiKey");
}

export function setGeminiApiKey(key: string): void {
  setSecret("geminiApiKey", key);
}

export function getFredApiKey(): string | undefined {
  return getSecret("fredApiKey");
}

export function setFredApiKey(key: string): void {
  setSecret("fredApiKey", key);
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

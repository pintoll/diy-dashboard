import { getFredApiKey, getSettings, setSettings } from "../settings/store";
import { hasCredential, setCredential } from "./credentials";
import { DEFAULT_CONNECTORS, FRED_CREDENTIAL, FRED_HOST } from "./defaults";
import { seedConnectorsIfAbsent } from "./store";

// One-time upgrade for installs that predate connectors. Runs at startup, after
// migrateSecretsToSafeStorage() so the legacy FRED key is readable.
export function migrateToConnectors(): void {
  if (seedConnectorsIfAbsent(DEFAULT_CONNECTORS)) {
    console.log(`seeded ${DEFAULT_CONNECTORS.length} default connectors`);
  }

  const legacyKey = getFredApiKey();
  if (!legacyKey) return;

  // Carry the key over under the name the seeded FRED connectors reference, so
  // an existing user's widgets keep working without re-entering anything.
  if (!hasCredential(FRED_CREDENTIAL)) {
    setCredential(FRED_CREDENTIAL, legacyKey, FRED_HOST);
    console.log("migrated FRED API key into the connector credential store");
  }

  // Drop the legacy fields once the value is safely stored under the new
  // scheme. Explicit undefined deletes them (see setSettings).
  const settings = getSettings();
  if (settings.fredApiKey !== undefined || settings.fredApiKeyEnc !== undefined) {
    setSettings({ fredApiKey: undefined, fredApiKeyEnc: undefined });
  }
}

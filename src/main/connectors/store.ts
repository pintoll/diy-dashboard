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
import { app } from "electron";
import { NotFoundError, ValidationError } from "../todos/types";
import { CONNECTORS_FILE_VERSION, type Connector, type ConnectorsFile } from "./types";
import { MAX_CONNECTORS, validateConnector } from "./validate";

// connectors.json holds data-source definitions in plaintext. It is the file an
// agent writes through the agent API, and the one a user can copy between
// machines. Durability follows settings/store.ts exactly: write-then-rename
// with fsync, and a .corrupt backup rather than silently starting empty.

function connectorsPath(): string {
  return path.join(app.getPath("userData"), "connectors.json");
}

let cache: ConnectorsFile | null = null;

function readFile(): ConnectorsFile {
  const target = connectorsPath();
  let raw: string;
  try {
    raw = readFileSync(target, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error("connectors.json read failed:", err);
    }
    return { version: CONNECTORS_FILE_VERSION, connectors: [] };
  }

  try {
    const parsed = JSON.parse(raw) as ConnectorsFile;
    if (!Array.isArray(parsed?.connectors)) {
      throw new Error("connectors must be an array");
    }
    // Definitions are hand- and agent-editable, so a single bad entry is
    // expected eventually. Drop just that entry and keep the rest usable
    // instead of failing the whole file.
    const connectors: Connector[] = [];
    for (const entry of parsed.connectors) {
      try {
        connectors.push(validateConnector(entry));
      } catch (err) {
        const id =
          typeof (entry as { id?: unknown })?.id === "string"
            ? (entry as { id: string }).id
            : "<unknown>";
        console.error(`connectors.json: dropping invalid connector ${id}:`, err);
      }
    }
    return { version: parsed.version ?? CONNECTORS_FILE_VERSION, connectors };
  } catch (err) {
    try {
      copyFileSync(target, target + ".corrupt");
    } catch {
      // Backup is best-effort; the error below is the signal that survives.
    }
    console.error(
      "connectors.json is corrupt; backed up as connectors.json.corrupt:",
      err
    );
    return { version: CONNECTORS_FILE_VERSION, connectors: [] };
  }
}

function load(): ConnectorsFile {
  if (cache === null) cache = readFile();
  return cache;
}

function persist(file: ConnectorsFile): void {
  const target = connectorsPath();
  const tmp = target + ".tmp";
  const fd = openSync(tmp, "w");
  try {
    writeSync(fd, JSON.stringify(file, null, 2));
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, target);
  cache = file;
}

function sortConnectors(connectors: Connector[]): Connector[] {
  return [...connectors].sort((a, b) => {
    const orderA = a.order ?? Number.MAX_SAFE_INTEGER;
    const orderB = b.order ?? Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) return orderA - orderB;
    return a.id.localeCompare(b.id);
  });
}

export function listConnectors(): Connector[] {
  return sortConnectors(load().connectors);
}

export function getConnector(id: string): Connector | undefined {
  return load().connectors.find((c) => c.id === id);
}

export function requireConnector(id: string): Connector {
  const connector = getConnector(id);
  if (!connector) throw new NotFoundError(`connector "${id}" not found`);
  return connector;
}

// Create-or-replace, keyed on id. The input is validated here rather than by
// callers so every write path (IPC, agent API, seeding) enforces the same rules.
export function upsertConnector(input: unknown): Connector {
  const connector = validateConnector(input);
  const file = load();
  const existingIndex = file.connectors.findIndex((c) => c.id === connector.id);

  if (existingIndex === -1 && file.connectors.length >= MAX_CONNECTORS) {
    throw new ValidationError(
      `at most ${MAX_CONNECTORS} connectors can be stored`
    );
  }

  const connectors = [...file.connectors];
  if (existingIndex === -1) {
    connectors.push(connector);
  } else {
    connectors[existingIndex] = connector;
  }
  persist({ version: CONNECTORS_FILE_VERSION, connectors });
  return connector;
}

// Applies a patch without storing it. Split out so callers that need to inspect
// the result first (the agent API dry-runs a patch before persisting) test the
// exact object patchConnector would write, rather than a second, drifting copy
// of these merge rules.
//
// Merging happens at the top level only: `request` or `response` must be
// supplied whole, because a deep merge of half a request is more likely to
// produce a subtly broken connector than to save the caller work.
export function mergeConnectorPatch(
  id: string,
  patch: unknown
): Record<string, unknown> {
  const existing = requireConnector(id);
  if (typeof patch !== "object" || patch === null || Array.isArray(patch)) {
    throw new ValidationError("patch must be an object");
  }
  return { ...existing, ...(patch as Record<string, unknown>), id };
}

export function patchConnector(id: string, patch: unknown): Connector {
  return upsertConnector(mergeConnectorPatch(id, patch));
}

export function removeConnector(id: string): void {
  const file = load();
  const connectors = file.connectors.filter((c) => c.id !== id);
  if (connectors.length === file.connectors.length) {
    throw new NotFoundError(`connector "${id}" not found`);
  }
  persist({ version: CONNECTORS_FILE_VERSION, connectors });
}

// Seed defaults on first run only. An empty file after the user deleted every
// connector is a deliberate state, so seeding keys off the file's absence
// rather than off an empty list.
export function seedConnectorsIfAbsent(defaults: Connector[]): boolean {
  try {
    readFileSync(connectorsPath(), "utf8");
    return false;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") return false;
  }
  const connectors: Connector[] = [];
  for (const entry of defaults) {
    try {
      connectors.push(validateConnector(entry));
    } catch (err) {
      console.error("skipping invalid default connector:", err);
    }
  }
  persist({ version: CONNECTORS_FILE_VERSION, connectors });
  return true;
}

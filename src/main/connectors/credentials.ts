import { getCredentialsBlob, setCredentialsBlob } from "../settings/store";
import { ValidationError } from "../todos/types";
import type { CredentialMeta } from "./types";

// Credentials are stored apart from connector definitions: definitions live in
// plaintext connectors.json (written by agents, shareable, diffable) while
// secrets stay in the safeStorage-encrypted settings blob. A connector refers
// to a credential by name only.
//
// Each credential is pinned to one host. That pin is what makes it safe to let
// an agent author connector definitions: a definition that names credential
// "fred" but points at another host is refused rather than silently shipping
// the key somewhere new.

const NAME_PATTERN = /^[a-z0-9][a-z0-9._-]{0,39}$/;
const MAX_SECRET_LENGTH = 4096;
const MAX_CREDENTIALS = 50;

type CredentialMap = Record<string, { secret: string; allowedHost: string }>;

let cache: CredentialMap | null = null;

function read(): CredentialMap {
  if (cache !== null) return cache;
  const raw = getCredentialsBlob();
  if (!raw) {
    cache = {};
    return cache;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("not an object");
    }
    cache = parsed as CredentialMap;
  } catch (err) {
    // Unlike connectors.json this blob is encrypted and never hand-edited, so
    // a parse failure means the ciphertext no longer matches the OS key. There
    // is nothing to recover; start empty so the user can re-enter secrets.
    console.error("credentials blob is unreadable; starting empty:", err);
    cache = {};
  }
  return cache;
}

function write(map: CredentialMap): void {
  setCredentialsBlob(JSON.stringify(map));
  cache = map;
}

function normalizeHost(host: string): string {
  const trimmed = host.trim().toLowerCase();
  if (trimmed === "") {
    throw new ValidationError("allowedHost must be a non-empty hostname");
  }
  // Accept a full URL for convenience — agents tend to paste the endpoint.
  if (trimmed.includes("/")) {
    try {
      return new URL(trimmed).hostname;
    } catch {
      throw new ValidationError(`allowedHost is not a valid hostname: ${host}`);
    }
  }
  if (!/^[a-z0-9.-]+$/.test(trimmed)) {
    throw new ValidationError(`allowedHost is not a valid hostname: ${host}`);
  }
  return trimmed;
}

// Names and hosts only. The secret itself is never returned to the renderer or
// over the agent API; it leaves this module only through resolveSecret().
export function listCredentials(): CredentialMeta[] {
  return Object.entries(read())
    .map(([name, entry]) => ({ name, allowedHost: entry.allowedHost }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function setCredential(
  name: string,
  secret: string,
  allowedHost: string
): CredentialMeta {
  if (typeof name !== "string" || !NAME_PATTERN.test(name)) {
    throw new ValidationError(
      'credential name must be lowercase alphanumeric with ".", "_" or "-" (max 40)'
    );
  }
  if (typeof secret !== "string" || secret.trim() === "") {
    throw new ValidationError("secret must be a non-empty string");
  }
  if (secret.length > MAX_SECRET_LENGTH) {
    throw new ValidationError(
      `secret must be at most ${MAX_SECRET_LENGTH} characters`
    );
  }
  if (typeof allowedHost !== "string") {
    throw new ValidationError("allowedHost must be a string");
  }

  const map = { ...read() };
  if (!(name in map) && Object.keys(map).length >= MAX_CREDENTIALS) {
    throw new ValidationError(
      `at most ${MAX_CREDENTIALS} credentials can be stored`
    );
  }
  const host = normalizeHost(allowedHost);
  map[name] = { secret: secret.trim(), allowedHost: host };
  write(map);
  return { name, allowedHost: host };
}

export function removeCredential(name: string): boolean {
  const map = { ...read() };
  if (!(name in map)) return false;
  delete map[name];
  write(map);
  return true;
}

export function hasCredential(name: string): boolean {
  return name in read();
}

export class CredentialError extends Error {}

// Resolve a credential for a specific request host. Returns the secret only
// when the host matches the pin; every other outcome throws so the caller
// cannot accidentally proceed with an unauthenticated or misdirected request.
export function resolveSecret(name: string, requestHost: string): string {
  const entry = read()[name];
  if (!entry) {
    throw new CredentialError(
      `credential "${name}" is not configured; set it before using this connector`
    );
  }
  if (entry.allowedHost !== requestHost.toLowerCase()) {
    throw new CredentialError(
      `credential "${name}" is bound to ${entry.allowedHost} and will not be sent to ${requestHost}`
    );
  }
  return entry.secret;
}


import { promises as fs, readFileSync, writeFileSync } from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { errorMessage, recordDiagnostic } from "./diagnostics";

const execFileAsync = promisify(execFile);

const BLOCK_START = "# >>> focus-mode (auto-managed, do not edit) >>>";
const BLOCK_END = "# <<< focus-mode <<<";
const REDIRECT_IP = "0.0.0.0";

// Windows hosts file. %SystemRoot% is normally C:\Windows.
const HOSTS_PATH = path.join(
  process.env.SystemRoot ?? "C:\\Windows",
  "System32",
  "drivers",
  "etc",
  "hosts"
);

export type SiteGuardAction = "grant" | "block" | "unblock" | "probe";

export interface SiteGuardHistoryEntry {
  at: number;
  action: SiteGuardAction;
  ok: boolean;
  message?: string;
}

export interface SiteGuardDiagnostics {
  platform: string;
  supported: boolean;
  hostsPath: string;
  hasWritePermission: boolean | null;
  isBlocked: boolean;
  blockedDomains: string[];
  lastAction: SiteGuardAction | null;
  lastActionAt: number | null;
  lastError: string | null;
  history: SiteGuardHistoryEntry[];
}

const diagnostics: SiteGuardDiagnostics = {
  platform: process.platform,
  supported: process.platform === "win32",
  hostsPath: HOSTS_PATH,
  hasWritePermission: null,
  isBlocked: false,
  blockedDomains: [],
  lastAction: null,
  lastActionAt: null,
  lastError: null,
  history: [],
};

function record(action: SiteGuardAction, ok: boolean, message?: string): void {
  recordDiagnostic(diagnostics, action, ok, message);
}

async function readHosts(): Promise<string> {
  return fs.readFile(HOSTS_PATH, "utf8");
}

async function writeHosts(content: string): Promise<void> {
  await fs.writeFile(HOSTS_PATH, content, "utf8");
}

/** Strip our managed block (markers inclusive) from hosts content. */
function stripBlock(content: string): string {
  const startIdx = content.indexOf(BLOCK_START);
  if (startIdx === -1) return content;
  const endMarkerIdx = content.indexOf(BLOCK_END, startIdx);
  if (endMarkerIdx === -1) {
    // Malformed (start without end): drop from start to EOF to recover.
    return content.slice(0, startIdx).replace(/\s+$/, "") + "\n";
  }
  const endIdx = endMarkerIdx + BLOCK_END.length;
  const before = content.slice(0, startIdx).replace(/\s+$/, "");
  const after = content.slice(endIdx).replace(/^\s+/, "");
  const joined = [before, after].filter((part) => part.length > 0).join("\n");
  return joined.length > 0 ? joined + "\n" : "";
}

function parseBlockedDomains(content: string): string[] {
  const startIdx = content.indexOf(BLOCK_START);
  if (startIdx === -1) return [];
  const endMarkerIdx = content.indexOf(BLOCK_END, startIdx);
  const region =
    endMarkerIdx === -1
      ? content.slice(startIdx)
      : content.slice(startIdx, endMarkerIdx);
  const domains: string[] = [];
  for (const line of region.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) continue;
    const parts = trimmed.split(/\s+/);
    if (parts.length >= 2) domains.push(parts[1]);
  }
  return domains;
}

function buildBlock(domains: string[]): string {
  const lines = domains.map((domain) => `${REDIRECT_IP}\t${domain}`);
  return [BLOCK_START, ...lines, BLOCK_END].join("\n");
}

async function flushDns(): Promise<void> {
  await execFileAsync("ipconfig", ["/flushdns"]);
}

/** Reflect current hosts block state into diagnostics. */
async function refreshBlockState(): Promise<void> {
  try {
    const content = await readHosts();
    const domains = parseBlockedDomains(content);
    diagnostics.isBlocked = content.includes(BLOCK_START);
    diagnostics.blockedDomains = domains;
  } catch (err) {
    diagnostics.isBlocked = false;
    diagnostics.blockedDomains = [];
    diagnostics.lastError = errorMessage(err);
  }
}

/**
 * Probe write access by rewriting the file with identical content. fs.access
 * W_OK does not reliably honor NTFS ACLs on Windows, so a real write is the
 * only trustworthy check.
 */
export async function probeWritePermission(): Promise<boolean> {
  try {
    const content = await readHosts();
    await writeHosts(content);
    diagnostics.hasWritePermission = true;
    record("probe", true);
    return true;
  } catch (err) {
    diagnostics.hasWritePermission = false;
    record("probe", false, errorMessage(err));
    return false;
  }
}

export async function getStatus(): Promise<SiteGuardDiagnostics> {
  if (diagnostics.supported) {
    await refreshBlockState();
  }
  return diagnostics;
}

export async function block(domains: string[]): Promise<SiteGuardDiagnostics> {
  const cleaned = domains
    .map((domain) => domain.trim().toLowerCase())
    .filter((domain) => domain.length > 0);
  try {
    const content = await readHosts();
    const stripped = stripBlock(content);
    const base = stripped.length === 0 ? "" : stripped.replace(/\s*$/, "") + "\n";
    const next = base + buildBlock(cleaned) + "\n";
    await writeHosts(next);
    await flushDns();
    diagnostics.hasWritePermission = true;
    record("block", true, `${cleaned.length} domain(s)`);
  } catch (err) {
    if (isPermissionError(err)) diagnostics.hasWritePermission = false;
    record("block", false, errorMessage(err));
  }
  await refreshBlockState();
  return diagnostics;
}

export async function unblock(): Promise<SiteGuardDiagnostics> {
  try {
    const content = await readHosts();
    const next = stripBlock(content);
    await writeHosts(next);
    await flushDns();
    diagnostics.hasWritePermission = true;
    record("unblock", true);
  } catch (err) {
    if (isPermissionError(err)) diagnostics.hasWritePermission = false;
    record("unblock", false, errorMessage(err));
  }
  await refreshBlockState();
  return diagnostics;
}

function isPermissionError(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException)?.code;
  return code === "EACCES" || code === "EPERM";
}

/**
 * Synchronous best-effort strip of our managed block, for the before-quit path
 * where async fs cannot be awaited. No DNS flush (the entries are already gone;
 * the next lookup repopulates). Swallows errors — quit must never block.
 */
export function stripFocusBlockSync(): void {
  if (process.platform !== "win32") return;
  try {
    const content = readFileSync(HOSTS_PATH, "utf8");
    if (!content.includes(BLOCK_START)) return;
    writeFileSync(HOSTS_PATH, stripBlock(content), "utf8");
  } catch {
    // best-effort: a leftover block is cleared on the next startup strip anyway.
  }
}

export function recordGrant(ok: boolean, message?: string): void {
  record("grant", ok, message);
}

export function getDiagnostics(): SiteGuardDiagnostics {
  return diagnostics;
}

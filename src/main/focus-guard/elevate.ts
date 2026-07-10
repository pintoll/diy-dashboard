import { app } from "electron";
import path from "path";
import os from "os";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

function scriptPath(): string {
  // Packaged: shipped via electron-builder extraResources to resourcesPath.
  // Dev: lives under the project's resources/ dir.
  return app.isPackaged
    ? path.join(process.resourcesPath, "focus-guard", "grant-hosts-access.ps1")
    : path.join(app.getAppPath(), "resources", "focus-guard", "grant-hosts-access.ps1");
}

// PowerShell single-quoted literal: the only metacharacter is the quote
// itself, escaped by doubling. Without this, a ' in the username or install
// path breaks out of the -ArgumentList quoting and injects code that runs
// under the elevated prompt.
function psQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * One-time elevation: launches the bundled PowerShell script with RunAs (single
 * UAC prompt) to grant the current user Modify rights on the hosts file. After
 * this, runtime block/unblock writes need no elevation.
 *
 * The target username is passed from this (non-elevated) process so the grant
 * targets the real user even if a different admin account approves the UAC.
 */
export async function grantHostsAccess(): Promise<void> {
  const user = os.userInfo().username;
  const ps1 = scriptPath();

  // Single-quoted, comma-separated argument list for the elevated powershell.
  const argumentList = [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    ps1,
    "-User",
    user,
  ]
    .map(psQuote)
    .join(",");

  // Outer powershell (non-elevated) spawns an elevated child that runs the
  // script, and waits for it to finish.
  const inner = [
    "Start-Process",
    "powershell.exe",
    "-Verb",
    "RunAs",
    "-Wait",
    "-ArgumentList",
    argumentList,
  ].join(" ");

  await execFileAsync("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    inner,
  ]);
}

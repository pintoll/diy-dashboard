import { ipcMain } from "electron";
import {
  block,
  getDiagnostics,
  getStatus,
  probeWritePermission,
  recordGrant,
  unblock,
  type SiteGuardDiagnostics,
} from "./site-guard";
import { grantHostsAccess } from "./elevate";
import {
  enforce as enforceApps,
  getStatus as getAppStatus,
  release as releaseApps,
  type AppGuardDiagnostics,
} from "./app-guard";

export function registerFocusGuardIpc(): void {
  ipcMain.handle(
    "focus:site:get-status",
    (): Promise<SiteGuardDiagnostics> => getStatus()
  );

  ipcMain.handle(
    "focus:site:grant-permission",
    async (): Promise<SiteGuardDiagnostics> => {
      if (process.platform !== "win32") return getDiagnostics();
      try {
        await grantHostsAccess();
        recordGrant(true);
      } catch (err) {
        recordGrant(
          false,
          err instanceof Error ? `${err.name}: ${err.message}` : String(err)
        );
      }
      // Confirm the grant actually took by probing a real write.
      await probeWritePermission();
      return getStatus();
    }
  );

  ipcMain.handle(
    "focus:site:block",
    (_event, domains: string[]): Promise<SiteGuardDiagnostics> => {
      if (process.platform !== "win32") return getStatus();
      return block(Array.isArray(domains) ? domains : []);
    }
  );

  ipcMain.handle(
    "focus:site:unblock",
    (): Promise<SiteGuardDiagnostics> => {
      if (process.platform !== "win32") return getStatus();
      return unblock();
    }
  );

  ipcMain.handle(
    "focus:app:get-status",
    (): AppGuardDiagnostics => getAppStatus()
  );

  ipcMain.handle(
    "focus:app:enforce",
    (_event, exes: string[]): AppGuardDiagnostics => {
      if (process.platform !== "win32") return getAppStatus();
      return enforceApps(Array.isArray(exes) ? exes : []);
    }
  );

  ipcMain.handle(
    "focus:app:release",
    (): AppGuardDiagnostics => {
      if (process.platform !== "win32") return getAppStatus();
      return releaseApps();
    }
  );
}

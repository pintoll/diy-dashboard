import { useEffect } from "react";
import { useFocusModeStore } from "@/src/entities/focus-mode";
import { useBlocklistStore } from "../model/use-blocklist-store";

// Headless subscriber that makes block state a pure function of the declared
// intent: block while a focus-intent work session runs, release on any exit.
// Mounted once at the app root. All engine calls are no-ops off Windows.
export function FocusModeController() {
  const sessionActive = useFocusModeStore((s) => s.sessionActive);
  const intendedMode = useFocusModeStore((s) => s.intendedMode);
  const sites = useBlocklistStore((s) => s.sites);
  const apps = useBlocklistStore((s) => s.apps);

  const shouldBlock = sessionActive && intendedMode === "focus";

  // Keep the active-window poll alive while blocking so app kill-on-sight fires
  // even when telemetry (detectionEnabled) is off. Ref-counted in main, so this
  // composes with the pomodoro widget's own session notifications.
  useEffect(() => {
    if (!shouldBlock) return;
    const api = typeof window !== "undefined" ? window.electronAPI : undefined;
    void api?.notifyPomodoroSessionStarted?.();
    return () => {
      void api?.notifyPomodoroSessionEnded?.();
    };
  }, [shouldBlock]);

  // Enforce/release both engines. Re-applies when the blocklist changes mid
  // session (release old, apply new), keeping re-block airtight.
  useEffect(() => {
    const api = typeof window !== "undefined" ? window.electronAPI : undefined;
    if (!api) return;
    if (!shouldBlock) return;
    void api.siteGuard?.block(sites);
    void api.appGuard?.enforce(apps);
    return () => {
      void api.siteGuard?.unblock();
      void api.appGuard?.release();
    };
  }, [shouldBlock, sites, apps]);

  return null;
}

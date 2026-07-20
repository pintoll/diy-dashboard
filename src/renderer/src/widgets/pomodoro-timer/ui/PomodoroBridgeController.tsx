import { useEffect } from "react";
import { getWidgetStore, type WidgetStore } from "@/src/shared/lib/create-widget-store";
import { POMODORO_PRESETS } from "../model/pomodoro.types";
import type {
  PomodoroActions,
  PomodoroConfig,
  PomodoroState,
} from "../model/pomodoro.types";

// Headless subscriber that exposes the renderer-authoritative pomodoro timer to
// the main-process agent API. Mounted once at the app root (sibling of
// FocusModeController), so it stays alive while the window is hidden to tray.
//
// - It binds to the live store of the pomodoro widget instance the app root
//   hands it, and pushes a raw snapshot to main on every transition (the slice
//   does not read the dashboard's widget list itself). The store's set() fires on
//   start/pause/stop/skip/reset/set-preset, overtime enter, ~5s pollIdle updates,
//   and overtime exit — never on the plain countdown second — so pushes are
//   transition-driven without any timer here.
// - It executes commands main forwards back, applying the guard table (the store
//   silently no-ops on invalid actions; this turns that into applied:false).
//
// No pomodoro widget on the dashboard → it reports { bound: false }, which the
// agent API surfaces as 503.

type PomodoroStore = PomodoroState & PomodoroActions & { config: PomodoroConfig };

const BIND_RETRY_MS = 500;

function currentPhaseDurationSec(state: PomodoroStore): number {
  const c = state.config;
  const minutes =
    state.phase === "work"
      ? c.workDuration
      : state.phase === "shortBreak"
        ? c.shortBreakDuration
        : c.longBreakDuration;
  return minutes * 60;
}

function buildSnapshot(state: PomodoroStore): PomodoroRawSnapshot {
  return {
    phase: state.phase,
    isRunning: state.isRunning,
    startedAt: state.startedAt,
    pausedTimeRemaining: state.pausedTimeRemaining,
    phaseDurationSec: currentPhaseDurationSec(state),
    completedPomodoros: state.completedPomodoros,
    presetId: state.activePresetId,
    overtime: state.overtime
      ? {
          startedAt: state.overtime.startedAt,
          accumulatedSec: state.overtime.accumulatedSec,
          lastActiveAt: state.overtime.lastActiveAt,
          isIdle: state.overtime.isIdle,
        }
      : null,
    pendingReview: state.pendingReview !== null,
  };
}

// The guard table lives here, not in the store: the store's actions silently
// no-op on an invalid transition, and the bridge's job is to turn that silence
// into an explicit applied:false + reason.
function executeCommand(
  store: WidgetStore<PomodoroStore>,
  action: PomodoroCommandAction,
  presetId: string | undefined
): { applied: boolean; reason?: string; snapshot: PomodoroRawSnapshot } {
  const st = store.getState();
  const inOvertime = st.overtime !== null;
  const done = (applied: boolean, reason?: string) => ({
    applied,
    reason,
    snapshot: buildSnapshot(store.getState()),
  });

  switch (action) {
    case "start":
      if (inOvertime) return done(false, "overtime active");
      if (st.isRunning) return done(false, "already running");
      st.start();
      return done(true);
    case "pause":
      if (inOvertime) return done(false, "overtime active");
      if (!st.isRunning) return done(false, "not running");
      st.pause();
      return done(true);
    case "stop":
      if (inOvertime) return done(false, "overtime active");
      st.stop();
      return done(true);
    case "skip":
      if (inOvertime) return done(false, "overtime active");
      st.skip();
      return done(true);
    case "reset":
      st.reset();
      return done(true);
    case "stop-overtime":
      if (!inOvertime) return done(false, "no overtime active");
      st.stopOvertime();
      return done(true);
    case "set-preset": {
      if (inOvertime) return done(false, "overtime active");
      const preset = POMODORO_PRESETS.find((p) => p.id === presetId);
      if (!preset) return done(false, `unknown preset ${presetId}`);
      st.setPreset(preset.id, {
        ...st.config,
        workDuration: preset.workDuration,
        shortBreakDuration: preset.shortBreakDuration,
        longBreakDuration: preset.longBreakDuration,
      });
      return done(true);
    }
    default:
      return done(false, `unknown action ${action}`);
  }
}

type Props = {
  // The pomodoro widget instance to expose, or null when the dashboard has no
  // pomodoro widget (reported as unbound → 503).
  instanceId: string | null;
};

export function PomodoroBridgeController({ instanceId }: Props) {
  useEffect(() => {
    const bridge =
      typeof window !== "undefined" ? window.electronAPI?.pomodoroBridge : undefined;
    if (!bridge) return;

    if (instanceId === null) {
      bridge.sendSnapshot({ bound: false });
      return;
    }

    let store: WidgetStore<PomodoroStore> | undefined;
    let unsubscribe: (() => void) | undefined;
    let retry: ReturnType<typeof setInterval> | undefined;
    let lastJson = "";

    const push = () => {
      if (!store) return;
      const snapshot = buildSnapshot(store.getState());
      const json = JSON.stringify(snapshot);
      if (json === lastJson) return; // e.g. a processBuckets-only change
      lastJson = json;
      bridge.sendSnapshot({ bound: true, snapshot });
    };

    const bind = (): boolean => {
      const s = getWidgetStore<PomodoroStore>("pomodoro", instanceId);
      if (!s) return false;
      store = s;
      unsubscribe = store.subscribe(push);
      push();
      return true;
    };

    // The widget creates its store during render, but the dashboard route shows
    // "Loading..." first, so the store can appear after this effect runs. Poll
    // until it exists, reporting unbound (→ 503) in the meantime.
    if (!bind()) {
      bridge.sendSnapshot({ bound: false });
      retry = setInterval(() => {
        if (bind() && retry) {
          clearInterval(retry);
          retry = undefined;
        }
      }, BIND_RETRY_MS);
    }

    const offCommand = bridge.onCommand(({ id, action, presetId }) => {
      if (!store) return; // not bound yet — let main time out (504)
      const result = executeCommand(store, action, presetId);
      bridge.sendCommandResult({ id, ...result });
    });

    return () => {
      if (retry) clearInterval(retry);
      unsubscribe?.();
      offCommand();
      bridge.sendSnapshot({ bound: false });
    };
  }, [instanceId]);

  return null;
}

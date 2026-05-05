import type { PomodoroPhase } from "./pomodoro.types";

const PHASE_MESSAGES: Record<PomodoroPhase, { title: string; body: string }> = {
  work: {
    title: "Focus session complete!",
    body: "Time for a break.",
  },
  shortBreak: {
    title: "Short break is over!",
    body: "Ready to focus again.",
  },
  longBreak: {
    title: "Long break is over!",
    body: "Ready to start a new session.",
  },
};

function isElectron(): boolean {
  return !!window.electronAPI;
}

export function isNotificationSupported(): boolean {
  if (isElectron()) return true;
  return typeof window !== "undefined" && "Notification" in window;
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (isElectron()) return true;
  if (!isNotificationSupported()) return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

export function hasNotificationPermission(): boolean {
  if (isElectron()) return true;
  if (!isNotificationSupported()) return false;
  return Notification.permission === "granted";
}

export function showPhaseNotification(completedPhase: PomodoroPhase): void {
  const { title, body } = PHASE_MESSAGES[completedPhase];

  if (isElectron()) {
    window.electronAPI!.showNotification({ title, body });
    return;
  }

  if (!hasNotificationPermission()) return;
  new Notification(title, {
    body,
    tag: "pomodoro-phase-end",
  });
}

const OVERTIME_CAP_SEC = 3600;

export function showOvertimeAlarmNotification(thresholdSec: number): void {
  const minutes = Math.round(thresholdSec / 60);
  const isCap = thresholdSec >= OVERTIME_CAP_SEC;
  const title = isCap ? "Overtime cap reached" : `Overtime: +${minutes}m`;
  const body = isCap
    ? "Auto-stopped at 60 minutes."
    : `You've been in overtime for ${minutes} minutes.`;

  if (isElectron()) {
    window.electronAPI!.showNotification({ title, body });
    return;
  }

  if (!hasNotificationPermission()) return;
  new Notification(title, {
    body,
    tag: "pomodoro-overtime-alarm",
  });
}

export function schedulePhaseEndNotification(
  remainingSeconds: number,
  phase: PomodoroPhase
): () => void {
  const timeoutId = setTimeout(() => {
    showPhaseNotification(phase);
  }, remainingSeconds * 1000);

  return () => clearTimeout(timeoutId);
}

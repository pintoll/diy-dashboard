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

export function isNotificationSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!isNotificationSupported()) return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

export function hasNotificationPermission(): boolean {
  if (!isNotificationSupported()) return false;
  return Notification.permission === "granted";
}

export function showPhaseNotification(completedPhase: PomodoroPhase): void {
  if (!hasNotificationPermission()) return;

  const { title, body } = PHASE_MESSAGES[completedPhase];
  new Notification(title, {
    body,
    tag: "pomodoro-phase-end",
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

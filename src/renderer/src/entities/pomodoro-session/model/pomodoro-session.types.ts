export type PomodoroPhase = "work" | "shortBreak" | "longBreak";

export type PomodoroPresetId = "25:5" | "50:10" | "120:30" | "custom";

export type PomodoroPreset = {
  id: PomodoroPresetId;
  label: string;
  workDuration: number;
  shortBreakDuration: number;
  longBreakDuration: number;
};

export const POMODORO_PRESETS: PomodoroPreset[] = [
  { id: "25:5", label: "25 : 5", workDuration: 25, shortBreakDuration: 5, longBreakDuration: 15 },
  { id: "50:10", label: "50 : 10", workDuration: 50, shortBreakDuration: 10, longBreakDuration: 30 },
  { id: "120:30", label: "120 : 30", workDuration: 120, shortBreakDuration: 30, longBreakDuration: 90 },
];

export type PomodoroConfig = {
  workDuration: number;
  shortBreakDuration: number;
  longBreakDuration: number;
  pomodorosUntilLongBreak: number;
};

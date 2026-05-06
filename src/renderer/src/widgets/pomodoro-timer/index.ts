import { Timer } from "lucide-react";
import { defineWidget } from "@/src/widgets/widget-registry";
import type { PomodoroConfig } from "./model/pomodoro.types";
import { PomodoroClient } from "./ui/PomodoroClient";

export type { PomodoroConfig, PomodoroState } from "./model/pomodoro.types";

export const pomodoroTimerWidget = defineWidget<PomodoroConfig>({
  meta: {
    id: "pomodoro-timer",
    name: "Pomodoro Timer",
    description: "Focus timer with work and break intervals",
    category: "productivity",
    icon: Timer,
    size: {
      minW: 3,
      minH: 2,
      maxW: 3,
      maxH: 4,
      defaultW: 3,
      defaultH: 3,
    },
  },
  defaultConfig: {
    workDuration: 25,
    shortBreakDuration: 5,
    longBreakDuration: 15,
    pomodorosUntilLongBreak: 4,
    leisureProcesses: ["brave.exe"],
  },
  ClientComponent: PomodoroClient,
});

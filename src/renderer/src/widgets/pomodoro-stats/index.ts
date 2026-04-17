import { BarChart3 } from "lucide-react";
import { defineWidget } from "@/src/widgets/widget-registry";
import { PomodoroStatsClient, type PomodoroStatsConfig } from "./ui/PomodoroStatsClient";

export type { PomodoroStatsConfig };

export const pomodoroStatsWidget = defineWidget<PomodoroStatsConfig>({
  meta: {
    id: "pomodoro-stats",
    name: "Pomodoro Stats",
    description: "Weekly heatmap and streak for completed focus sessions",
    category: "productivity",
    icon: BarChart3,
    size: {
      minW: 3,
      minH: 2,
      maxW: 3,
      maxH: 4,
      defaultW: 3,
      defaultH: 3,
    },
  },
  defaultConfig: {},
  ClientComponent: PomodoroStatsClient,
});

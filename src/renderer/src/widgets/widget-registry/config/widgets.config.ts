import { widgetRegistry } from "../lib/registry";
import { pomodoroTimerWidget } from "@/src/widgets/pomodoro-timer";
import { dailyNewsWidget } from "@/src/widgets/daily-news";
import {
  testSmallWidget,
  testWideWidget,
  testTallWidget,
  testLargeWidget,
} from "@/src/widgets/test-widgets";

export function registerAllWidgets() {
  widgetRegistry.register(pomodoroTimerWidget);
  widgetRegistry.register(dailyNewsWidget);

  if (import.meta.env.DEV) {
    widgetRegistry.register(testSmallWidget);
    widgetRegistry.register(testWideWidget);
    widgetRegistry.register(testTallWidget);
    widgetRegistry.register(testLargeWidget);
  }
}

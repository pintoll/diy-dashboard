import { widgetRegistry } from "../lib/registry";
import { pomodoroTimerWidget } from "@/src/widgets/pomodoro-timer";
import { pomodoroStatsWidget } from "@/src/widgets/pomodoro-stats";
import { dailyNewsWidget } from "@/src/widgets/daily-news";
import { macroIndicatorsWidget } from "@/src/widgets/macro-indicators";
import { economicCalendarWidget } from "@/src/widgets/economic-calendar";
import { moneyFlowWidget } from "@/src/widgets/money-flow";
import { todoTodayWidget } from "@/src/widgets/todo-today";
import {
  testSmallWidget,
  testWideWidget,
  testTallWidget,
  testLargeWidget,
} from "@/src/widgets/test-widgets";

export function registerAllWidgets() {
  widgetRegistry.register(pomodoroTimerWidget);
  widgetRegistry.register(pomodoroStatsWidget);
  widgetRegistry.register(dailyNewsWidget);
  widgetRegistry.register(macroIndicatorsWidget);
  widgetRegistry.register(economicCalendarWidget);
  widgetRegistry.register(moneyFlowWidget);
  widgetRegistry.register(todoTodayWidget);

  if (import.meta.env.DEV) {
    widgetRegistry.register(testSmallWidget);
    widgetRegistry.register(testWideWidget);
    widgetRegistry.register(testTallWidget);
    widgetRegistry.register(testLargeWidget);
  }
}

import { widgetRegistry } from "../lib/registry";
import { pomodoroTimerWidget } from "@/src/widgets/pomodoro-timer";
import {
  testSmallWidget,
  testWideWidget,
  testTallWidget,
  testLargeWidget,
} from "@/src/widgets/test-widgets";

export function registerAllWidgets() {
  widgetRegistry.register(pomodoroTimerWidget);

  // Test widgets (for layout testing)
  widgetRegistry.register(testSmallWidget);
  widgetRegistry.register(testWideWidget);
  widgetRegistry.register(testTallWidget);
  widgetRegistry.register(testLargeWidget);
}

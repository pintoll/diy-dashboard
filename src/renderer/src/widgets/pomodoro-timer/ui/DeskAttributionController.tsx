import { useEffect } from "react";
import { useDashboardStore } from "@/src/widgets/dashboard-grid/model/use-dashboard-store";
import { useTodoStore } from "@/src/entities/todo";
import { getWidgetStore } from "@/src/shared/lib/create-widget-store";
import type {
  PomodoroActions,
  PomodoroConfig,
  PomodoroState,
} from "../model/pomodoro.types";

// Headless bridge from the desk (useTodoStore) to the pomodoro interval engine.
// The store opens/closes intervals at its own lifecycle boundaries (start,
// pause, finish, ...) by reading the desk directly; this controller covers the
// one thing the store can't observe on its own — the desk changing *mid-block*
// (a todo activated, completed, or cleared while the work clock runs). On each
// such change it asks the store to reconcile, which banks any member that left
// and opens any that joined.
//
// Mounted once at the app root (sibling of PomodoroBridgeController) so it stays
// alive while the window is hidden to tray. Like the bridge, it targets the
// first pomodoro widget instance's store, looked up lazily per change (no store
// yet -> nothing is accruing, so nothing to reconcile).

type PomodoroStore = PomodoroState & PomodoroActions & { config: PomodoroConfig };

export function DeskAttributionController() {
  const instanceId = useDashboardStore(
    (s) => s.widgets.find((w) => w.widgetId === "pomodoro-timer")?.instanceId ?? null
  );

  useEffect(() => {
    if (instanceId === null) return;

    let lastActiveId = useTodoStore.getState().activeTodoId;
    return useTodoStore.subscribe((state) => {
      if (state.activeTodoId === lastActiveId) return;
      lastActiveId = state.activeTodoId;
      const store = getWidgetStore<PomodoroStore>("pomodoro", instanceId);
      store?.getState().syncDesk();
    });
  }, [instanceId]);

  return null;
}

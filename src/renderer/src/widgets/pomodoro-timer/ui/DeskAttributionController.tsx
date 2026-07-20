import { useEffect } from "react";
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
// alive while the window is hidden to tray. The app root supplies the target
// instance id — the slice does not go looking for it on the dashboard — and the
// store itself is looked up lazily per change (no store yet -> nothing is
// accruing, so nothing to reconcile).

type PomodoroStore = PomodoroState & PomodoroActions & { config: PomodoroConfig };

type Props = {
  // The pomodoro widget instance to reconcile against, or null when the
  // dashboard has no pomodoro widget.
  instanceId: string | null;
};

export function DeskAttributionController({ instanceId }: Props) {
  useEffect(() => {
    if (instanceId === null) return;

    // Membership key over join-ordered desk ids. Any add/remove/complete flips
    // it; title or worked_sec edits do not, so unrelated todo writes don't churn
    // the interval engine.
    const deskKey = () =>
      useTodoStore.getState().desk.map((t) => t.id).join(",");
    let lastKey = deskKey();
    return useTodoStore.subscribe((state) => {
      const nextKey = state.desk.map((t) => t.id).join(",");
      if (nextKey === lastKey) return;
      lastKey = nextKey;
      const store = getWidgetStore<PomodoroStore>("pomodoro", instanceId);
      store?.getState().syncDesk();
    });
  }, [instanceId]);

  return null;
}

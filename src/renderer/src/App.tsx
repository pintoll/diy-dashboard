import { useEffect, useState } from "react";
import { Routes, Route } from "react-router-dom";
import { DashboardGrid, useDashboardStore } from "@/src/widgets/dashboard-grid/client";
import { registerAllWidgets } from "@/src/widgets/widget-registry";
import { UpdateToast } from "@/src/features/check-app-update/client";
import { FocusAnalyticsPage } from "@/src/pages/focus-analytics/client";
import { FinancePage } from "@/src/pages/finance/client";
import { TodosPage } from "@/src/pages/todos/client";
import { FocusModeController } from "@/src/features/focus-mode/client";
import {
  PomodoroBridgeController,
  DeskAttributionController,
} from "@/src/widgets/pomodoro-timer/client";

function HomePage() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    registerAllWidgets();
    setReady(true);
  }, []);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return <DashboardGrid />;
}

// The pomodoro slice's two headless controllers need the instance id of the
// pomodoro widget on the dashboard. That lookup is resolved here rather than
// inside the slice: `widgets` never imports from a sibling `widgets` slice, let
// alone past its barrel into `model/` (.claude/rules/ARCHITECTURE.md). `app` is
// the composition root and may read both, so the dependency points downward.
//
// Its own component so the subscription re-renders these two and not the routes.
function PomodoroControllers() {
  const instanceId = useDashboardStore(
    (s) => s.widgets.find((w) => w.widgetId === "pomodoro-timer")?.instanceId ?? null
  );

  return (
    <>
      <PomodoroBridgeController instanceId={instanceId} />
      <DeskAttributionController instanceId={instanceId} />
    </>
  );
}

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/focus-analytics" element={<FocusAnalyticsPage />} />
        <Route path="/finance" element={<FinancePage />} />
        <Route path="/todos" element={<TodosPage />} />
      </Routes>
      <UpdateToast />
      <FocusModeController />
      <PomodoroControllers />
    </>
  );
}

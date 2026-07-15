import { useEffect, useState } from "react";
import { Routes, Route } from "react-router-dom";
import { DashboardGrid } from "@/src/widgets/dashboard-grid/client";
import { registerAllWidgets } from "@/src/widgets/widget-registry";
import { UpdateToast } from "@/src/features/check-app-update/client";
import { FocusAnalyticsPage } from "@/src/pages/focus-analytics/client";
import { FinancePage } from "@/src/pages/finance/client";
import { TodosPage } from "@/src/pages/todos/client";
import { FocusModeController } from "@/src/features/focus-mode/client";
import { PomodoroBridgeController } from "@/src/widgets/pomodoro-timer/client";

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
      <PomodoroBridgeController />
    </>
  );
}

import { useEffect, useState } from "react";
import { Routes, Route } from "react-router-dom";
import { DashboardGrid } from "@/src/widgets/dashboard-grid/client";
import { registerAllWidgets } from "@/src/widgets/widget-registry";
import { UpdateToast } from "@/src/features/check-app-update/client";
import { FocusGuardPanel } from "@/src/features/focus-mode/client";

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
      </Routes>
      <UpdateToast />
      <FocusGuardPanel />
    </>
  );
}

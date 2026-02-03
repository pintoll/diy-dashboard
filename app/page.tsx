"use client";

import { useEffect, useState } from "react";
import { DashboardGrid } from "@/src/widgets/dashboard-grid/client";
import { registerAllWidgets } from "@/src/widgets/widget-registry";

export default function Home() {
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

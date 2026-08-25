import { useEffect, useState } from "react";
import { clockHm } from "@shared/day";

// Drives the current-time marker and the suggested block for a new line.
// Component-scoped like use-today, so an unmounted sheet stops ticking; 30s
// keeps the marker at most half a minute behind the wall clock.
const TICK_INTERVAL_MS = 30_000;

/** The wall clock as "HH:MM" (Asia/Seoul), re-rendering when the minute flips. */
export function useNowHm(): string {
  const [now, setNow] = useState(() => clockHm(Date.now()));
  useEffect(() => {
    const timer = setInterval(() => {
      const next = clockHm(Date.now());
      setNow((prev) => (prev === next ? prev : next));
    }, TICK_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);
  return now;
}

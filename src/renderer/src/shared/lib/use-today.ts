import { useEffect, useState } from "react";
import { today } from "@shared/day";

// Same rollover rule as the todo store's module-scope clock
// (entities/todo/model/use-todo-store.ts): poll every minute, update only when
// the 05:00 boundary actually passes. Component-scoped here so consumers that
// unmount stop ticking.
const DAY_CHECK_INTERVAL_MS = 60_000;

/** The current app day key, re-rendering when the 05:00 boundary passes. */
export function useToday(): string {
  const [day, setDay] = useState(() => today());
  useEffect(() => {
    const timer = setInterval(() => {
      const next = today();
      setDay((prev) => (prev === next ? prev : next));
    }, DAY_CHECK_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);
  return day;
}

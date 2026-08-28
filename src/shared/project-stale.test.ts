import { describe, expect, it } from "vitest";
import { STALE_AFTER_DAYS, isStale, type StaleSubject } from "./project-stale";

// Only the two fields the rule reads: the module is deliberately structural so
// the main process and the renderer can both hand it their own Project row.
const project = (over: Partial<StaleSubject> = {}): StaleSubject => ({
  kind: "project",
  status: "active",
  ...over,
});

describe("isStale", () => {
  const today = "2026-08-27";

  it("is false the day before the threshold", () => {
    const day = "2026-08-21"; // 6 days
    expect(isStale(project(), day, today)).toBe(false);
  });

  it("is true exactly on the threshold", () => {
    const day = "2026-08-20"; // 7 days
    expect(STALE_AFTER_DAYS).toBe(7);
    expect(isStale(project(), day, today)).toBe(true);
  });

  it("treats a project that never moved as stale", () => {
    expect(isStale(project(), null, today)).toBe(true);
  });

  it("never marks an area — it has no end to drift from", () => {
    expect(isStale(project({ kind: "area" }), null, today)).toBe(false);
  });

  it.each(["someday", "done", "archived"] as const)(
    "never marks a %s project — it is quiet on purpose",
    (status) => {
      expect(isStale(project({ status }), null, today)).toBe(false);
    }
  );
});

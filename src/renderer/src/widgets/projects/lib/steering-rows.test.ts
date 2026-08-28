// @vitest-environment jsdom
// Not for this module — it is pure — but for the entity barrel it imports:
// entities/todo wires its desk bridge off `window` at module scope.
import { describe, expect, it } from "vitest";
import type { Project, ProjectStats } from "@/src/entities/project";
import { buildSteeringRows, formatDaysAgo } from "./steering-rows";

const project = (over: Partial<Project> = {}): Project => ({
  id: "p1",
  kind: "project",
  title: "Ship it",
  outcome: null,
  status: "active",
  targetDate: null,
  sortOrder: 0,
  createdAt: "2026-08-01 00:00:00",
  updatedAt: "2026-08-01 00:00:00",
  archivedAt: null,
  ...over,
});

const stats = (over: Partial<ProjectStats> = {}): ProjectStats => ({
  projectId: "p1",
  total: 0,
  done: 0,
  openBacklog: 0,
  workedSec: 0,
  lastActivityDay: null,
  nextAction: null,
  isStale: false,
  ...over,
});

const today = "2026-08-27";

describe("formatDaysAgo", () => {
  it("names the recent days rather than counting them", () => {
    expect(formatDaysAgo("2026-08-27", today)).toBe("today");
    expect(formatDaysAgo("2026-08-26", today)).toBe("yesterday");
    expect(formatDaysAgo("2026-08-20", today)).toBe("7d ago");
  });

  it("reads a project that never moved as never, not as a huge count", () => {
    expect(formatDaysAgo(null, today)).toBe("never");
  });

  it("clamps a day in the future to today", () => {
    // Possible on a rollover: the store's currentDay is polled, activity is not.
    expect(formatDaysAgo("2026-08-28", today)).toBe("today");
  });
});

describe("buildSteeringRows", () => {
  it("keeps active projects only, in the order given", () => {
    const rows = buildSteeringRows(
      [
        project({ id: "a", title: "A" }),
        project({ id: "b", kind: "area" }),
        project({ id: "c", status: "someday" }),
        project({ id: "d", status: "archived" }),
        project({ id: "e", title: "E" }),
      ],
      {},
      today
    );
    expect(rows.map((r) => r.project.id)).toEqual(["a", "e"]);
  });

  it("falls back to zeros for a project main reported no rows for", () => {
    const [row] = buildSteeringRows([project()], {}, today);
    expect(row.stats.total).toBe(0);
    expect(row.pct).toBe(0);
    expect(row.lastActivityLabel).toBe("never");
    // Never having moved is exactly the case the badge exists for.
    expect(row.stale).toBe(true);
  });

  it("computes progress and staleness from the rollup", () => {
    const [row] = buildSteeringRows(
      [project()],
      { p1: stats({ total: 3, done: 1, lastActivityDay: "2026-08-26" }) },
      today
    );
    expect(row.pct).toBe(33);
    expect(row.stale).toBe(false);
    expect(row.lastActivityLabel).toBe("yesterday");
  });
});

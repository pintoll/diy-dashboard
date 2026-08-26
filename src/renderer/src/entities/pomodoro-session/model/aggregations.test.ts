import { describe, it, expect } from "vitest";
import {
  buildHeatmapCells,
  computeCurrentStreak,
  countThisWeek,
  countToday,
  dailyActiveHours,
  sessionsOnDate,
  timeOfDayPattern,
  weeklyActiveHours,
} from "./aggregations";
import type { PomodoroSessionRecord } from "./pomodoro-session.types";

// Analytics buckets on the app day (05:00 Asia/Seoul, @shared/day), keyed by
// `endedAt`. Every instant below is a UTC epoch so the expectations also prove
// the buckets do not depend on the machine timezone — the exact regression the
// old local-midnight primitives had.
const at = (iso: string): number => Date.parse(iso);

let nextId = 0;
function session(
  overrides: Partial<PomodoroSessionRecord> & { endedAt: number }
): PomodoroSessionRecord {
  return {
    id: `s${nextId++}`,
    phase: "work",
    startedAt: overrides.endedAt - 25 * 60 * 1000,
    durationSec: 1500,
    presetId: "25:5",
    overtimeSec: 0,
    idleSec: 0,
    intendedMode: "focus",
    attention: "focus",
    attentionSource: "auto",
    sessionEndType: "completed",
    processBuckets: {},
    cappedAt60m: false,
    todoIds: [],
    note: null,
    ...overrides,
  };
}

describe("sessionsOnDate", () => {
  it("puts a small-hours session on the previous app day, like completed_on", () => {
    // 08-25 02:00 KST — the doc's canonical example: same instant, same day
    // as the todo layer, unlike the old local-midnight bucketing.
    const s = session({ endedAt: at("2026-08-24T17:00:00Z") });
    expect(sessionsOnDate([s], "2026-08-24")).toHaveLength(1);
    expect(sessionsOnDate([s], "2026-08-25")).toHaveLength(0);
  });

  it("bounds the day half-open at 05:00 KST", () => {
    const boundary = at("2026-08-24T20:00:00Z"); // 08-25 05:00 KST
    const atBoundary = session({ endedAt: boundary });
    const justBefore = session({ endedAt: boundary - 1 });
    expect(sessionsOnDate([atBoundary], "2026-08-25")).toHaveLength(1);
    expect(sessionsOnDate([justBefore], "2026-08-24")).toHaveLength(1);
  });

  it("orders the day's sessions by start time", () => {
    const later = session({
      endedAt: at("2026-08-24T12:00:00Z"),
      startedAt: at("2026-08-24T11:30:00Z"),
    });
    const earlier = session({
      endedAt: at("2026-08-24T13:00:00Z"),
      startedAt: at("2026-08-24T09:00:00Z"),
    });
    const result = sessionsOnDate([later, earlier], "2026-08-24");
    expect(result.map((s) => s.id)).toEqual([earlier.id, later.id]);
  });
});

describe("countToday", () => {
  it("counts a 02:00 session while the night is still the same app day", () => {
    const s = session({ endedAt: at("2026-08-24T17:00:00Z") }); // 08-25 02:00 KST
    const now = at("2026-08-24T18:00:00Z"); // 08-25 03:00 KST, still day 08-24
    expect(countToday([s], now)).toBe(1);
  });

  it("drops it once 05:00 passes", () => {
    const s = session({ endedAt: at("2026-08-24T17:00:00Z") });
    const now = at("2026-08-24T21:00:00Z"); // 08-25 06:00 KST, day 08-25
    expect(countToday([s], now)).toBe(0);
  });
});

describe("computeCurrentStreak", () => {
  it("spans the 05:00 line: two consecutive app days from two wall nights", () => {
    const dayA = session({ endedAt: at("2026-08-23T14:00:00Z") }); // 08-23 23:00 KST
    const dayB = session({ endedAt: at("2026-08-24T17:00:00Z") }); // 08-25 02:00 KST = day 08-24
    const now = at("2026-08-24T18:00:00Z"); // 08-25 03:00 KST, day 08-24
    expect(computeCurrentStreak([dayA, dayB], now)).toBe(2);
  });

  it("keeps the no-session-yet-today grace", () => {
    const dayA = session({ endedAt: at("2026-08-23T14:00:00Z") });
    const dayB = session({ endedAt: at("2026-08-24T17:00:00Z") });
    const now = at("2026-08-25T03:00:00Z"); // 08-25 12:00 KST, day 08-25, no session
    expect(computeCurrentStreak([dayA, dayB], now)).toBe(2);
  });

  it("does not mint a spurious extra day from a lone small-hours session", () => {
    const s = session({ endedAt: at("2026-08-24T17:00:00Z") }); // day 08-24 only
    const now = at("2026-08-24T18:00:00Z");
    expect(computeCurrentStreak([s], now)).toBe(1);
  });

  it("breaks on a gap day", () => {
    const old = session({ endedAt: at("2026-08-22T10:00:00Z") }); // day 08-22
    const recent = session({ endedAt: at("2026-08-24T10:00:00Z") }); // day 08-24
    const now = at("2026-08-24T12:00:00Z");
    expect(computeCurrentStreak([old, recent], now)).toBe(1);
  });
});

describe("countThisWeek", () => {
  // 2026-08-24 is a Monday; the app week opens Monday 05:00 KST
  // (2026-08-23T20:00:00Z) and is half-open.
  const now = at("2026-08-26T03:00:00Z"); // Wednesday 12:00 KST

  it("excludes Monday 03:00 KST (previous app week) and includes 05:00 exactly", () => {
    const lastWeek = session({ endedAt: at("2026-08-23T18:00:00Z") }); // Mon 03:00 KST
    const thisWeek = session({ endedAt: at("2026-08-23T20:00:00Z") }); // Mon 05:00 KST
    expect(countThisWeek([lastWeek, thisWeek], now)).toBe(1);
  });
});

describe("weeklyActiveHours", () => {
  const now = at("2026-08-26T03:00:00Z"); // Wednesday 12:00 KST

  it("splits this week and last week at Monday 05:00 KST", () => {
    const lastWeek = session({ endedAt: at("2026-08-23T18:00:00Z") }); // Mon 03:00 KST
    const thisWeek = session({
      endedAt: at("2026-08-23T20:00:00Z"), // Mon 05:00 KST
      overtimeSec: 300, // active = 1500 + 300 = 0.5h
    });
    const result = weeklyActiveHours([lastWeek, thisWeek], now);
    expect(result.thisWeek.focusHours).toBeCloseTo(0.5);
    expect(result.lastWeek?.focusHours).toBeCloseTo(1500 / 3600);
  });

  it("returns lastWeek null when no history predates this week", () => {
    const thisWeek = session({ endedAt: at("2026-08-25T10:00:00Z") });
    expect(weeklyActiveHours([thisWeek], now).lastWeek).toBeNull();
  });
});

describe("dailyActiveHours", () => {
  it("emits exactly `days` consecutive rows, oldest first, zeros included", () => {
    const rows = dailyActiveHours([], 7, "2026-08-24");
    expect(rows).toHaveLength(7);
    expect(rows[0].date).toBe("2026-08-18");
    expect(rows[6].date).toBe("2026-08-24");
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].date > rows[i - 1].date).toBe(true);
    }
    expect(rows.every((r) => r.sessionCount === 0)).toBe(true);
  });

  it("accrues a small-hours session to the previous day's row and clips the window", () => {
    const inWindow = session({
      endedAt: at("2026-08-24T17:00:00Z"), // 08-25 02:00 KST = day 08-24
      overtimeSec: 300,
    });
    const leisure = session({
      endedAt: at("2026-08-20T10:00:00Z"), // day 08-20
      attention: "leisure",
    });
    const afterWindow = session({ endedAt: at("2026-08-25T10:00:00Z") }); // day 08-25
    const beforeWindow = session({ endedAt: at("2026-08-17T10:00:00Z") }); // day 08-17

    const rows = dailyActiveHours(
      [inWindow, leisure, afterWindow, beforeWindow],
      7,
      "2026-08-24"
    );
    const byDate = new Map(rows.map((r) => [r.date, r]));
    expect(byDate.get("2026-08-24")?.focusHours).toBeCloseTo(0.5);
    expect(byDate.get("2026-08-24")?.sessionCount).toBe(1);
    expect(byDate.get("2026-08-20")?.leisureHours).toBeCloseTo(1500 / 3600);
    const total = rows.reduce((n, r) => n + r.sessionCount, 0);
    expect(total).toBe(2);
  });
});

describe("buildHeatmapCells", () => {
  const now = at("2026-08-26T03:00:00Z"); // Wednesday 12:00 KST, day 08-26

  it("lays out weeks Monday-first with consecutive day keys", () => {
    const cells = buildHeatmapCells([], 3, now);
    expect(cells).toHaveLength(21);
    for (let w = 0; w < 3; w++) {
      const monday = new Date(`${cells[w * 7].date}T00:00:00Z`);
      expect(monday.getUTCDay()).toBe(1);
    }
    for (let i = 1; i < cells.length; i++) {
      expect(cells[i].date > cells[i - 1].date).toBe(true);
    }
    expect(cells[cells.length - 1].date).toBe("2026-08-30"); // current week's Sunday
  });

  it("zeroes future cells even when a session lands there", () => {
    const future = session({ endedAt: at("2026-08-27T10:00:00Z") }); // day 08-27
    const cells = buildHeatmapCells([future], 3, now);
    const cell = cells.find((c) => c.date === "2026-08-27");
    expect(cell?.count).toBe(0);
    expect(cell?.level).toBe(0);
  });

  it("agrees with sessionsOnDate on every counted cell", () => {
    const sessions = [
      session({ endedAt: at("2026-08-24T17:00:00Z") }), // day 08-24
      session({ endedAt: at("2026-08-24T10:00:00Z") }), // day 08-24
      session({ endedAt: at("2026-08-20T10:00:00Z") }), // day 08-20
    ];
    const cells = buildHeatmapCells(sessions, 3, now);
    for (const cell of cells) {
      if (cell.count > 0) {
        expect(sessionsOnDate(sessions, cell.date)).toHaveLength(cell.count);
      }
    }
    expect(cells.find((c) => c.date === "2026-08-24")?.count).toBe(2);
  });
});

describe("timeOfDayPattern", () => {
  it("buckets by the KST wall hour of the start, on any machine", () => {
    const s = session({
      startedAt: at("2026-08-24T17:00:00Z"), // 08-25 02:00 KST
      endedAt: at("2026-08-24T17:25:00Z"),
    });
    const buckets = timeOfDayPattern([s]);
    expect(buckets[2].focusCount).toBe(1);
    expect(buckets.reduce((n, b) => n + b.focusCount + b.leisureCount, 0)).toBe(1);
  });

  it("counts a collapse under both leisure and collapse", () => {
    const s = session({
      startedAt: at("2026-08-24T12:00:00Z"), // 21:00 KST
      endedAt: at("2026-08-24T12:25:00Z"),
      intendedMode: "focus",
      attention: "leisure",
    });
    const buckets = timeOfDayPattern([s]);
    expect(buckets[21].leisureCount).toBe(1);
    expect(buckets[21].collapseCount).toBe(1);
    expect(buckets[21].focusCount).toBe(0);
  });
});

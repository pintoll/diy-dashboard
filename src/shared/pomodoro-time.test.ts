import { describe, it, expect } from "vitest";
import { computeOvertimeElapsedSec, computeRemainingSec } from "./pomodoro-time";

// This module exists because main and the renderer must agree on these numbers
// (the widget's countdown vs. GET /api/pomodoro's `remainingSec`). The rules
// pinned here are the contract both sides now read.

const T0 = 1_700_000_000_000;
const WORK_SEC = 25 * 60;

describe("computeRemainingSec", () => {
  it("counts down from startedAt while running", () => {
    expect(
      computeRemainingSec(
        { isRunning: true, startedAt: T0, pausedTimeRemaining: null },
        WORK_SEC,
        T0 + 60_000
      )
    ).toBe(WORK_SEC - 60);
  });

  it("floors partial seconds rather than rounding", () => {
    expect(
      computeRemainingSec(
        { isRunning: true, startedAt: T0, pausedTimeRemaining: null },
        WORK_SEC,
        T0 + 1900
      )
    ).toBe(WORK_SEC - 1);
  });

  it("never goes negative once the phase is over", () => {
    expect(
      computeRemainingSec(
        { isRunning: true, startedAt: T0, pausedTimeRemaining: null },
        WORK_SEC,
        T0 + 90 * 60_000
      )
    ).toBe(0);
  });

  it("returns the frozen remainder while paused", () => {
    expect(
      computeRemainingSec(
        { isRunning: false, startedAt: null, pausedTimeRemaining: 300 },
        WORK_SEC,
        T0 + 60_000
      )
    ).toBe(300);
  });

  it("returns the full phase when nothing has started", () => {
    const idle = { isRunning: false, startedAt: null, pausedTimeRemaining: null };
    expect(computeRemainingSec(idle, WORK_SEC, T0)).toBe(WORK_SEC);
    // Running but not yet stamped: same answer, no NaN from a null startedAt.
    expect(
      computeRemainingSec({ ...idle, isRunning: true }, WORK_SEC, T0)
    ).toBe(WORK_SEC);
  });
});

describe("computeOvertimeElapsedSec", () => {
  it("is 0 when no overtime is running", () => {
    expect(computeOvertimeElapsedSec(null, T0)).toBe(0);
  });

  it("accrues from lastActiveAt while active", () => {
    expect(
      computeOvertimeElapsedSec(
        { accumulatedSec: 100, lastActiveAt: T0, isIdle: false },
        T0 + 30_000
      )
    ).toBe(130);
  });

  it("stops the clock while idle: the accumulated total reads back unchanged", () => {
    expect(
      computeOvertimeElapsedSec(
        { accumulatedSec: 100, lastActiveAt: T0, isIdle: true },
        T0 + 10 * 60_000
      )
    ).toBe(100);
  });

  it("never reads negative when lastActiveAt lands in the future", () => {
    // pollIdle derives lastActiveAt from the OS idle counter, which can come out
    // slightly ahead of `now`; that must not surface as a negative elapsed time.
    expect(
      computeOvertimeElapsedSec(
        { accumulatedSec: 0, lastActiveAt: T0 + 5_000, isIdle: false },
        T0
      )
    ).toBe(0);
  });
});

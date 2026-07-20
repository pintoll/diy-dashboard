import { describe, it, expect } from "vitest";
import {
  initialAttribution,
  startBlock,
  syncDesk,
  pauseBlock,
  resumeBlock,
  endBlock,
  type AttributionBank,
  type AttributionState,
} from "./desk-attribution";

// Fixed clock: a 25-minute (1500s) work block starting at t=0.
const SID = "sess1";
const BLOCK_START = 0;
const WORK_MS = 25 * 60 * 1000; // 1_500_000
const PHASE_END = BLOCK_START + WORK_MS;
const min = (n: number) => n * 60 * 1000;

// Convenience: index banks by todoId (tests here never bank a todo twice in one
// call except where noted, which they index by attributionId instead).
function byTodo(banks: AttributionBank[]): Record<string, AttributionBank> {
  const out: Record<string, AttributionBank> = {};
  for (const b of banks) out[b.todoId] = b;
  return out;
}

describe("desk-attribution interval math", () => {
  it("credits full block wall time to a member present the whole block", () => {
    const start = startBlock({ sessionId: SID, blockStartMs: BLOCK_START, phaseEndMs: PHASE_END, members: ["A"] });
    const end = endBlock(start.state, { at: PHASE_END, overtimeSec: 0 });
    expect(end.banks).toHaveLength(1);
    expect(end.banks[0]).toMatchObject({
      attributionId: "sess1:A:0",
      todoId: "A",
      startedAt: 0,
      endedAt: PHASE_END,
      workedSec: 1500,
    });
    // Block ended -> state reset.
    expect(end.state).toEqual(initialAttribution());
  });

  it("does not divide overlap: two members through one block each read the full time", () => {
    // A present from the start; B joins the desk mid-block at t=10min.
    let s: AttributionState = startBlock({ sessionId: SID, blockStartMs: 0, phaseEndMs: PHASE_END, members: ["A"] }).state;
    const joined = syncDesk(s, { members: ["A", "B"], at: min(10) });
    expect(joined.banks).toHaveLength(0); // joining banks nothing
    s = joined.state;

    const end = endBlock(s, { at: PHASE_END, overtimeSec: 0 });
    const banks = byTodo(end.banks);
    // A: full 25 min. B: from join (10) to phase end (25) = 15 min. Sum (40m)
    // exceeds the 25m block by design — no division.
    expect(banks["A"].workedSec).toBe(min(25) / 1000);
    expect(banks["B"].workedSec).toBe(min(15) / 1000);
    expect(banks["A"].attributionId).toBe("sess1:A:0");
    expect(banks["B"].attributionId).toBe("sess1:B:0");
  });

  it("completing a todo mid-block banks its partial interval and leaves the desk", () => {
    let s = startBlock({ sessionId: SID, blockStartMs: 0, phaseEndMs: PHASE_END, members: ["A", "B"] }).state;
    // A completes at t=5min -> desk becomes just [B].
    const done = syncDesk(s, { members: ["B"], at: min(5) });
    expect(done.banks).toHaveLength(1);
    expect(done.banks[0]).toMatchObject({ todoId: "A", workedSec: 300, endedAt: min(5) });
    s = done.state;

    const end = endBlock(s, { at: PHASE_END, overtimeSec: 0 });
    // Only B remains; A is not re-banked at session end.
    expect(end.banks).toHaveLength(1);
    expect(end.banks[0]).toMatchObject({ todoId: "B", workedSec: 1500 });
  });

  it("pause banks the elapsed portion; resume opens a fresh interval; sum equals the block", () => {
    let s = startBlock({ sessionId: SID, blockStartMs: 0, phaseEndMs: PHASE_END, members: ["A"] }).state;

    // Pause at t=5min -> banks 0..5min = 300s (seq 0).
    const paused = pauseBlock(s, { at: min(5) });
    expect(paused.banks).toHaveLength(1);
    expect(paused.banks[0]).toMatchObject({ attributionId: "sess1:A:0", workedSec: 300 });
    s = paused.state;
    expect(s.open).toHaveLength(0);

    // Resume at t=8min after a 3-min pause: phase end shifts to 28min. Only
    // 20min of running time remains.
    const shiftedEnd = min(28);
    const resumed = resumeBlock(s, { at: min(8), phaseEndMs: shiftedEnd, members: ["A"] });
    expect(resumed.banks).toHaveLength(0);
    s = resumed.state;

    // Session ends at the (shifted) phase end.
    const end = endBlock(s, { at: shiftedEnd, overtimeSec: 0 });
    expect(end.banks).toHaveLength(1);
    // Second stint: 8min..28min = 1200s, id seq 1.
    expect(end.banks[0]).toMatchObject({ attributionId: "sess1:A:1", workedSec: 1200 });

    // Pre-pause 300 + post-resume 1200 = 1500 = the full 25-min block. Pause
    // time is excluded from both.
    expect(paused.banks[0].workedSec + end.banks[0].workedSec).toBe(1500);
  });

  it("overtime: block time is capped at phase end, then the overtime bonus is added", () => {
    const s = startBlock({ sessionId: SID, blockStartMs: 0, phaseEndMs: PHASE_END, members: ["A"] }).state;
    // Timer hit 0 at PHASE_END; overtime ran 5 wall-min but idle-excluded
    // accumulated is 250s. Session ends at t=30min with overtimeSec=250.
    const end = endBlock(s, { at: min(30), overtimeSec: 250 });
    expect(end.banks).toHaveLength(1);
    // Block portion is capped at the 25-min phase end (1500s), NOT 30min; the
    // 250s idle-excluded overtime is added on top.
    expect(end.banks[0]).toMatchObject({ todoId: "A", workedSec: 1500 + 250, endedAt: min(30) });
  });

  it("overtime bonus goes only to members still on the desk at session end", () => {
    let s = startBlock({ sessionId: SID, blockStartMs: 0, phaseEndMs: PHASE_END, members: ["A", "B"] }).state;
    // A leaves during the block; B rides through overtime.
    s = syncDesk(s, { members: ["B"], at: min(20) }).state;
    const end = endBlock(s, { at: min(30), overtimeSec: 250 });
    const banks = byTodo(end.banks);
    // A left at 20min: 1200s block, no overtime.
    expect(banks["A"]).toBeUndefined(); // A was banked at the leave, not here
    expect(banks["B"].workedSec).toBe(1500 + 250);
  });

  it("leave then rejoin within one session yields two distinct interval rows", () => {
    let s = startBlock({ sessionId: SID, blockStartMs: 0, phaseEndMs: PHASE_END, members: ["A"] }).state;

    // A leaves at 5min (seq 0 banks 300s)...
    const left = syncDesk(s, { members: [], at: min(5) });
    expect(left.banks).toHaveLength(1);
    expect(left.banks[0]).toMatchObject({ attributionId: "sess1:A:0", workedSec: 300 });
    s = left.state;
    expect(s.open).toHaveLength(0);

    // ...and rejoins at 12min (seq 1 opens).
    const rejoined = syncDesk(s, { members: ["A"], at: min(12) });
    expect(rejoined.banks).toHaveLength(0);
    s = rejoined.state;

    const end = endBlock(s, { at: PHASE_END, overtimeSec: 0 });
    expect(end.banks).toHaveLength(1);
    // Second stint: 12min..25min = 780s, distinct id.
    expect(end.banks[0]).toMatchObject({ attributionId: "sess1:A:1", workedSec: 780 });

    // Two separate ledger rows, never merged.
    expect(left.banks[0].attributionId).not.toBe(end.banks[0].attributionId);
  });

  it("an empty desk banks nothing", () => {
    const s = startBlock({ sessionId: SID, blockStartMs: 0, phaseEndMs: PHASE_END, members: [] }).state;
    const end = endBlock(s, { at: PHASE_END, overtimeSec: 0 });
    expect(end.banks).toHaveLength(0);
  });

  it("early stop before the phase end banks only the elapsed block seconds", () => {
    const s = startBlock({ sessionId: SID, blockStartMs: 0, phaseEndMs: PHASE_END, members: ["A"] }).state;
    // Stopped at 7min with no overtime.
    const end = endBlock(s, { at: min(7), overtimeSec: 0 });
    expect(end.banks[0]).toMatchObject({ todoId: "A", workedSec: 420, endedAt: min(7) });
  });

  it("syncDesk on an inactive (ended) session is a no-op", () => {
    const s = initialAttribution();
    const r = syncDesk(s, { members: ["A"], at: 1000 });
    expect(r.banks).toHaveLength(0);
    expect(r.state).toBe(s);
  });

  it("a member that only ever exists in overtime banks 0 block seconds (no negative)", () => {
    let s = startBlock({ sessionId: SID, blockStartMs: 0, phaseEndMs: PHASE_END, members: [] }).state;
    // C joins at 27min, i.e. already in overtime (past the 25-min phase end).
    s = syncDesk(s, { members: ["C"], at: min(27) }).state;
    const end = endBlock(s, { at: min(30), overtimeSec: 250 });
    // Block overlap clamps to 0 (start is past phase end). The overtime share is
    // clamped too: C was present for 3 of the 5 overtime minutes, so it banks
    // 180s of the 250s total, not all of it.
    expect(end.banks[0]).toMatchObject({ todoId: "C", workedSec: 180 });
  });

  it("a late joiner cannot bank overtime it was not present for", () => {
    let s = startBlock({ sessionId: SID, blockStartMs: 0, phaseEndMs: PHASE_END, members: ["A"] }).state;
    // 50 min of overtime after the 25-min block; C lands on the desk one minute
    // before the stop at t=75min.
    s = syncDesk(s, { members: ["A", "C"], at: min(74) }).state;
    const end = endBlock(s, { at: min(75), overtimeSec: 3000 });
    const banks = byTodo(end.banks);
    // A rode the whole thing: full block + full overtime.
    expect(banks["A"].workedSec).toBe(1500 + 3000);
    // C: no block time, and only the 60s of overtime it was actually there for.
    expect(banks["C"].workedSec).toBe(60);
  });

  it("an early stop credits a manually entered overtime total in full", () => {
    const s = startBlock({ sessionId: SID, blockStartMs: 0, phaseEndMs: PHASE_END, members: ["A"] }).state;
    // Stopped at 7min, so there is no overtime window at all. The 780s comes
    // from the review dialog's editable total and applies to the session.
    const end = endBlock(s, { at: min(7), overtimeSec: 780 });
    expect(end.banks[0]).toMatchObject({ todoId: "A", workedSec: 420 + 780 });
  });
});

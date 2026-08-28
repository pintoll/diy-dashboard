import { describe, expect, it } from "vitest";
import { mergeProjectSeconds, type ProjectInterval } from "./project-time";

// Epoch-ms fixtures written as UTC instants: the merge is pure arithmetic on
// wall-clock ranges and must not depend on the machine's timezone.
const at = (iso: string): number => Date.parse(iso);

/**
 * An interval whose credited seconds fill its whole span - the ordinary case,
 * where nothing was trimmed. `workedSec` is passed explicitly only by the tests
 * that care about the two diverging.
 */
function interval(
  projectId: string | null,
  from: string,
  to: string,
  workedSec?: number
): ProjectInterval {
  const startedAt = at(from);
  const endedAt = at(to);
  return {
    projectId,
    startedAt,
    endedAt,
    workedSec: workedSec ?? Math.floor((endedAt - startedAt) / 1000),
  };
}

function secondsOf(rows: ProjectInterval[], projectId: string | null): number {
  return (
    mergeProjectSeconds(rows).find((row) => row.projectId === projectId)
      ?.seconds ?? 0
  );
}

describe("mergeProjectSeconds", () => {
  it("sums disjoint intervals", () => {
    const rows = [
      interval("p1", "2026-08-27T01:00:00Z", "2026-08-27T01:25:00Z"),
      interval("p1", "2026-08-27T02:00:00Z", "2026-08-27T02:10:00Z"),
    ];
    expect(secondsOf(rows, "p1")).toBe(35 * 60);
  });

  it("counts a block once when two todos of one project share the desk", () => {
    // The whole reason this module exists: the ledger banks both members in
    // full, so summing worked_sec would report 50 minutes for 25.
    const rows = [
      interval("p1", "2026-08-27T01:00:00Z", "2026-08-27T01:25:00Z"),
      interval("p1", "2026-08-27T01:00:00Z", "2026-08-27T01:25:00Z"),
    ];
    expect(secondsOf(rows, "p1")).toBe(25 * 60);
  });

  it("merges partial overlap into one stretch", () => {
    const rows = [
      interval("p1", "2026-08-27T01:00:00Z", "2026-08-27T01:20:00Z"),
      interval("p1", "2026-08-27T01:10:00Z", "2026-08-27T01:30:00Z"),
    ];
    expect(secondsOf(rows, "p1")).toBe(30 * 60);
  });

  it("merges an interval fully contained in another", () => {
    const rows = [
      interval("p1", "2026-08-27T01:00:00Z", "2026-08-27T01:30:00Z"),
      interval("p1", "2026-08-27T01:05:00Z", "2026-08-27T01:10:00Z"),
    ];
    expect(secondsOf(rows, "p1")).toBe(30 * 60);
  });

  it("merges touching intervals, so a rejoin at the same instant is one stretch", () => {
    const rows = [
      interval("p1", "2026-08-27T01:00:00Z", "2026-08-27T01:10:00Z"),
      interval("p1", "2026-08-27T01:10:00Z", "2026-08-27T01:20:00Z"),
    ];
    expect(secondsOf(rows, "p1")).toBe(20 * 60);
  });

  it("does not merge across projects", () => {
    // Two different projects on one desk each keep the whole overlap: the desk
    // model does not divide time, so these deliberately sum past wall clock.
    const rows = [
      interval("p1", "2026-08-27T01:00:00Z", "2026-08-27T01:25:00Z"),
      interval("p2", "2026-08-27T01:00:00Z", "2026-08-27T01:25:00Z"),
    ];
    expect(secondsOf(rows, "p1")).toBe(25 * 60);
    expect(secondsOf(rows, "p2")).toBe(25 * 60);
  });

  it("keeps the unfiled bucket as its own group", () => {
    const rows = [
      interval(null, "2026-08-27T01:00:00Z", "2026-08-27T01:15:00Z"),
      interval("p1", "2026-08-27T01:00:00Z", "2026-08-27T01:25:00Z"),
    ];
    expect(secondsOf(rows, null)).toBe(15 * 60);
    expect(secondsOf(rows, "p1")).toBe(25 * 60);
  });

  it("is order independent", () => {
    const ordered = [
      interval("p1", "2026-08-27T01:00:00Z", "2026-08-27T01:20:00Z"),
      interval("p1", "2026-08-27T01:10:00Z", "2026-08-27T01:30:00Z"),
      interval("p1", "2026-08-27T03:00:00Z", "2026-08-27T03:05:00Z"),
    ];
    const shuffled = [ordered[2], ordered[0], ordered[1]];
    expect(mergeProjectSeconds(shuffled)).toEqual(mergeProjectSeconds(ordered));
  });

  it("counts the credited window, not the whole span", () => {
    // worked_sec is block overlap plus a trimmed, idle-excluded overtime share,
    // so a 30-minute interval can have credited only 25.
    const rows = [
      interval("p1", "2026-08-27T01:00:00Z", "2026-08-27T01:30:00Z", 25 * 60),
    ];
    expect(secondsOf(rows, "p1")).toBe(25 * 60);
  });

  it("merges credited windows, so a shortened one stops shadowing the next", () => {
    // Spans overlap; credited windows do not. Merging the spans would report
    // 40 minutes where only 35 were ever credited.
    const rows = [
      interval("p1", "2026-08-27T01:00:00Z", "2026-08-27T01:30:00Z", 20 * 60),
      interval("p1", "2026-08-27T01:20:00Z", "2026-08-27T01:40:00Z", 20 * 60),
    ];
    expect(secondsOf(rows, "p1")).toBe(40 * 60);
  });

  it("never credits more wall clock than the interval held", () => {
    // A manual overtime top-up is credited in full to everyone still open, so
    // worked_sec can outrun the span; the span wins.
    const rows = [
      interval("p1", "2026-08-27T01:00:00Z", "2026-08-27T01:10:00Z", 90 * 60),
    ];
    expect(secondsOf(rows, "p1")).toBe(10 * 60);
  });

  it("drops a row that was credited nothing", () => {
    const rows = [
      interval("p1", "2026-08-27T01:00:00Z", "2026-08-27T01:30:00Z", 0),
    ];
    expect(mergeProjectSeconds(rows)).toEqual([]);
  });

  it("drops empty and inverted intervals rather than counting them negative", () => {
    const rows = [
      interval("p1", "2026-08-27T01:00:00Z", "2026-08-27T01:00:00Z"),
      interval("p1", "2026-08-27T02:00:00Z", "2026-08-27T01:00:00Z"),
    ];
    expect(mergeProjectSeconds(rows)).toEqual([]);
  });

  it("returns nothing for an empty ledger", () => {
    expect(mergeProjectSeconds([])).toEqual([]);
  });
});

// @vitest-environment jsdom
// Not for this module - it is pure - but for the entity barrels it imports:
// entities/project re-exports entities/todo, which wires its desk bridge off
// `window` at module scope.
import { describe, expect, it } from "vitest";
import type { PomodoroSessionRecord } from "@/src/entities/pomodoro-session";
import type { Project, ProjectTimeIndex } from "@/src/entities/project";
import { buildProjectFocusRows, unattributedSec } from "./project-focus";

let nextId = 0;
const session = (
  over: Partial<PomodoroSessionRecord> = {}
): PomodoroSessionRecord => ({
  id: `s${nextId++}`,
  phase: "work",
  startedAt: Date.parse("2026-08-27T01:00:00Z"),
  endedAt: Date.parse("2026-08-27T01:25:00Z"),
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
  ...over,
});

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

const index = (over: Partial<ProjectTimeIndex> = {}): ProjectTimeIndex => ({
  time: [],
  todoProject: {},
  ...over,
});

const rowFor = (
  rows: ReturnType<typeof buildProjectFocusRows>,
  projectId: string | null
) => rows.find((row) => row.projectId === projectId);

describe("buildProjectFocusRows", () => {
  it("takes the bar from the merged ledger, not from the session log", () => {
    const rows = buildProjectFocusRows(
      [session({ todoIds: ["t1"] })],
      index({
        time: [{ projectId: "p1", seconds: 3600 }],
        todoProject: { t1: "p1" },
      }),
      [project()]
    );
    expect(rowFor(rows, "p1")?.seconds).toBe(3600);
    // The session contributed its active time to the attention half only.
    expect(rowFor(rows, "p1")?.deskSec).toBe(1500);
  });

  it("credits a session in full to every project its desk touched", () => {
    // The desk does not divide time, so deskSec deliberately double-counts
    // across projects the way the ledger's own overlap does.
    const rows = buildProjectFocusRows(
      [session({ todoIds: ["t1", "t2"] })],
      index({
        time: [
          { projectId: "p1", seconds: 1500 },
          { projectId: "p2", seconds: 900 },
        ],
        todoProject: { t1: "p1", t2: "p2" },
      }),
      [project(), project({ id: "p2", title: "Other" })]
    );
    expect(rowFor(rows, "p1")?.deskSec).toBe(1500);
    expect(rowFor(rows, "p2")?.deskSec).toBe(1500);
    expect(rowFor(rows, "p1")?.sessionCount).toBe(1);
    expect(rowFor(rows, "p2")?.sessionCount).toBe(1);
  });

  it("counts a session once for a project even with two of its todos on the desk", () => {
    const rows = buildProjectFocusRows(
      [session({ todoIds: ["t1", "t2"] })],
      index({
        time: [{ projectId: "p1", seconds: 1500 }],
        todoProject: { t1: "p1", t2: "p1" },
      }),
      [project()]
    );
    expect(rowFor(rows, "p1")?.deskSec).toBe(1500);
    expect(rowFor(rows, "p1")?.sessionCount).toBe(1);
  });

  it("counts overtime in desk time, like every other card on the page", () => {
    const rows = buildProjectFocusRows(
      [session({ todoIds: ["t1"], overtimeSec: 300 })],
      index({ time: [], todoProject: { t1: "p1" } }),
      [project()]
    );
    expect(rowFor(rows, "p1")?.deskSec).toBe(1800);
  });

  it("splits desk time by the attention verdict", () => {
    const rows = buildProjectFocusRows(
      [
        session({ todoIds: ["t1"] }),
        session({ todoIds: ["t1"], attention: "leisure" }),
      ],
      index({ time: [], todoProject: { t1: "p1" } }),
      [project()]
    );
    expect(rowFor(rows, "p1")?.deskSec).toBe(3000);
    expect(rowFor(rows, "p1")?.focusSec).toBe(1500);
  });

  it("counts a collapse only when a declared focus ended in leisure", () => {
    const rows = buildProjectFocusRows(
      [
        session({ todoIds: ["t1"], intendedMode: "focus", attention: "leisure" }),
        session({ todoIds: ["t1"], intendedMode: "leisure", attention: "leisure" }),
        // Never declared, never backfilled: not a collapse.
        session({ todoIds: ["t1"], intendedMode: null, attention: "leisure" }),
      ],
      index({ time: [], todoProject: { t1: "p1" } }),
      [project()]
    );
    expect(rowFor(rows, "p1")?.collapseCount).toBe(1);
    expect(rowFor(rows, "p1")?.sessionCount).toBe(3);
  });

  it("sends an unfiled todo, and an unknown one, to the no-project row", () => {
    const rows = buildProjectFocusRows(
      [session({ todoIds: ["t-unfiled"] }), session({ todoIds: ["t-deleted"] })],
      index({
        time: [{ projectId: null, seconds: 600 }],
        todoProject: {},
      }),
      [project()]
    );
    expect(rowFor(rows, null)?.seconds).toBe(600);
    expect(rowFor(rows, null)?.sessionCount).toBe(2);
    expect(rowFor(rows, null)?.status).toBeNull();
  });

  it("claims nothing for a session with an empty desk", () => {
    const rows = buildProjectFocusRows(
      [session({ todoIds: [] })],
      index({ time: [{ projectId: "p1", seconds: 600 }], todoProject: {} }),
      [project()]
    );
    expect(rows).toHaveLength(1);
    expect(rowFor(rows, "p1")?.sessionCount).toBe(0);
    expect(rowFor(rows, null)).toBeUndefined();
  });

  it("drops a project id with time but no project row", () => {
    const rows = buildProjectFocusRows(
      [],
      index({ time: [{ projectId: "gone", seconds: 600 }] }),
      [project()]
    );
    expect(rows).toEqual([]);
  });

  it("drops a project with neither time nor sessions", () => {
    const rows = buildProjectFocusRows([], index(), [project()]);
    expect(rows).toEqual([]);
  });

  it("keeps an archived project, tagged with its status", () => {
    const rows = buildProjectFocusRows(
      [],
      index({ time: [{ projectId: "p1", seconds: 600 }] }),
      [project({ status: "archived" })]
    );
    expect(rowFor(rows, "p1")?.status).toBe("archived");
  });

  it("ranks by merged time and breaks ties on title", () => {
    const rows = buildProjectFocusRows(
      [],
      index({
        time: [
          { projectId: "p1", seconds: 100 },
          { projectId: "p2", seconds: 900 },
          { projectId: "p3", seconds: 100 },
        ],
      }),
      [
        project({ id: "p1", title: "Zebra" }),
        project({ id: "p2", title: "Middle" }),
        project({ id: "p3", title: "Alpha" }),
      ]
    );
    expect(rows.map((row) => row.title)).toEqual(["Middle", "Alpha", "Zebra"]);
  });
});

describe("unattributedSec", () => {
  it("counts only the sessions that had nothing on the desk", () => {
    expect(
      unattributedSec([
        session({ todoIds: [] }),
        session({ todoIds: [], overtimeSec: 300 }),
        session({ todoIds: ["t1"] }),
      ])
    ).toBe(1500 + 1800);
  });
});

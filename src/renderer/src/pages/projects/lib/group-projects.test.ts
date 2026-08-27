import { describe, expect, it } from "vitest";
import type { Project } from "@/src/entities/project";
import { groupProjects } from "./group-projects";

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

const sectionOf = (projects: Project[], id: string): string | undefined =>
  groupProjects(projects).find((s) => s.projects.some((p) => p.id === id))?.key;

describe("groupProjects", () => {
  it("orders the sections for steering: moving, standing, parked, finished", () => {
    expect(groupProjects([]).map((s) => s.key)).toEqual([
      "active",
      "areas",
      "someday",
      "done",
      "archived",
    ]);
  });

  it("splits active projects from active areas", () => {
    const rows = [
      project({ id: "a", kind: "project" }),
      project({ id: "b", kind: "area" }),
    ];
    expect(sectionOf(rows, "a")).toBe("active");
    expect(sectionOf(rows, "b")).toBe("areas");
  });

  it("files a parked area under someday, not under areas", () => {
    const rows = [project({ id: "b", kind: "area", status: "someday" })];
    expect(sectionOf(rows, "b")).toBe("someday");
  });

  it("files an archived area under archived, not under areas", () => {
    const rows = [project({ id: "b", kind: "area", status: "archived" })];
    expect(sectionOf(rows, "b")).toBe("archived");
  });

  it("lists every project exactly once", () => {
    const rows = [
      project({ id: "a" }),
      project({ id: "b", kind: "area" }),
      project({ id: "c", status: "someday" }),
      project({ id: "d", status: "done" }),
      project({ id: "e", status: "archived" }),
    ];
    const listed = groupProjects(rows).flatMap((s) => s.projects.map((p) => p.id));
    expect(listed.sort()).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("folds the record sections and leaves the working ones open", () => {
    const collapsed = Object.fromEntries(
      groupProjects([]).map((s) => [s.key, s.collapsed])
    );
    expect(collapsed).toEqual({
      active: false,
      areas: false,
      someday: false,
      done: true,
      archived: true,
    });
  });
});

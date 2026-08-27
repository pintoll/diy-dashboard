import { daysBetween } from "@shared/day";
import type { Project } from "@/src/entities/project";

// How the left list is ordered, and when a project reads as rotting. Pure and
// db-free so both rules are testable — they are the page's only real judgement
// (docs/design/projects-para.md).

// The design doc's badge threshold. The weekly review sweeps at two weeks; this
// is the earlier, quieter nag that makes the sweep unnecessary.
export const STALE_AFTER_DAYS = 7;

export type ProjectSection = {
  key: "active" | "areas" | "someday" | "done" | "archived";
  label: string;
  projects: Project[];
  // Sections that are a record rather than a working list start folded.
  collapsed: boolean;
};

/**
 * The left list, in steering order: what should be moving, then what stands,
 * then what is parked, then what is finished.
 *
 * `kind` and `status` are orthogonal, so the split is deliberate rather than a
 * group-by. Archiving wins over everything — an archived area is a record, not
 * a standing responsibility — and someday wins over kind, because a parked area
 * is exactly as parked as a parked project.
 */
export function groupProjects(projects: Project[]): ProjectSection[] {
  const archived = projects.filter((p) => p.status === "archived");
  const rest = projects.filter((p) => p.status !== "archived");

  return [
    {
      key: "active",
      label: "Active",
      projects: rest.filter((p) => p.status === "active" && p.kind === "project"),
      collapsed: false,
    },
    {
      key: "areas",
      label: "Areas",
      projects: rest.filter((p) => p.status === "active" && p.kind === "area"),
      collapsed: false,
    },
    {
      key: "someday",
      label: "Someday",
      projects: rest.filter((p) => p.status === "someday"),
      collapsed: false,
    },
    {
      key: "done",
      label: "Done",
      projects: rest.filter((p) => p.status === "done"),
      collapsed: true,
    },
    { key: "archived", label: "Archived", projects: archived, collapsed: true },
  ];
}

/**
 * Whether a project has gone quiet. Only active projects can: an area has no
 * end to drift away from, and someday/done/archived are quiet on purpose.
 *
 * A project with no activity at all counts as stale — it was created and then
 * nothing happened, which is the case worth surfacing.
 */
export function isStale(project: Project, lastActivityDay: string | null, currentDay: string): boolean {
  if (project.status !== "active" || project.kind !== "project") return false;
  if (lastActivityDay === null) return true;
  return daysBetween(lastActivityDay, currentDay) >= STALE_AFTER_DAYS;
}

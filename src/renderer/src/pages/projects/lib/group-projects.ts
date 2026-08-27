import type { Project } from "@/src/entities/project";

// How the left list is ordered. Pure and db-free so the rule is testable — it
// is the page's own judgement; the stale rule it renders alongside belongs to
// the entity (docs/design/projects-para.md).

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

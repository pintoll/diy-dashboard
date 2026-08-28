import { daysBetween } from "@shared/day";
import { isStale, statsOf, type Project, type ProjectStats } from "@/src/entities/project";

// What the steering card draws, derived from the project list and the stats
// rollup it already has. Pure so both judgements — who appears, and how long
// ago "last activity" reads — are testable
// (docs/design/projects-para.md, the widget section).

export type SteeringRow = {
  project: Project;
  stats: ProjectStats;
  stale: boolean;
  /** Completion as a whole percent; 0 when nothing is filed under the project. */
  pct: number;
  lastActivityLabel: string;
};

/**
 * How long ago the project last moved, in the same day-key arithmetic the stale
 * rule uses. Not formatTimeAgo, which measures from an instant: activity is a
 * day, and a session at 02:00 belongs to the day before it by the clock.
 */
export function formatDaysAgo(
  lastActivityDay: string | null,
  currentDay: string
): string {
  if (lastActivityDay === null) return "never";
  const days = daysBetween(lastActivityDay, currentDay);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

/**
 * The glance, in the order main already sorted the projects (`sort_order`,
 * `created_at`) so the card and the page's Active section agree and rows never
 * reshuffle under a click.
 *
 * Active projects only. An area has no end to drift from — `isStale` never
 * fires for one — so it would sit here as permanent, unactionable noise.
 */
export function buildSteeringRows(
  projects: Project[],
  stats: Record<string, ProjectStats>,
  currentDay: string
): SteeringRow[] {
  return projects
    .filter((project) => project.status === "active" && project.kind === "project")
    .map((project) => {
      const rowStats = statsOf(stats, project.id);
      return {
        project,
        stats: rowStats,
        stale: isStale(project, rowStats.lastActivityDay, currentDay),
        pct:
          rowStats.total === 0
            ? 0
            : Math.round((rowStats.done / rowStats.total) * 100),
        lastActivityLabel: formatDaysAgo(rowStats.lastActivityDay, currentDay),
      };
    });
}

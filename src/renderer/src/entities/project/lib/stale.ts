import { daysBetween } from "@shared/day";
import type { Project } from "../model/project.types";

// When a project reads as rotting. It lives on the entity rather than on the
// page because two surfaces nag with it — the /projects list and the projects
// widget — and widgets may not import from pages.

// The design doc's badge threshold (docs/design/projects-para.md). The weekly
// review sweeps at two weeks; this is the earlier, quieter nag that makes the
// sweep unnecessary.
export const STALE_AFTER_DAYS = 7;

/**
 * Whether a project has gone quiet. Only active projects can: an area has no
 * end to drift away from, and someday/done/archived are quiet on purpose.
 *
 * A project with no activity at all counts as stale — it was created and then
 * nothing happened, which is the case worth surfacing.
 */
export function isStale(
  project: Project,
  lastActivityDay: string | null,
  currentDay: string
): boolean {
  if (project.status !== "active" || project.kind !== "project") return false;
  if (lastActivityDay === null) return true;
  return daysBetween(lastActivityDay, currentDay) >= STALE_AFTER_DAYS;
}

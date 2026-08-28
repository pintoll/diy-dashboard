import { daysBetween } from "./day";

// When a project reads as rotting. It lives in shared rather than on the
// renderer entity because four surfaces nag with the rule now — the /projects
// list, the projects widget, `dyd projects` and the secretary's session load —
// and the last two reach it through the agent API, which the main process
// serves. Keeping it here is what stops the CLI reimplementing 7 days in
// Python.

// The design doc's badge threshold (docs/design/projects-para.md). The weekly
// review sweeps at two weeks; this is the earlier, quieter nag that makes the
// sweep unnecessary.
export const STALE_AFTER_DAYS = 7;

/** The shape the rule actually reads — a Project row from either side. */
export type StaleSubject = {
  status: "active" | "someday" | "done" | "archived";
  kind: "project" | "area";
};

/**
 * Whether a project has gone quiet. Only active projects can: an area has no
 * end to drift away from, and someday/done/archived are quiet on purpose.
 *
 * A project with no activity at all counts as stale — it was created and then
 * nothing happened, which is the case worth surfacing.
 */
export function isStale(
  project: StaleSubject,
  lastActivityDay: string | null,
  currentDay: string
): boolean {
  if (project.status !== "active" || project.kind !== "project") return false;
  if (lastActivityDay === null) return true;
  return daysBetween(lastActivityDay, currentDay) >= STALE_AFTER_DAYS;
}

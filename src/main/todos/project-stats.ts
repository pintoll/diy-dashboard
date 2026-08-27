import { dayOf } from "@shared/day";
import { sqliteUtcToMs } from "@shared/sqlite-time";
import { getTodosDb } from "./db";
import type { ProjectStats } from "./types";

// The steering numbers behind the projects page (docs/design/projects-para.md):
// progress for the detail pane, and a last-activity day for the left list's
// stale badge — the ambient nag that replaces discipline.
//
// Rolled up for every project at once rather than per project, because the left
// list needs all of them on first paint and listProjectTodos would be one round
// trip each. Three grouped scans, merged here; `idx_todos_project` covers the
// two that matter.
//
// "Activity" means the project moved: time banked against one of its todos, a
// todo finished, or a note written. `projects.updated_at` is deliberately not a
// source — renaming a project is not progress, and counting it would clear the
// stale badge of a project nobody has actually touched.

type TodoRollup = {
  projectId: string;
  total: number;
  done: number;
  openBacklog: number;
  workedSec: number;
  lastCompletedOn: string | null;
};

type LastMs = { projectId: string; ms: number | null };
type LastAt = { projectId: string; at: string | null };

/** The later of two yyyy-MM-dd days; either may be absent. */
function laterDay(a: string | null, b: string | null): string | null {
  if (a === null) return b;
  if (b === null) return a;
  return a > b ? a : b;
}

export function listProjectStats(): ProjectStats[] {
  const db = getTodosDb();

  const rollups = db
    .prepare(
      `SELECT project_id           AS projectId,
              COUNT(*)             AS total,
              SUM(done)            AS done,
              SUM(CASE WHEN date IS NULL AND done = 0 THEN 1 ELSE 0 END) AS openBacklog,
              COALESCE(SUM(worked_sec), 0) AS workedSec,
              MAX(completed_on)    AS lastCompletedOn
       FROM todos
       WHERE project_id IS NOT NULL
       GROUP BY project_id`
    )
    .all() as TodoRollup[];

  // started_at is the attribution instant, the same rule fold.ts uses to decide
  // which day a session belongs to.
  const sessions = db
    .prepare(
      `SELECT t.project_id AS projectId, MAX(s.started_at) AS ms
       FROM todo_sessions s
       JOIN todos t ON t.id = s.todo_id
       WHERE t.project_id IS NOT NULL
       GROUP BY t.project_id`
    )
    .all() as LastMs[];

  // Every project owns at least its default `notes` doc, so this is also what
  // gives a brand-new project a last-activity day: the day it was created.
  const docs = db
    .prepare(
      `SELECT project_id AS projectId, MAX(updated_at) AS at
       FROM project_docs
       GROUP BY project_id`
    )
    .all() as LastAt[];

  const byId = new Map<string, ProjectStats>();
  const ensure = (projectId: string): ProjectStats => {
    let stats = byId.get(projectId);
    if (stats === undefined) {
      stats = {
        projectId,
        total: 0,
        done: 0,
        openBacklog: 0,
        workedSec: 0,
        lastActivityDay: null,
      };
      byId.set(projectId, stats);
    }
    return stats;
  };

  for (const row of rollups) {
    const stats = ensure(row.projectId);
    stats.total = row.total;
    stats.done = row.done;
    stats.openBacklog = row.openBacklog;
    stats.workedSec = row.workedSec;
    stats.lastActivityDay = laterDay(stats.lastActivityDay, row.lastCompletedOn);
  }

  for (const row of sessions) {
    if (row.ms === null) continue;
    const stats = ensure(row.projectId);
    stats.lastActivityDay = laterDay(stats.lastActivityDay, dayOf(row.ms));
  }

  for (const row of docs) {
    const ms = sqliteUtcToMs(row.at);
    if (ms === null) continue;
    const stats = ensure(row.projectId);
    stats.lastActivityDay = laterDay(stats.lastActivityDay, dayOf(ms));
  }

  return [...byId.values()];
}

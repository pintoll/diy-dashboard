import { dayOf } from "@shared/day";
import { isStale, type StaleSubject } from "@shared/project-stale";
import { sqliteUtcToMs } from "@shared/sqlite-time";
import { getTodosDb } from "./db";
import type { ProjectStats } from "./types";

// The steering numbers behind the projects page and the projects widget
// (docs/design/projects-para.md): progress for the detail pane, a last-activity
// day for the stale badge — the ambient nag that replaces discipline — and the
// next action, which is what the widget offers to pull onto today.
//
// Rolled up for every project at once rather than per project, because both
// surfaces need all of them on first paint and listProjectTodos would be one
// round trip each. One project scan plus four grouped ones, merged here;
// `idx_todos_project` covers the rollups and `idx_todos_open` the next-action
// pick. `nextAction` is the odd one out: not an aggregate but a pick — the row
// that would come first out of the backlog. `isStale` is the other: derived
// from lastActivityDay against the app's day, resolved here because the CLI and
// the secretary read this over HTTP, where today is the server's call.
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

type Subject = StaleSubject & { projectId: string };
type LastMs = { projectId: string; ms: number | null };
type LastAt = { projectId: string; at: string | null };
type NextAction = { projectId: string; id: string; title: string };

/** The later of two yyyy-MM-dd days; either may be absent. */
function laterDay(a: string | null, b: string | null): string | null {
  if (a === null) return b;
  if (b === null) return a;
  return a > b ? a : b;
}

export function listProjectStats(): ProjectStats[] {
  const db = getTodosDb();

  // Read first so every project gets a row even with nothing filed under it,
  // and so the stale verdict has the status and kind it turns on. An id that
  // appears only in a rollup is an orphan the service layer should have
  // detached; it still gets stats, but never a stale verdict invented for a
  // project that is not there.
  const subjects = db
    .prepare("SELECT id AS projectId, status, kind FROM projects")
    .all() as Subject[];

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
  // Reading updated_at as activity holds only because updateProjectDoc moves it
  // on a body write alone — a tab rename leaves it where it was.
  const docs = db
    .prepare(
      `SELECT project_id AS projectId, MAX(updated_at) AS at
       FROM project_docs
       GROUP BY project_id`
    )
    .all() as LastAt[];

  // The head of each project's backlog, under exactly the order
  // listProjectTodos hands the page (`sort_order, created_at, id`) — the
  // widget's next action and the page's first backlog row must be the same
  // todo. `id` is what makes that literal: created_at is CURRENT_TIMESTAMP, one
  // second wide, so two todos reordered into the same sort_order within a
  // second would otherwise leave the two queries free to disagree.
  // ROW_NUMBER rather than the bare-column MIN(sort_order) trick, which cannot
  // express the tiebreakers.
  const nextActions = db
    .prepare(
      `SELECT projectId, id, title FROM (
         SELECT project_id AS projectId, id, title,
                ROW_NUMBER() OVER (
                  PARTITION BY project_id ORDER BY sort_order, created_at, id
                ) AS rn
         FROM todos
         WHERE project_id IS NOT NULL AND date IS NULL AND done = 0
       ) WHERE rn = 1`
    )
    .all() as NextAction[];

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
        nextAction: null,
        isStale: false,
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

  for (const row of nextActions) {
    ensure(row.projectId).nextAction = { id: row.id, title: row.title };
  }

  for (const row of docs) {
    const ms = sqliteUtcToMs(row.at);
    if (ms === null) continue;
    const stats = ensure(row.projectId);
    stats.lastActivityDay = laterDay(stats.lastActivityDay, dayOf(ms));
  }

  // Last, because it reads lastActivityDay after every source has folded in.
  const today = dayOf(Date.now());
  for (const subject of subjects) {
    const stats = ensure(subject.projectId);
    stats.isStale = isStale(subject, stats.lastActivityDay, today);
  }

  return [...byId.values()];
}

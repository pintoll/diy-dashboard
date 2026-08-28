import { dayOf } from "@shared/day";
import { isStale, type StaleSubject } from "@shared/project-stale";
import { sqliteUtcToMs } from "@shared/sqlite-time";
import { getTodosDb } from "./db";
import { mergeProjectSeconds, type ProjectInterval } from "./project-time";
import type {
  ProjectStats,
  ProjectStatsWithStale,
  ProjectTime,
} from "./types";

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
// that would come first out of the backlog.
//
// The stale verdict is deliberately NOT part of this rollup: it turns on
// "today", and this module serves two transports whose today differs. The HTTP
// route stamps it via listProjectStatsWithStale below (over the wire, today is
// the server's call); the same rollup crosses IPC bare, and the renderer judges
// staleness against its own useToday(), because a dashboard window stays open
// across the 05:00 boundary and a stamped flag would freeze there.
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

  // Read first so every project gets a row even with nothing filed under it.
  const subjects = db.prepare("SELECT id AS projectId FROM projects").all() as {
    projectId: string;
  }[];

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

  for (const subject of subjects) ensure(subject.projectId);

  return [...byId.values()];
}

/**
 * Wall-clock seconds per project for the focus-analytics view: every banked
 * interval, resolved to its todo's *current* project and merged
 * (project-time.ts). Refiling a todo therefore moves its history, exactly as
 * listProjectStats already behaves.
 *
 * `worked_sec` travels with the bounds because the merge runs on the credited
 * window, not the raw span - the two differ once overtime is trimmed or idle is
 * excluded. project-time.ts explains why.
 *
 * No `WHERE project_id IS NOT NULL` - the NULL group is the unfiled bucket, the
 * one row on that card that is not a project. A full `todo_sessions` scan plus
 * PK lookups on todos; at one row per desk member per interval that stays small
 * enough not to be worth an index of its own, and the whole ledger is the point
 * (the card is all-time).
 */
export function listProjectTime(): ProjectTime[] {
  const rows = getTodosDb()
    .prepare(
      `SELECT t.project_id AS projectId,
              s.started_at  AS startedAt,
              s.ended_at    AS endedAt,
              s.worked_sec  AS workedSec
       FROM todo_sessions s
       JOIN todos t ON t.id = s.todo_id`
    )
    .all() as ProjectInterval[];
  return mergeProjectSeconds(rows);
}

/**
 * Every filed todo's project, as a lookup. The renderer needs it to turn a
 * pomodoro session record's `todoIds` (the desk union, and the only thing
 * pomodoro.db knows about todos.db) into the set of projects that session
 * touched. Unfiled todos are omitted rather than mapped to null: an absent key
 * and a null value would mean the same thing, and omitting keeps the payload to
 * the todos that can actually answer.
 */
export function listTodoProjectIndex(): Record<string, string> {
  const rows = getTodosDb()
    .prepare(
      "SELECT id, project_id AS projectId FROM todos WHERE project_id IS NOT NULL"
    )
    .all() as { id: string; projectId: string }[];
  return Object.fromEntries(rows.map((row) => [row.id, row.projectId]));
}

/**
 * The rollup as the agent API serves it: every row plus the stale verdict
 * judged against `today` — the app's current day, which over HTTP is the
 * server's call (projects-routes.ts passes `today()` from @shared/day). Kept
 * out of listProjectStats so the IPC payload can never carry a verdict the
 * renderer would be tempted to read across the 05:00 boundary.
 */
export function listProjectStatsWithStale(today: string): ProjectStatsWithStale[] {
  // An id that appears only in a rollup is an orphan the service layer should
  // have detached; it still gets stats, but never a stale verdict invented for
  // a project that is not there.
  const subjects = new Map(
    (
      getTodosDb()
        .prepare("SELECT id AS projectId, status, kind FROM projects")
        .all() as Subject[]
    ).map((subject) => [subject.projectId, subject])
  );
  return listProjectStats().map((stats) => {
    const subject = subjects.get(stats.projectId);
    return {
      ...stats,
      isStale:
        subject !== undefined && isStale(subject, stats.lastActivityDay, today),
    };
  });
}

import {
  bucketOf,
  isCollapse,
  sessionActiveSec,
  type PomodoroSessionRecord,
} from "@/src/entities/pomodoro-session";
import type { Project, ProjectTimeIndex } from "@/src/entities/project";

// The project axis of the focus-analytics page: where the hours went, and how
// focused they were once they got there.
//
// Every other card on the page folds one array. This one is a join across two
// databases that share no key, so the shape of the join is the design:
//
// - The **time bar** is todos.db. `todo_sessions` banks one interval per desk
//   member, undivided, so the ledger is merged per project in main
//   (todos/project-time.ts) and arrives here already summed. Two todos of one
//   project through a 25m block are 25m, not 50m.
// - The **attention line** is pomodoro.db. Only the session record carries the
//   focus/leisure verdict, and its only link to a todo is `todoIds` - the desk
//   union stamped at record time. There is no session key shared with the
//   ledger (`todo_sessions.session_id` and `sessions.id` are independent
//   nanoids, minted at block start and at record time respectively), so the
//   verdict cannot be resolved per interval. It is resolved per session: a
//   session counts in full for every project its desk touched.
//
// The two therefore measure differently and must be shown as two numbers, never
// added or divided into one another. A project's `focusSec / deskSec` is "how
// focused were the sessions this project sat through", not "how many of its
// merged seconds were focused".
//
// Both halves inherit the desk model's no-division rule: two *different*
// projects on one desk each keep the whole block. Totals here can exceed the
// wall clock, which is why the card ranks bars and never draws a whole.

/** The unfiled bucket's row id. Null, because it is the absence of a project. */
export type ProjectFocusRow = {
  projectId: string | null;
  title: string;
  // Null for the unfiled row; otherwise the project's own status, so the card
  // can mark history that is no longer active.
  status: Project["status"] | null;
  // Merged wall clock, todos.db.
  seconds: number;
  // Session time whose desk touched this project, pomodoro.db.
  deskSec: number;
  // Of deskSec, the part labelled focus.
  focusSec: number;
  collapseCount: number;
  sessionCount: number;
};

const UNFILED_TITLE = "No project";

type Accumulator = {
  deskSec: number;
  focusSec: number;
  collapseCount: number;
  sessionCount: number;
};

function emptyAccumulator(): Accumulator {
  return { deskSec: 0, focusSec: 0, collapseCount: 0, sessionCount: 0 };
}

/**
 * One row per project that has either banked time or sat through a session,
 * ranked by merged time. Sessions with nothing on the desk land in no row at
 * all - they were logged, but nothing claims them; the card says so in its
 * caption rather than inventing a bucket for them.
 */
export function buildProjectFocusRows(
  sessions: PomodoroSessionRecord[],
  index: ProjectTimeIndex,
  projects: Project[]
): ProjectFocusRow[] {
  const byId = new Map(projects.map((project) => [project.id, project]));

  // The unfiled bucket is a real row keyed by null - Maps and Sets take it as
  // a key like any other, so no string stand-in is needed.
  const attention = new Map<string | null, Accumulator>();
  for (const session of sessions) {
    // A todo missing from the map is either unfiled or since deleted; both are
    // honestly "not any project's time", so both fall to the unfiled bucket.
    const touched = new Set<string | null>();
    for (const todoId of session.todoIds) {
      touched.add(index.todoProject[todoId] ?? null);
    }
    if (touched.size === 0) continue;

    const activeSec = sessionActiveSec(session);
    const focused = bucketOf(session.attention) === "focus";
    const collapsed = isCollapse(session);
    for (const key of touched) {
      let acc = attention.get(key);
      if (acc === undefined) {
        acc = emptyAccumulator();
        attention.set(key, acc);
      }
      acc.deskSec += activeSec;
      if (focused) acc.focusSec += activeSec;
      if (collapsed) acc.collapseCount++;
      acc.sessionCount++;
    }
  }

  const seconds = new Map<string | null, number>();
  for (const row of index.time) {
    seconds.set(row.projectId, (seconds.get(row.projectId) ?? 0) + row.seconds);
  }

  const rows: ProjectFocusRow[] = [];
  for (const key of new Set([...seconds.keys(), ...attention.keys()])) {
    const unfiled = key === null;
    const project = unfiled ? undefined : byId.get(key);
    // A project id with time but no row is an orphan the service layer should
    // have detached. It gets no invented title; listProjectStatsWithStale drops
    // the same case for the same reason.
    if (!unfiled && project === undefined) continue;

    const acc = attention.get(key) ?? emptyAccumulator();
    const merged = seconds.get(key) ?? 0;
    if (merged === 0 && acc.sessionCount === 0) continue;

    rows.push({
      projectId: key,
      title: project?.title ?? UNFILED_TITLE,
      status: project?.status ?? null,
      seconds: merged,
      deskSec: acc.deskSec,
      focusSec: acc.focusSec,
      collapseCount: acc.collapseCount,
      sessionCount: acc.sessionCount,
    });
  }

  // Merged time is the ranking, since it is the number the bar draws. Title
  // breaks ties so the order is stable across refreshes rather than Map order.
  rows.sort((a, b) => b.seconds - a.seconds || a.title.localeCompare(b.title));
  return rows;
}

/**
 * Session time that reached no row: nothing was on the desk, so no project and
 * not even the unfiled bucket can claim it. The card prints it as a caption -
 * it is the honest gap between "hours logged" and "hours accounted for".
 */
export function unattributedSec(
  sessions: PomodoroSessionRecord[]
): number {
  let sec = 0;
  for (const session of sessions) {
    if (session.todoIds.length === 0) sec += sessionActiveSec(session);
  }
  return sec;
}

import { addDays, dayOf, dayStartMs, hourOf, today, weekStartOf } from "@shared/day";
import type {
  AttentionVerdict,
  PomodoroSessionRecord,
} from "./pomodoro-session.types";

export type HeatmapLevel = 0 | 1 | 2 | 3 | 4;

export type HeatmapCell = {
  date: string;
  count: number;
  level: HeatmapLevel;
};

// Every day bucket below is the app day (05:00 Asia/Seoul boundary, @shared/day),
// keyed by `endedAt` — the same day a todo finished in that session stamps
// `completed_on`, so the heatmap and the todo layer can never disagree.
function countByDate(sessions: PomodoroSessionRecord[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const s of sessions) {
    const key = dayOf(s.endedAt);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function levelForCount(count: number): HeatmapLevel {
  if (count === 0) return 0;
  if (count === 1) return 1;
  if (count === 2) return 2;
  if (count === 3) return 3;
  return 4;
}

export function countToday(
  sessions: PomodoroSessionRecord[],
  now: number = Date.now()
): number {
  const todayKey = dayOf(now);
  let n = 0;
  for (const s of sessions) {
    if (dayOf(s.endedAt) === todayKey) n++;
  }
  return n;
}

export function countThisWeek(
  sessions: PomodoroSessionRecord[],
  now: number = Date.now()
): number {
  // App week: Monday 05:00 KST, half-open — a session ending Monday 03:00
  // still belongs to the previous week.
  const weekStartsAt = dayStartMs(weekStartOf(dayOf(now)));
  let n = 0;
  for (const s of sessions) {
    if (s.endedAt >= weekStartsAt) n++;
  }
  return n;
}

export function computeCurrentStreak(
  sessions: PomodoroSessionRecord[],
  now: number = Date.now()
): number {
  if (sessions.length === 0) return 0;

  const dateKeys = new Set<string>();
  for (const s of sessions) dateKeys.add(dayOf(s.endedAt));

  // No session yet today doesn't break the streak; start counting yesterday.
  const todayKey = dayOf(now);
  let cursor = dateKeys.has(todayKey) ? todayKey : addDays(todayKey, -1);

  let streak = 0;
  while (dateKeys.has(cursor)) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export type WeeklyHours = {
  focusHours: number;
  leisureHours: number;
  totalHours: number;
};

export type WeeklyHoursComparison = {
  thisWeek: WeeklyHours;
  lastWeek: WeeklyHours | null;
};

// Active engaged time: planned work plus real overtime. idleSec is already
// excluded from both fields at record time, so it is not subtracted here.
function sessionActiveSec(s: PomodoroSessionRecord): number {
  return s.durationSec + s.overtimeSec;
}

// Attention is binary (focus/leisure) after the v2 migration; this stays a
// total function over the union as a defensive normalizer.
function bucketOf(attention: AttentionVerdict): "focus" | "leisure" {
  return attention === "focus" ? "focus" : "leisure";
}

function sumHours(sessions: PomodoroSessionRecord[]): WeeklyHours {
  let focusSec = 0;
  let leisureSec = 0;
  for (const s of sessions) {
    if (bucketOf(s.attention) === "focus") focusSec += sessionActiveSec(s);
    else leisureSec += sessionActiveSec(s);
  }
  return {
    focusHours: focusSec / 3600,
    leisureHours: leisureSec / 3600,
    totalHours: (focusSec + leisureSec) / 3600,
  };
}

export function weeklyActiveHours(
  sessions: PomodoroSessionRecord[],
  now: number = Date.now()
): WeeklyHoursComparison {
  // Week windows derive from day keys, never from a local `+ 7 * 24h` — the
  // fixed-width-day assumption lives in @shared/day, once.
  const thisWeekStartDay = weekStartOf(dayOf(now));
  const thisWeekStart = dayStartMs(thisWeekStartDay);
  const lastWeekStart = dayStartMs(addDays(thisWeekStartDay, -7));

  const thisWeekSessions: PomodoroSessionRecord[] = [];
  const lastWeekSessions: PomodoroSessionRecord[] = [];
  let hasHistoryBeforeThisWeek = false;

  for (const s of sessions) {
    if (s.endedAt >= thisWeekStart) {
      thisWeekSessions.push(s);
    } else {
      hasHistoryBeforeThisWeek = true;
      if (s.endedAt >= lastWeekStart) lastWeekSessions.push(s);
    }
  }

  return {
    thisWeek: sumHours(thisWeekSessions),
    lastWeek: hasHistoryBeforeThisWeek ? sumHours(lastWeekSessions) : null,
  };
}

export type LifetimeStats = {
  focusHours: number;
  leisureHours: number;
  totalHours: number;
  overtimeHours: number;
  sessionCount: number;
};

// All-time celebration totals: one fold over the entire log. Reuses the same
// active-time and focus/leisure bucketing as the weekly hero, so the page and
// the widget never disagree.
export function lifetimeStats(sessions: PomodoroSessionRecord[]): LifetimeStats {
  let focusSec = 0;
  let leisureSec = 0;
  let overtimeSec = 0;
  for (const s of sessions) {
    if (bucketOf(s.attention) === "focus") focusSec += sessionActiveSec(s);
    else leisureSec += sessionActiveSec(s);
    overtimeSec += s.overtimeSec;
  }
  return {
    focusHours: focusSec / 3600,
    leisureHours: leisureSec / 3600,
    totalHours: (focusSec + leisureSec) / 3600,
    overtimeHours: overtimeSec / 3600,
    sessionCount: sessions.length,
  };
}

// --- Phase 3: diagnosis aggregations ---

export type IntentOutcomeCell = { count: number; hours: number };

// intent (declared at start) x outcome (verdict at end). `collapse` (intended
// focus, ended leisure) is the headline metric. Sessions with no declared
// intent (legacy `intendedMode === null`) are excluded from the 2x2.
export type IntentOutcomeMatrix = {
  heldLine: IntentOutcomeCell; // focus -> focus
  collapse: IntentOutcomeCell; // focus -> leisure
  bonus: IntentOutcomeCell; // leisure -> focus
  honestRest: IntentOutcomeCell; // leisure -> leisure
  excludedNullIntent: number;
};

export function intentOutcomeMatrix(
  sessions: PomodoroSessionRecord[]
): IntentOutcomeMatrix {
  const cell = (): IntentOutcomeCell => ({ count: 0, hours: 0 });
  const matrix: IntentOutcomeMatrix = {
    heldLine: cell(),
    collapse: cell(),
    bonus: cell(),
    honestRest: cell(),
    excludedNullIntent: 0,
  };

  for (const s of sessions) {
    if (s.intendedMode === null) {
      matrix.excludedNullIntent++;
      continue;
    }
    const outcome = bucketOf(s.attention);
    const target =
      s.intendedMode === "focus"
        ? outcome === "focus"
          ? matrix.heldLine
          : matrix.collapse
        : outcome === "focus"
          ? matrix.bonus
          : matrix.honestRest;
    target.count++;
    target.hours += sessionActiveSec(s) / 3600;
  }

  return matrix;
}

export type HourBucket = {
  hour: number; // 0-23, Asia/Seoul wall clock
  focusCount: number;
  leisureCount: number;
  collapseCount: number; // intended focus, ended leisure
};

// 24 KST wall-hour buckets keyed by session start, so leisure/collapse
// clustering ("this hour is where I weaken") is visible.
export function timeOfDayPattern(
  sessions: PomodoroSessionRecord[]
): HourBucket[] {
  const buckets: HourBucket[] = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    focusCount: 0,
    leisureCount: 0,
    collapseCount: 0,
  }));

  for (const s of sessions) {
    const bucket = buckets[hourOf(s.startedAt)];
    const outcome = bucketOf(s.attention);
    if (outcome === "focus") bucket.focusCount++;
    else bucket.leisureCount++;
    if (s.intendedMode === "focus" && outcome === "leisure") {
      bucket.collapseCount++;
    }
  }

  return buckets;
}

export type DailyHours = {
  date: string; // app day key (05:00 Asia/Seoul boundary)
  focusHours: number;
  leisureHours: number;
  sessionCount: number;
};

// Per-day focus/leisure hours for a sliding window of `days` ending on the
// day `endDay` (inclusive), oldest first. Buckets by `endedAt` to match the
// heatmap and day drill-down; active time = planned + overtime. Days with no
// sessions are emitted as zero rows so the window is always `days` long and
// navigation never collapses.
export function dailyActiveHours(
  sessions: PomodoroSessionRecord[],
  days: number,
  endDay: string = today()
): DailyHours[] {
  // Fixed-width keys, so lexicographic order is date order.
  const startDay = addDays(endDay, -(days - 1));

  type Acc = { focusSec: number; leisureSec: number; count: number };
  const byDate = new Map<string, Acc>();
  for (const s of sessions) {
    const key = dayOf(s.endedAt);
    if (key < startDay || key > endDay) continue;
    const acc = byDate.get(key) ?? { focusSec: 0, leisureSec: 0, count: 0 };
    if (bucketOf(s.attention) === "focus") acc.focusSec += sessionActiveSec(s);
    else acc.leisureSec += sessionActiveSec(s);
    acc.count++;
    byDate.set(key, acc);
  }

  const out: DailyHours[] = [];
  for (let i = 0; i < days; i++) {
    const key = addDays(startDay, i);
    const acc = byDate.get(key);
    out.push({
      date: key,
      focusHours: acc ? acc.focusSec / 3600 : 0,
      leisureHours: acc ? acc.leisureSec / 3600 : 0,
      sessionCount: acc?.count ?? 0,
    });
  }
  return out;
}

export type AppUsage = { exe: string; seconds: number };

// Total foreground seconds per app across every session, top N. Note: focus
// mode blocks leisure sites, so a collapse leaves little trace here — the
// blocked browser never loads (see docs/design/focus-mode.md).
export function appBreakdown(
  sessions: PomodoroSessionRecord[],
  topN = 8
): AppUsage[] {
  const totals = new Map<string, number>();
  for (const s of sessions) {
    for (const [exe, sec] of Object.entries(s.processBuckets)) {
      totals.set(exe, (totals.get(exe) ?? 0) + sec);
    }
  }
  return [...totals.entries()]
    .map(([exe, seconds]) => ({ exe, seconds }))
    .sort((a, b) => b.seconds - a.seconds)
    .slice(0, topN);
}

// All sessions that ended on the given app day (`YYYY-MM-DD`), ordered by
// start time. Keyed by `endedAt` to match the heatmap's per-day counts.
export function sessionsOnDate(
  sessions: PomodoroSessionRecord[],
  date: string
): PomodoroSessionRecord[] {
  return sessions
    .filter((s) => dayOf(s.endedAt) === date)
    .sort((a, b) => a.startedAt - b.startedAt);
}

export function buildHeatmapCells(
  sessions: PomodoroSessionRecord[],
  weeks: number,
  now: number = Date.now()
): HeatmapCell[] {
  const counts = countByDate(sessions);
  const todayKey = dayOf(now);
  const firstWeekStart = addDays(weekStartOf(todayKey), -(weeks - 1) * 7);

  const cells: HeatmapCell[] = [];
  for (let w = 0; w < weeks; w++) {
    for (let d = 0; d < 7; d++) {
      const key = addDays(firstWeekStart, w * 7 + d);
      const isFuture = key > todayKey;
      const count = isFuture ? 0 : counts.get(key) ?? 0;
      cells.push({ date: key, count, level: levelForCount(count) });
    }
  }
  return cells;
}

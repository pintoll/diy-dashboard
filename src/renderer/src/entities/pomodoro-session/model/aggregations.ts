import type { PomodoroSessionRecord } from "./pomodoro-session.types";

export type HeatmapLevel = 0 | 1 | 2 | 3 | 4;

export type HeatmapCell = {
  date: string;
  count: number;
  level: HeatmapLevel;
};

function toDateKey(timestamp: number): string {
  const d = new Date(timestamp);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfLocalDay(timestamp: number): number {
  const d = new Date(timestamp);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function daysBetween(earlier: number, later: number): number {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  return Math.round((startOfLocalDay(later) - startOfLocalDay(earlier)) / MS_PER_DAY);
}

function startOfIsoWeek(timestamp: number): number {
  const d = new Date(timestamp);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff);
  return d.getTime();
}

function countByDate(sessions: PomodoroSessionRecord[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const s of sessions) {
    const key = toDateKey(s.endedAt);
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
  const today = toDateKey(now);
  let n = 0;
  for (const s of sessions) {
    if (toDateKey(s.endedAt) === today) n++;
  }
  return n;
}

export function countThisWeek(
  sessions: PomodoroSessionRecord[],
  now: number = Date.now()
): number {
  const weekStart = startOfIsoWeek(now);
  let n = 0;
  for (const s of sessions) {
    if (s.endedAt >= weekStart) n++;
  }
  return n;
}

export function computeCurrentStreak(
  sessions: PomodoroSessionRecord[],
  now: number = Date.now()
): number {
  if (sessions.length === 0) return 0;

  const dateKeys = new Set<string>();
  for (const s of sessions) dateKeys.add(toDateKey(s.endedAt));

  const todayKey = toDateKey(now);
  const MS_PER_DAY = 24 * 60 * 60 * 1000;

  let cursor = startOfLocalDay(now);
  if (!dateKeys.has(todayKey)) {
    cursor -= MS_PER_DAY;
  }

  let streak = 0;
  while (dateKeys.has(toDateKey(cursor))) {
    streak++;
    cursor -= MS_PER_DAY;
  }
  return streak;
}

export function buildHeatmapCells(
  sessions: PomodoroSessionRecord[],
  weeks: number,
  now: number = Date.now()
): HeatmapCell[] {
  const counts = countByDate(sessions);
  const MS_PER_DAY = 24 * 60 * 60 * 1000;

  const currentWeekStart = startOfIsoWeek(now);
  const firstWeekStart = currentWeekStart - (weeks - 1) * 7 * MS_PER_DAY;
  const today = startOfLocalDay(now);

  const cells: HeatmapCell[] = [];
  for (let w = 0; w < weeks; w++) {
    for (let d = 0; d < 7; d++) {
      const cellTs = firstWeekStart + (w * 7 + d) * MS_PER_DAY;
      const key = toDateKey(cellTs);
      const isFuture = daysBetween(today, cellTs) > 0;
      const count = isFuture ? 0 : counts.get(key) ?? 0;
      cells.push({ date: key, count, level: levelForCount(count) });
    }
  }
  return cells;
}

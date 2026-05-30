import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import {
  useSessionLogStore,
  countToday,
  countThisWeek,
  computeCurrentStreak,
  buildHeatmapCells,
} from "@/src/entities/pomodoro-session";
import { Heatmap } from "@/src/entities/pomodoro-session/client";
import { StatTile } from "./StatTile";

const HEATMAP_WEEKS = 12;

export type PomodoroStatsConfig = Record<string, never>;

export function PomodoroStatsClient() {
  const sessions = useSessionLogStore((s) => s.sessions);

  const { today, week, streak, cells } = useMemo(() => {
    const now = Date.now();
    return {
      today: countToday(sessions, now),
      week: countThisWeek(sessions, now),
      streak: computeCurrentStreak(sessions, now),
      cells: buildHeatmapCells(sessions, HEATMAP_WEEKS, now),
    };
  }, [sessions]);

  return (
    <div className="flex flex-col h-full w-full gap-2 min-h-0">
      <div className="flex items-stretch divide-x divide-border shrink-0">
        <StatTile label="Today" value={today} accent="primary" />
        <StatTile label="This Week" value={week} accent="accent" />
        <StatTile
          label="Streak"
          value={streak > 0 ? `${streak}d` : "—"}
          accent="chart"
        />
      </div>
      <div className="flex-1 min-h-0">
        <Heatmap cells={cells} weeks={HEATMAP_WEEKS} />
      </div>
      <div className="flex justify-end shrink-0">
        <Link
          to="/focus-analytics"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          See more
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}

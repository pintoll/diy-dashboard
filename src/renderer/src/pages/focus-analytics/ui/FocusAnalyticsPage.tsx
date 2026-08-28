import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import {
  useSessionLogStore,
  weeklyActiveHours,
  lifetimeStats,
  computeCurrentStreak,
  intentOutcomeMatrix,
  timeOfDayPattern,
  appBreakdown,
} from "@/src/entities/pomodoro-session";
import {
  acquireProjects,
  acquireProjectTime,
  useProjectStore,
  useProjectTimeStore,
} from "@/src/entities/project";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/shared/ui/card";
import { dayStartMs } from "@shared/day";
import { useToday } from "@/src/shared/lib/use-today";
import { WeeklyHero } from "./WeeklyHero";
import { DailyTrendChart } from "./DailyTrendChart";
import { CelebrationStats } from "./CelebrationStats";
import { ContributionHeatmap } from "./ContributionHeatmap";
import { IntentOutcomeGrid } from "./IntentOutcomeGrid";
import { TimeOfDayChart } from "./TimeOfDayChart";
import { AppBreakdownList } from "./AppBreakdownList";
import { ProjectFocusList } from "./ProjectFocusList";
import { DayDrillDown } from "./DayDrillDown";
import { buildProjectFocusRows, unattributedSec } from "../lib/project-focus";

export function FocusAnalyticsPage() {
  const sessions = useSessionLogStore((s) => s.sessions);
  const updateSessionNote = useSessionLogStore((s) => s.updateSessionNote);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  // The day-bucketed stats (weekly, streak) only read `now` through dayOf, so
  // the day's start instant is an equivalent anchor that rolls them over at
  // 05:00; lifetime/matrix/hourly/apps don't bucket by day.
  const day = useToday();
  const dayAnchor = dayStartMs(day);

  const weekly = useMemo(
    () => weeklyActiveHours(sessions, dayAnchor),
    [sessions, dayAnchor]
  );
  const lifetime = useMemo(() => lifetimeStats(sessions), [sessions]);
  const streak = useMemo(
    () => computeCurrentStreak(sessions, dayAnchor),
    [sessions, dayAnchor]
  );
  const matrix = useMemo(() => intentOutcomeMatrix(sessions), [sessions]);
  const hourly = useMemo(() => timeOfDayPattern(sessions), [sessions]);
  const apps = useMemo(() => appBreakdown(sessions), [sessions]);

  // The project card is the page's only cross-database read: the bars come from
  // the todos.db ledger over IPC, the verdicts from the session log already in
  // memory. Two gated stores rather than one call, because both are ordinary
  // read-through caches on todos.db and both go idle when the page unmounts.
  useEffect(() => {
    const releaseProjects = acquireProjects();
    const releaseTime = acquireProjectTime();
    return () => {
      releaseTime();
      releaseProjects();
    };
  }, []);
  const projects = useProjectStore((s) => s.projects);
  const projectTime = useProjectTimeStore((s) => s.index);

  const projectRows = useMemo(
    () => buildProjectFocusRows(sessions, projectTime, projects),
    [sessions, projectTime, projects]
  );
  const deskless = useMemo(() => unattributedSec(sessions), [sessions]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-8">
        <header className="flex items-center gap-3">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Dashboard
          </Link>
        </header>

        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">Focus Analytics</h1>
          <p className="text-sm text-muted-foreground">
            Your focus and leisure hours, week over week.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Active hours</CardTitle>
            <CardDescription>
              This week vs last week, split by focus and leisure.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <WeeklyHero data={weekly} />
          </CardContent>
        </Card>

        <DailyTrendChart sessions={sessions} />

        <CelebrationStats stats={lifetime} streak={streak} />

        <ContributionHeatmap sessions={sessions} onCellClick={setSelectedDate} />

        <div className="mt-2 flex flex-col gap-1">
          <h2 className="text-lg font-semibold">Diagnosis</h2>
          <p className="text-sm text-muted-foreground">
            When and where focus slips — the honest half.
          </p>
        </div>

        <IntentOutcomeGrid matrix={matrix} />

        <TimeOfDayChart data={hourly} />

        <ProjectFocusList rows={projectRows} unattributedSec={deskless} />

        <AppBreakdownList apps={apps} />
      </div>

      <DayDrillDown
        date={selectedDate}
        sessions={sessions}
        onClose={() => setSelectedDate(null)}
        onSaveNote={updateSessionNote}
      />
    </div>
  );
}

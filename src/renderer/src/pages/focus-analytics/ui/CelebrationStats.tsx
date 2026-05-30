import type { LifetimeStats } from "@/src/entities/pomodoro-session";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/shared/ui/card";

type CelebrationStatsProps = {
  stats: LifetimeStats;
  streak: number;
};

function formatHours(value: number): string {
  return `${value.toFixed(1)}h`;
}

function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="text-2xl font-semibold tabular-nums leading-none">
        {value}
      </div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

export function CelebrationStats({ stats, streak }: CelebrationStatsProps) {
  const sessionLabel = stats.sessionCount === 1 ? "session" : "sessions";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Lifetime focus</CardTitle>
        <CardDescription>Everything you have logged so far.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            <div className="text-5xl font-semibold tabular-nums leading-none text-primary">
              {formatHours(stats.focusHours)}
            </div>
            <div className="text-sm text-muted-foreground">
              focused across {stats.sessionCount} {sessionLabel}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <StatBlock label="Overtime" value={formatHours(stats.overtimeHours)} />
            <StatBlock
              label="Streak"
              value={streak > 0 ? `${streak}d` : "—"}
            />
            <StatBlock label="Leisure" value={formatHours(stats.leisureHours)} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

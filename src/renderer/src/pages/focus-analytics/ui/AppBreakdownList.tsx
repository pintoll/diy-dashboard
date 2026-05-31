import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/shared/ui/card";
import type { AppUsage } from "@/src/entities/pomodoro-session";
import { formatSeconds } from "@/src/shared/lib/format-duration";

type Props = {
  apps: AppUsage[];
};

export function AppBreakdownList({ apps }: Props) {
  const max = apps.reduce((m, a) => Math.max(m, a.seconds), 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Apps</CardTitle>
        <CardDescription>
          Where foreground time went across all sessions. Blocked leisure sites
          leave little trace here.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {apps.length === 0 ? (
          <div className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            No active-window data captured yet.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {apps.map((app) => {
              const pct = max > 0 ? (app.seconds / max) * 100 : 0;
              return (
                <div key={app.exe} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate text-muted-foreground">{app.exe}</span>
                    <span className="tabular-nums">{formatSeconds(app.seconds)}</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-sm bg-muted/60">
                    <div
                      className="h-full rounded-sm bg-primary"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

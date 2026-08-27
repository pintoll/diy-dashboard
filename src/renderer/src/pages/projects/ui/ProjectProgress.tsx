import { Timer } from "lucide-react";
import { statsOf, useProjectStore } from "@/src/entities/project";
import { formatSeconds } from "@/src/shared/lib/format-duration";

// Progress and invested time, both free of any schema of their own: the counts
// come from the todos filed under the project and the time from the pomodoro
// attribution those todos already carry (docs/design/projects-para.md).
export function ProjectProgress({ projectId }: { projectId: string }) {
  const stats = useProjectStore((s) => statsOf(s.stats, projectId));
  const pct = stats.total === 0 ? 0 : Math.round((stats.done / stats.total) * 100);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {stats.total === 0
            ? "Nothing filed here yet"
            : `${stats.done} of ${stats.total} done`}
        </span>
        {stats.workedSec > 0 && (
          <span className="inline-flex items-center gap-1">
            <Timer className="size-3" />
            {formatSeconds(stats.workedSec)}
          </span>
        )}
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-[width]"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

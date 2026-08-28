import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/shared/ui/card";
import { formatSeconds } from "@/src/shared/lib/format-duration";
import type { ProjectFocusRow } from "../lib/project-focus";

type Props = {
  rows: ProjectFocusRow[];
  // Session time no row can claim: the desk was empty. Shown as a footnote so
  // the card never pretends its bars add up to everything that was logged.
  unattributedSec: number;
};

// A project that is no longer being pushed still owns its history, so it stays
// in the ranking with a tag rather than dropping out (the archive is a record
// worth reading - docs/design/projects-para.md).
const STATUS_TAG: Record<string, string> = {
  someday: "someday",
  done: "done",
  archived: "archived",
};

function AttentionLine({ row }: { row: ProjectFocusRow }) {
  // Banked time with no session behind it: work accrued under a pomodoro whose
  // log entry predates the desk union, or was never written. Also the guard
  // against dividing by a zero-length desk.
  if (row.deskSec === 0) {
    return <span className="text-muted-foreground">no session verdict</span>;
  }

  const pct = Math.round((row.focusSec / row.deskSec) * 100);
  return (
    <>
      <span className="text-muted-foreground">{pct}% of desk time focused</span>
      {row.collapseCount > 0 && (
        <>
          <span className="text-muted-foreground"> · </span>
          <span className="text-destructive">
            {row.collapseCount}{" "}
            {row.collapseCount === 1 ? "collapse" : "collapses"}
          </span>
        </>
      )}
    </>
  );
}

export function ProjectFocusList({ rows, unattributedSec }: Props) {
  const max = rows.reduce((m, row) => Math.max(m, row.seconds), 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Projects</CardTitle>
        <CardDescription>
          Wall-clock time each project spent on the desk, and how focused the
          sessions around it were. Two projects on the desk at once each keep the
          whole block, so these bars rank against each other rather than divide a
          total.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            No project time recorded yet. Put a todo on the desk and its project
            shows up here.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {rows.map((row) => {
              const pct = max > 0 ? (row.seconds / max) * 100 : 0;
              const tag =
                row.status === null ? null : (STATUS_TAG[row.status] ?? null);
              return (
                <div
                  key={row.projectId ?? "unfiled"}
                  className="flex flex-col gap-1"
                >
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span
                        className={`truncate ${
                          row.projectId === null
                            ? "italic text-muted-foreground"
                            : "text-foreground"
                        }`}
                      >
                        {row.title}
                      </span>
                      {tag !== null && (
                        <span className="shrink-0 rounded-sm bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                          {tag}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 tabular-nums">
                      {formatSeconds(row.seconds)}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-sm bg-muted/60">
                    <div
                      className="h-full rounded-sm bg-primary"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="text-xs">
                    <AttentionLine row={row} />
                  </div>
                </div>
              );
            })}
            {unattributedSec > 0 && (
              <p className="border-t border-border pt-3 text-xs text-muted-foreground">
                {formatSeconds(unattributedSec)} of session time had nothing on
                the desk, so no row claims it.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

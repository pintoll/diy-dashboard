import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/shared/ui/card";
import { formatSeconds } from "@/src/shared/lib/format-duration";
import type { ProjectFocusRow } from "../lib/project-focus";
import { EmptyState } from "./EmptyState";
import { MeterBar } from "./MeterBar";

type Props = {
  rows: ProjectFocusRow[];
  // The joined state of the two stores behind the rows, resolved by the page.
  // Rows are misfiled while either store is still loading (every todo falls to
  // "No project" until the index lands), so the card renders them only on
  // "ready" and never dresses a load or a failure up as "no time recorded".
  status: "loading" | "ready" | "error";
  error: string | null;
  // Session time no row can claim: the desk was empty. Shown as a footnote so
  // the card never pretends its bars add up to everything that was logged.
  unattributedSec: number;
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

export function ProjectFocusList({ rows, status, error, unattributedSec }: Props) {
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
        {status === "error" ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : status !== "ready" ? null : rows.length === 0 ? (
          <EmptyState>
            No project time recorded yet. Put a todo on the desk and its project
            shows up here.
          </EmptyState>
        ) : (
          <div className="flex flex-col gap-3">
            {rows.map((row) => {
              // A project that is no longer being pushed still owns its
              // history, so it stays in the ranking with its status as a tag
              // rather than dropping out (the archive is a record worth
              // reading - docs/design/projects-para.md).
              const tag =
                row.status !== null && row.status !== "active"
                  ? row.status
                  : null;
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
                  <MeterBar value={row.seconds} max={max} />
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

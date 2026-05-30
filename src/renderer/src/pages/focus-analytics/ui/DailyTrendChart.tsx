import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  dailyActiveHours,
  type DailyHours,
  type PomodoroSessionRecord,
} from "@/src/entities/pomodoro-session";
import { Button } from "@/src/shared/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/shared/ui/card";

type Props = {
  sessions: PomodoroSessionRecord[];
};

const FOCUS_COLOR = "var(--chart-1)";
const LEISURE_COLOR = "var(--chart-3)";
const WINDOW_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// Parse a local `YYYY-MM-DD` key into a local-midnight Date (avoids the UTC
// shift `new Date("2026-05-30")` would introduce).
function parseKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function shortWeekday(key: string): string {
  return WEEKDAYS[parseKey(key).getDay()];
}

function shortDate(key: string): string {
  const d = parseKey(key);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

function fullDate(key: string): string {
  const d = parseKey(key);
  return `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

type TooltipDatum = {
  date: string;
  focus: number;
  leisure: number;
  sessions: number;
};

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: TooltipDatum }>;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const total = d.focus + d.leisure;
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 text-xs shadow-md">
      <div className="mb-1.5 font-medium text-card-foreground">
        {fullDate(d.date)}
      </div>
      <div className="flex flex-col gap-1 text-muted-foreground">
        <Swatch color={FOCUS_COLOR} label={`Focus ${d.focus.toFixed(1)}h`} />
        <Swatch
          color={LEISURE_COLOR}
          label={`Leisure ${d.leisure.toFixed(1)}h`}
        />
      </div>
      <div className="mt-1.5 border-t border-border pt-1.5 text-muted-foreground">
        {total.toFixed(1)}h total · {d.sessions}{" "}
        {d.sessions === 1 ? "session" : "sessions"}
      </div>
    </div>
  );
}

function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="inline-block h-2.5 w-2.5 rounded-sm"
        style={{ background: color }}
      />
      {label}
    </span>
  );
}

export function DailyTrendChart({ sessions }: Props) {
  // Capture "today" once so arrow math stays stable across renders.
  const [todayTs] = useState(() => startOfDay(Date.now()));
  // Days the window end is shifted back from today. 0 = window ends today.
  const [offset, setOffset] = useState(0);

  const endTs = todayTs - offset * MS_PER_DAY;
  const window = useMemo<DailyHours[]>(
    () => dailyActiveHours(sessions, WINDOW_DAYS, endTs),
    [sessions, endTs]
  );

  // Stop the left arrow once the window's newest day predates all history.
  const maxOffset = useMemo(() => {
    let earliest = Infinity;
    for (const s of sessions) if (s.endedAt < earliest) earliest = s.endedAt;
    if (earliest === Infinity) return 0;
    return Math.max(0, Math.round((todayTs - startOfDay(earliest)) / MS_PER_DAY));
  }, [sessions, todayTs]);

  const chartData = window.map((d) => ({
    date: d.date,
    focus: d.focusHours,
    leisure: d.leisureHours,
    sessions: d.sessionCount,
  }));

  const rangeLabel =
    window.length > 0
      ? `${shortDate(window[0].date)} – ${shortDate(window[window.length - 1].date)}`
      : "";

  const hasSessions = sessions.length > 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1.5">
            <CardTitle>Daily trend</CardTitle>
            <CardDescription>
              Focus and leisure hours, one day at a time.
            </CardDescription>
          </div>
          <div className="flex items-center gap-1">
            <span className="mr-1 text-xs tabular-nums text-muted-foreground">
              {rangeLabel}
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Previous days"
              disabled={offset >= maxOffset}
              onClick={() => setOffset((o) => Math.min(maxOffset, o + 1))}
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Next days"
              disabled={offset === 0}
              onClick={() => setOffset((o) => Math.max(0, o - 1))}
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {!hasSessions ? (
          <div className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            No sessions logged yet.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
                  barCategoryGap="25%"
                >
                  <CartesianGrid
                    vertical={false}
                    stroke="var(--border)"
                    strokeDasharray="3 3"
                  />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                    tickFormatter={shortWeekday}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={40}
                    tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                    tickFormatter={(v: number) => `${v}h`}
                  />
                  <Tooltip
                    cursor={{ fill: "var(--muted)", opacity: 0.4 }}
                    content={<ChartTooltip />}
                  />
                  <Bar
                    dataKey="focus"
                    name="Focus"
                    stackId="hours"
                    fill={FOCUS_COLOR}
                  />
                  <Bar
                    dataKey="leisure"
                    name="Leisure"
                    stackId="hours"
                    fill={LEISURE_COLOR}
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <Swatch color={FOCUS_COLOR} label="Focus" />
              <Swatch color={LEISURE_COLOR} label="Leisure" />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

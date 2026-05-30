import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/shared/ui/card";
import type { HourBucket } from "@/src/entities/pomodoro-session";

type Props = {
  data: HourBucket[];
};

const FOCUS_COLOR = "var(--chart-1)";
const LEISURE_COLOR = "var(--chart-3)";
const COLLAPSE_COLOR = "var(--destructive)";

export function TimeOfDayChart({ data }: Props) {
  const total = data.reduce(
    (sum, b) => sum + b.focusCount + b.leisureCount,
    0
  );

  // collapse (intended focus, ended leisure) is a subset of leisure; split it
  // out so the stack still sums to the session count while highlighting it.
  const chartData = data.map((b) => ({
    hour: b.hour,
    focus: b.focusCount,
    leisure: Math.max(0, b.leisureCount - b.collapseCount),
    collapse: b.collapseCount,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Time of day</CardTitle>
        <CardDescription>
          When your sessions land, and when focus tends to slip.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
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
                >
                  <CartesianGrid
                    vertical={false}
                    stroke="var(--border)"
                    strokeDasharray="3 3"
                  />
                  <XAxis
                    dataKey="hour"
                    tickLine={false}
                    axisLine={false}
                    interval={1}
                    tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                    tickFormatter={(h: number) => String(h).padStart(2, "0")}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={28}
                    allowDecimals={false}
                    tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                  />
                  <Tooltip
                    cursor={{ fill: "var(--muted)", opacity: 0.4 }}
                    contentStyle={{
                      background: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                    }}
                    labelFormatter={(h) => `${String(h).padStart(2, "0")}:00`}
                  />
                  <Bar dataKey="focus" name="Focus" stackId="s" fill={FOCUS_COLOR} />
                  <Bar dataKey="leisure" name="Leisure" stackId="s" fill={LEISURE_COLOR} />
                  <Bar
                    dataKey="collapse"
                    name="Collapse"
                    stackId="s"
                    fill={COLLAPSE_COLOR}
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              <Legend color={FOCUS_COLOR} label="Focus" />
              <Legend color={LEISURE_COLOR} label="Leisure" />
              <Legend color={COLLAPSE_COLOR} label="Collapse" />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
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

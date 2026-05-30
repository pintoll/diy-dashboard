import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { WeeklyHoursComparison } from "@/src/entities/pomodoro-session";

type WeeklyHeroProps = {
  data: WeeklyHoursComparison;
};

const FOCUS_COLOR = "var(--chart-1)";
const LEISURE_COLOR = "var(--chart-3)";

function formatHours(value: number): string {
  return `${value.toFixed(1)}h`;
}

export function WeeklyHero({ data }: WeeklyHeroProps) {
  const { thisWeek, lastWeek } = data;

  const chartData = [
    ...(lastWeek
      ? [
          {
            name: "Last Week",
            focus: lastWeek.focusHours,
            leisure: lastWeek.leisureHours,
          },
        ]
      : []),
    {
      name: "This Week",
      focus: thisWeek.focusHours,
      leisure: thisWeek.leisureHours,
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
            barCategoryGap="30%"
          >
            <CartesianGrid
              vertical={false}
              stroke="var(--border)"
              strokeDasharray="3 3"
            />
            <XAxis
              dataKey="name"
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
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
              contentStyle={{
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                color: "var(--card-foreground)",
              }}
              formatter={(value, name) => [formatHours(Number(value)), name]}
            />
            <Bar
              dataKey="focus"
              name="Focus"
              stackId="hours"
              fill={FOCUS_COLOR}
              radius={[0, 0, 0, 0]}
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
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ background: FOCUS_COLOR }}
          />
          Focus
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ background: LEISURE_COLOR }}
          />
          Leisure
        </span>
        {!lastWeek && (
          <span className="ml-auto">No comparison data yet</span>
        )}
      </div>
    </div>
  );
}

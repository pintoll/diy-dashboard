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
  FLOW_COLOR,
  formatYmLabel,
  formatYmShort,
  TREND_MONTHS,
  type MonthlySummary,
} from "@/src/entities/finance-ledger";
import { formatKrw, formatKrwCompact } from "@/src/shared/lib/format-currency";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/shared/ui/card";

type Props = {
  trend: MonthlySummary[];
};

// Income stands beside total outflow rather than being stacked with it, because
// the reading you want is "was the bar on the left taller than the bar on the
// right". Left over is the gap between them, and a shortfall shows as an
// outflow bar that overtops income instead of as a negative stack segment.
export function FlowTrendChart({ trend }: Props) {
  const hasData = trend.some((m) => m.income > 0 || m.totalOut > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Month over month</CardTitle>
        <CardDescription>
          Income against what left your accounts, last {TREND_MONTHS} months.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <div className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            No transactions in this window yet.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={trend}
                  margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
                  barCategoryGap="25%"
                  barGap={2}
                >
                  <CartesianGrid
                    vertical={false}
                    stroke="var(--border)"
                    strokeDasharray="3 3"
                  />
                  <XAxis
                    dataKey="ym"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                    tickFormatter={formatYmShort}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={56}
                    tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                    tickFormatter={formatKrwCompact}
                  />
                  <Tooltip
                    cursor={{ fill: "var(--muted)", opacity: 0.4 }}
                    content={<ChartTooltip />}
                  />
                  <Bar
                    dataKey="income"
                    name="Income"
                    fill={FLOW_COLOR.income}
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="spending"
                    name="Spending"
                    stackId="out"
                    fill={FLOW_COLOR.spending}
                  />
                  <Bar
                    dataKey="intoAssets"
                    name="Into Assets"
                    stackId="out"
                    fill={FLOW_COLOR.intoAssets}
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              <Swatch color={FLOW_COLOR.income} label="Income" />
              <Swatch color={FLOW_COLOR.spending} label="Spending" />
              <Swatch color={FLOW_COLOR.intoAssets} label="Into Assets" />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        aria-hidden
        className="inline-block h-2.5 w-2.5 rounded-[2px]"
        style={{ background: color }}
      />
      {label}
    </span>
  );
}

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: MonthlySummary }>;
}) {
  if (!active || !payload?.length) return null;
  const month = payload[0].payload;

  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 text-xs shadow-md">
      <div className="mb-1.5 font-medium text-card-foreground">
        {formatYmLabel(month.ym)}
      </div>
      <div className="flex flex-col gap-1 text-muted-foreground">
        <Row color={FLOW_COLOR.income} label="Income" value={month.income} />
        <Row color={FLOW_COLOR.spending} label="Spending" value={month.spending} />
        <Row
          color={FLOW_COLOR.intoAssets}
          label="Into Assets"
          value={month.intoAssets}
        />
      </div>
      <div className="mt-1.5 flex justify-between gap-4 border-t border-border pt-1.5 text-muted-foreground">
        <span>{month.leftOver < 0 ? "Overspent" : "Left over"}</span>
        <span className="tabular-nums">{formatKrw(Math.abs(month.leftOver))}</span>
      </div>
    </div>
  );
}

function Row({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: number;
}) {
  return (
    <span className="flex items-center justify-between gap-4">
      <span className="flex items-center gap-1.5">
        <span
          aria-hidden
          className="inline-block h-2.5 w-2.5 rounded-[2px]"
          style={{ background: color }}
        />
        {label}
      </span>
      <span className="tabular-nums">{formatKrw(value)}</span>
    </span>
  );
}

import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import {
  ACCOUNT_KIND_COLOR,
  ACCOUNT_KIND_LABEL,
  orderedAssets,
  type Overview,
} from "@/src/entities/finance-ledger";
import { formatKrw } from "@/src/shared/lib/format-currency";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/shared/ui/card";

type Props = {
  overview: Overview;
};

export function NetWorthCard({ overview }: Props) {
  const slices = orderedAssets(overview.assets);
  const assetTotal = slices.reduce((sum, slice) => sum + slice.total, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Net worth</CardTitle>
        <CardDescription>
          Everything you own, less everything you owe.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {assetTotal === 0 && overview.liabilities === 0 ? (
          <div className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            Add an opening balance to an account to get started.
          </div>
        ) : (
          <div className="flex flex-col items-center gap-6 sm:flex-row">
            <div className="relative h-44 w-44 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={slices}
                    dataKey="total"
                    nameKey="kind"
                    innerRadius={58}
                    outerRadius={86}
                    startAngle={90}
                    endAngle={-270}
                    // A 2px surface ring is the spacer between adjacent fills.
                    stroke="var(--card)"
                    strokeWidth={2}
                    isAnimationActive={false}
                  >
                    {slices.map((slice) => (
                      <Cell
                        key={slice.kind}
                        fill={ACCOUNT_KIND_COLOR[slice.kind]}
                      />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Net worth
                </span>
                <span className="text-lg font-semibold tabular-nums">
                  {formatKrw(overview.netWorth)}
                </span>
              </div>
            </div>

            <div className="flex w-full flex-col gap-2">
              {slices.map((slice) => (
                <LegendRow
                  key={slice.kind}
                  color={ACCOUNT_KIND_COLOR[slice.kind]}
                  label={ACCOUNT_KIND_LABEL[slice.kind]}
                  value={formatKrw(slice.total)}
                  share={assetTotal > 0 ? slice.total / assetTotal : 0}
                />
              ))}

              {overview.liabilities > 0 && (
                <div className="mt-1 flex items-center justify-between gap-3 border-t border-border pt-2 text-sm">
                  <span className="text-muted-foreground">Debt</span>
                  <span className="tabular-nums text-destructive">
                    -{formatKrw(overview.liabilities)}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LegendRow({
  color,
  label,
  value,
  share,
}: {
  color: string;
  label: string;
  value: string;
  share: number;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="flex items-center gap-2 text-muted-foreground">
        <span
          aria-hidden
          className="inline-block h-2.5 w-2.5 shrink-0 rounded-[2px]"
          style={{ background: color }}
        />
        {label}
      </span>
      <span className="flex items-baseline gap-2">
        <span className="text-xs tabular-nums text-muted-foreground">
          {`${Math.round(share * 100)}%`}
        </span>
        <span className="tabular-nums">{value}</span>
      </span>
    </div>
  );
}

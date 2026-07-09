import { formatKrw } from "@/src/shared/lib/format-currency";
import { cn } from "@/src/shared/lib/utils";
import {
  ACCOUNT_KIND_COLOR,
  ACCOUNT_KIND_LABEL,
  orderedAssets,
} from "../model/account-kind";
import type { AssetSlice } from "../model/finance-ledger.types";

type Props = {
  assets: AssetSlice[];
  compact?: boolean;
};

// A 100% stacked bar rather than a donut: at widget size the bar stays legible
// where slice angles would not.
export function AssetDistributionBar({ assets, compact = false }: Props) {
  const slices = orderedAssets(assets);
  const total = slices.reduce((sum, slice) => sum + slice.total, 0);

  if (total === 0) {
    return (
      <div className="flex flex-col gap-2">
        <div className="h-2.5 w-full rounded-[4px] border border-dashed border-border" />
        <p className={cn("text-muted-foreground", compact ? "text-[10px]" : "text-xs")}>
          No assets recorded yet.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div
        className={cn("flex w-full gap-[2px]", compact ? "h-2" : "h-2.5")}
        role="img"
        aria-label={slices
          .map((s) => `${ACCOUNT_KIND_LABEL[s.kind]} ${formatKrw(s.total)}`)
          .join(", ")}
      >
        {slices.map((slice) => (
          <div
            key={slice.kind}
            title={`${ACCOUNT_KIND_LABEL[slice.kind]}: ${formatKrw(slice.total)}`}
            className="h-full first:rounded-l-[4px] last:rounded-r-[4px]"
            style={{
              width: `${(slice.total / total) * 100}%`,
              background: ACCOUNT_KIND_COLOR[slice.kind],
            }}
          />
        ))}
      </div>

      <div className={cn("flex flex-wrap gap-x-4 gap-y-1", compact ? "text-[11px]" : "text-xs")}>
        {slices.map((slice) => (
          <span key={slice.kind} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block h-2 w-2 shrink-0 rounded-[2px]"
              style={{ background: ACCOUNT_KIND_COLOR[slice.kind] }}
            />
            <span className="text-muted-foreground">
              {ACCOUNT_KIND_LABEL[slice.kind]}
            </span>
            <span className="tabular-nums text-foreground">
              {formatKrw(slice.total)}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

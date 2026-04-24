import { cn } from "@/src/shared/lib/utils";
import { RANGE_KEYS, RANGE_LABEL } from "../model/range";
import type { RangeKey } from "../model/economic-calendar.types";

type Props = {
  value: RangeKey;
  onChange: (rangeKey: RangeKey) => void;
};

export function RangeSelector({ value, onChange }: Props) {
  return (
    <div className="flex items-center gap-0.5">
      {RANGE_KEYS.map((key) => {
        const isActive = key === value;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className={cn(
              "px-1.5 py-0.5 rounded text-[10px] font-medium tabular-nums transition-colors",
              isActive
                ? "bg-muted text-foreground"
                : "text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted/40"
            )}
          >
            {RANGE_LABEL[key]}
          </button>
        );
      })}
    </div>
  );
}

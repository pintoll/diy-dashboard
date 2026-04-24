import { cn } from "@/src/shared/lib/utils";
import type { TypeFilter as TypeFilterValue } from "../model/economic-calendar.types";

type Option = {
  value: TypeFilterValue;
  label: string;
  disabled?: boolean;
  tooltip?: string;
};

const OPTIONS: readonly Option[] = [
  { value: "all", label: "All" },
  { value: "macro", label: "Macro" },
  {
    value: "earning",
    label: "Earnings",
    disabled: true,
    tooltip: "Phase 2",
  },
  {
    value: "filing",
    label: "Filings",
    disabled: true,
    tooltip: "Phase 3",
  },
];

type Props = {
  value: TypeFilterValue;
  onChange: (value: TypeFilterValue) => void;
};

export function TypeFilter({ value, onChange }: Props) {
  return (
    <div className="flex items-center gap-0.5">
      {OPTIONS.map((opt) => {
        const isActive = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            disabled={opt.disabled}
            onClick={() => !opt.disabled && onChange(opt.value)}
            title={opt.tooltip}
            className={cn(
              "px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors",
              opt.disabled
                ? "text-muted-foreground/30 cursor-not-allowed"
                : isActive
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted/40"
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

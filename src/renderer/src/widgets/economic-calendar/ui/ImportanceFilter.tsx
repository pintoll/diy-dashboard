import { cn } from "@/src/shared/lib/utils";
import type {
  MinImportanceFilter,
} from "../model/economic-calendar.types";

type Option = { value: MinImportanceFilter; label: string; hint: string };

const OPTIONS: readonly Option[] = [
  { value: 1, label: "★", hint: "Low and above" },
  { value: 2, label: "★★", hint: "Medium and above" },
  { value: 3, label: "★★★", hint: "High only" },
];

type Props = {
  value: MinImportanceFilter;
  onChange: (value: MinImportanceFilter) => void;
};

export function ImportanceFilter({ value, onChange }: Props) {
  return (
    <div className="flex items-center gap-0.5">
      {OPTIONS.map((opt) => {
        const isActive = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            title={opt.hint}
            className={cn(
              "px-1.5 py-0.5 rounded text-[10px] font-medium tabular-nums transition-colors",
              isActive
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

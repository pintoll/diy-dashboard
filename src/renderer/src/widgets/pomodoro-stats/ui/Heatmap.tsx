import type { HeatmapCell, HeatmapLevel } from "@/src/entities/pomodoro-session";

type HeatmapProps = {
  cells: HeatmapCell[];
  weeks: number;
};

const LEVEL_CLASS: Record<HeatmapLevel, string> = {
  0: "bg-muted/60",
  1: "bg-primary/25",
  2: "bg-primary/50",
  3: "bg-primary/75",
  4: "bg-primary",
};

const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"] as const;

export function Heatmap({ cells, weeks }: HeatmapProps) {
  return (
    <div className="flex gap-1.5 h-full w-full min-h-0">
      <div
        className="grid gap-[3px] text-[9px] leading-none text-muted-foreground shrink-0"
        style={{ gridTemplateRows: "repeat(7, minmax(0, 1fr))" }}
      >
        {DAY_LABELS.map((label, idx) => (
          <div key={idx} className="flex items-center justify-end pr-0.5">
            {label}
          </div>
        ))}
      </div>
      <div
        className="grid gap-[3px] flex-1 min-w-0 h-full"
        style={{
          gridTemplateColumns: `repeat(${weeks}, minmax(0, 1fr))`,
          gridTemplateRows: "repeat(7, minmax(0, 1fr))",
          gridAutoFlow: "column",
        }}
      >
        {cells.map((cell) => (
          <div
            key={cell.date}
            title={`${cell.date}: ${cell.count}`}
            className={`rounded-[2px] ${LEVEL_CLASS[cell.level]}`}
          />
        ))}
      </div>
    </div>
  );
}

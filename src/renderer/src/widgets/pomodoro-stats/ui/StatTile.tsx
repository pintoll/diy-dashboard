type StatTileProps = {
  label: string;
  value: string | number;
  accent?: "primary" | "accent" | "chart";
};

const ACCENT_CLASS = {
  primary: "text-primary",
  accent: "text-accent",
  chart: "text-chart-3",
} as const;

export function StatTile({ label, value, accent = "primary" }: StatTileProps) {
  return (
    <div className="flex flex-col items-center justify-center flex-1 min-w-0 px-2">
      <div className={`text-xl font-bold tabular-nums leading-tight ${ACCENT_CLASS[accent]}`}>
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground mt-0.5">
        {label}
      </div>
    </div>
  );
}

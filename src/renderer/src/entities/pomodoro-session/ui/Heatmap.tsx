import type { HeatmapCell, HeatmapLevel } from "../model/aggregations";

type HeatmapProps = {
  cells: HeatmapCell[];
  weeks: number;
  /** When set, cells become fixed `cellSizePx` squares and the grid scrolls
   *  horizontally on overflow. When unset, the grid fills its container fluidly. */
  cellSizePx?: number;
  /** Render a month-label row above the grid, aligned to week columns.
   *  Only meaningful in fixed mode (requires `cellSizePx`). */
  showMonthLabels?: boolean;
  /** When set, days with at least one session become clickable (drill-down).
   *  Empty/future cells stay inert. */
  onCellClick?: (date: string) => void;
};

const LEVEL_CLASS: Record<HeatmapLevel, string> = {
  0: "bg-muted/60",
  1: "bg-primary/25",
  2: "bg-primary/50",
  3: "bg-primary/75",
  4: "bg-primary",
};

const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"] as const;

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

const DAY_LABEL_COL_PX = 16;

// One entry per week column whose Monday starts a new month.
function monthStarts(cells: HeatmapCell[], weeks: number): { col: number; label: string }[] {
  const out: { col: number; label: string }[] = [];
  let prevMonth = -1;
  for (let w = 0; w < weeks; w++) {
    const monday = cells[w * 7];
    if (!monday) continue;
    const month = Number(monday.date.slice(5, 7)); // 1-12
    if (month !== prevMonth) {
      out.push({ col: w, label: MONTH_LABELS[month - 1] });
      prevMonth = month;
    }
  }
  return out;
}

function CellSquare({
  cell,
  onCellClick,
}: {
  cell: HeatmapCell;
  onCellClick?: (date: string) => void;
}) {
  const className = `rounded-[2px] ${LEVEL_CLASS[cell.level]}`;
  const title = `${cell.date}: ${cell.count}`;
  if (onCellClick && cell.count > 0) {
    return (
      <button
        type="button"
        title={title}
        onClick={() => onCellClick(cell.date)}
        className={`${className} cursor-pointer transition-transform hover:ring-1 hover:ring-ring focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none`}
      />
    );
  }
  return <div title={title} className={className} />;
}

export function Heatmap({
  cells,
  weeks,
  cellSizePx,
  showMonthLabels,
  onCellClick,
}: HeatmapProps) {
  if (cellSizePx) {
    const columns = `repeat(${weeks}, ${cellSizePx}px)`;
    return (
      <div className="w-full overflow-x-auto">
        <div className="flex flex-col gap-1.5 w-max">
          {showMonthLabels && (
            <div className="flex gap-1.5">
              <div style={{ width: DAY_LABEL_COL_PX }} className="shrink-0" />
              <div
                className="grid text-[9px] leading-none text-muted-foreground"
                style={{ gridTemplateColumns: columns, columnGap: 3 }}
              >
                {monthStarts(cells, weeks).map(({ col, label }) => (
                  <div
                    key={col}
                    style={{ gridColumnStart: col + 1, width: 0 }}
                    className="overflow-visible whitespace-nowrap"
                  >
                    {label}
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-1.5">
            <div
              className="grid gap-[3px] text-[9px] leading-none text-muted-foreground shrink-0"
              style={{
                width: DAY_LABEL_COL_PX,
                gridTemplateRows: `repeat(7, ${cellSizePx}px)`,
              }}
            >
              {DAY_LABELS.map((label, idx) => (
                <div key={idx} className="flex items-center justify-end pr-0.5">
                  {label}
                </div>
              ))}
            </div>
            <div
              className="grid gap-[3px]"
              style={{
                gridTemplateColumns: columns,
                gridTemplateRows: `repeat(7, ${cellSizePx}px)`,
                gridAutoFlow: "column",
              }}
            >
              {cells.map((cell) => (
                <CellSquare
                  key={cell.date}
                  cell={cell}
                  onCellClick={onCellClick}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

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
          <CellSquare key={cell.date} cell={cell} onCellClick={onCellClick} />
        ))}
      </div>
    </div>
  );
}

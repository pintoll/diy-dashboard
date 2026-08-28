/**
 * The ranked lists' bar: a track filled relative to the list's max, so bars
 * compare against each other rather than divide a whole.
 */
export function MeterBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-sm bg-muted/60">
      <div className="h-full rounded-sm bg-primary" style={{ width: `${pct}%` }} />
    </div>
  );
}

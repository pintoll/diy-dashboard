import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/shared/ui/card";
import type {
  IntentOutcomeCell,
  IntentOutcomeMatrix,
} from "@/src/entities/pomodoro-session";
import { formatHours } from "@/src/shared/lib/format-duration";

type Props = {
  matrix: IntentOutcomeMatrix;
};

type CellSpec = {
  key: keyof Omit<IntentOutcomeMatrix, "excludedNullIntent">;
  label: string;
  hint: string;
  emphasize?: boolean;
};

// Row-major: intent focus (top), intent leisure (bottom); outcome focus (left),
// outcome leisure (right).
const CELLS: CellSpec[] = [
  { key: "heldLine", label: "Held the line", hint: "meant to focus, focused" },
  { key: "collapse", label: "Collapse", hint: "meant to focus, drifted", emphasize: true },
  { key: "bonus", label: "Bonus", hint: "meant to rest, worked" },
  { key: "honestRest", label: "Honest rest", hint: "meant to rest, rested" },
];

export function IntentOutcomeGrid({ matrix }: Props) {
  const total =
    matrix.heldLine.count +
    matrix.collapse.count +
    matrix.bonus.count +
    matrix.honestRest.count;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Intent vs. outcome</CardTitle>
        <CardDescription>
          What you set out to do, against how it actually went.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <div className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            Declare focus or leisure at session start to unlock this.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-2">
              {CELLS.map((spec) => (
                <Cell key={spec.key} spec={spec} cell={matrix[spec.key]} />
              ))}
            </div>
            {matrix.excludedNullIntent > 0 && (
              <p className="text-xs text-muted-foreground">
                {matrix.excludedNullIntent} earlier{" "}
                {matrix.excludedNullIntent === 1 ? "session" : "sessions"} had no
                declared intent and are excluded.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Cell({ spec, cell }: { spec: CellSpec; cell: IntentOutcomeCell }) {
  const base =
    "flex flex-col gap-0.5 rounded-md border p-3 transition-colors";
  const tone = spec.emphasize
    ? "border-destructive/40 bg-destructive/5"
    : "border-border bg-muted/30";
  const valueColor = spec.emphasize ? "text-destructive" : "";
  return (
    <div className={`${base} ${tone}`}>
      <div className={`text-2xl font-semibold tabular-nums leading-none ${valueColor}`}>
        {cell.count}
      </div>
      <div className="text-sm font-medium">{spec.label}</div>
      <div className="text-xs text-muted-foreground">{spec.hint}</div>
      <div className="mt-1 text-xs tabular-nums text-muted-foreground">
        {formatHours(cell.hours)}
      </div>
    </div>
  );
}

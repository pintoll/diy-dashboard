import { useMemo } from "react";
import {
  buildHeatmapCells,
  type PomodoroSessionRecord,
} from "@/src/entities/pomodoro-session";
import { Heatmap } from "@/src/entities/pomodoro-session/client";
import { dayStartMs } from "@shared/day";
import { useToday } from "@/src/shared/lib/use-today";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/shared/ui/card";

type ContributionHeatmapProps = {
  sessions: PomodoroSessionRecord[];
  onCellClick?: (date: string) => void;
};

const YEAR_WEEKS = 52;
const CELL_SIZE_PX = 11;

export function ContributionHeatmap({
  sessions,
  onCellClick,
}: ContributionHeatmapProps) {
  // buildHeatmapCells only reads `now` through dayOf, so the day's start
  // instant is an equivalent anchor that rolls the grid's today edge over
  // at 05:00.
  const day = useToday();
  const cells = useMemo(
    () => buildHeatmapCells(sessions, YEAR_WEEKS, dayStartMs(day)),
    [sessions, day]
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity</CardTitle>
        <CardDescription>Sessions per day over the past year.</CardDescription>
      </CardHeader>
      <CardContent>
        <Heatmap
          cells={cells}
          weeks={YEAR_WEEKS}
          cellSizePx={CELL_SIZE_PX}
          showMonthLabels
          onCellClick={onCellClick}
        />
      </CardContent>
    </Card>
  );
}

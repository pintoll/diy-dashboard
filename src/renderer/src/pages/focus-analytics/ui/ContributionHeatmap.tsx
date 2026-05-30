import { useMemo } from "react";
import {
  buildHeatmapCells,
  type PomodoroSessionRecord,
} from "@/src/entities/pomodoro-session";
import { Heatmap } from "@/src/entities/pomodoro-session/client";
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
  const cells = useMemo(
    () => buildHeatmapCells(sessions, YEAR_WEEKS),
    [sessions]
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

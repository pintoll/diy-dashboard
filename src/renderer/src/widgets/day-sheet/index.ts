import { NotebookPen } from "lucide-react";
import { defineWidget } from "@/src/widgets/widget-registry";
import { DaySheetClient, type DaySheetConfig } from "./ui/DaySheetClient";

export type { DaySheetConfig };

export const daySheetWidget = defineWidget<DaySheetConfig>({
  meta: {
    id: "day-sheet",
    name: "Day Sheet",
    description: "Today's plan on one sheet: todos penciled onto clock times",
    category: "productivity",
    icon: NotebookPen,
    size: {
      minW: 3,
      minH: 3,
      maxW: 5,
      // Taller cap than todo-today: a fully planned day is naturally tall.
      maxH: 8,
      defaultW: 3,
      defaultH: 4,
    },
  },
  defaultConfig: {},
  ClientComponent: DaySheetClient,
});

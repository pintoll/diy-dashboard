import { Calendar } from "lucide-react";
import { defineWidget } from "@/src/widgets/widget-registry";
import type { EconomicCalendarConfig } from "./model/economic-calendar.types";
import { EconomicCalendarClient } from "./ui/EconomicCalendarClient";

export type { EconomicCalendarConfig } from "./model/economic-calendar.types";

export const economicCalendarWidget = defineWidget<EconomicCalendarConfig>({
  meta: {
    id: "economic-calendar",
    name: "Economic Calendar",
    description: "Macro events — CPI, FOMC, GDP releases with estimates and actuals",
    category: "data",
    icon: Calendar,
    size: {
      minW: 4,
      minH: 3,
      maxW: 12,
      maxH: 8,
      defaultW: 6,
      defaultH: 5,
    },
  },
  defaultConfig: {},
  ClientComponent: EconomicCalendarClient,
});

import { LineChart } from "lucide-react";
import { defineWidget } from "@/src/widgets/widget-registry";
import type { MacroIndicatorsConfig } from "./model/macro-indicators.types";
import { MacroIndicatorsClient } from "./ui/MacroIndicatorsClient";

export type { MacroIndicatorsConfig } from "./model/macro-indicators.types";

export const macroIndicatorsWidget = defineWidget<MacroIndicatorsConfig>({
  meta: {
    id: "macro-indicators",
    name: "Macro Indicators",
    description: "FRED 매크로 지표 — 금리, 환율, 변동성을 한눈에",
    category: "data",
    icon: LineChart,
    size: {
      minW: 3,
      minH: 3,
      maxW: 12,
      maxH: 6,
      defaultW: 6,
      defaultH: 4,
    },
  },
  defaultConfig: {},
  ClientComponent: MacroIndicatorsClient,
});

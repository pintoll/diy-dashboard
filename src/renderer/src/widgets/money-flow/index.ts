import { Wallet } from "lucide-react";
import { defineWidget } from "@/src/widgets/widget-registry";
import { MoneyFlowClient, type MoneyFlowConfig } from "./ui/MoneyFlowClient";

export type { MoneyFlowConfig };

export const moneyFlowWidget = defineWidget<MoneyFlowConfig>({
  meta: {
    id: "money-flow",
    name: "Money Flow",
    description: "Net worth, asset mix, and where this month's money went",
    category: "data",
    icon: Wallet,
    size: {
      minW: 3,
      minH: 3,
      maxW: 6,
      maxH: 5,
      defaultW: 4,
      defaultH: 3,
    },
  },
  defaultConfig: {},
  ClientComponent: MoneyFlowClient,
});

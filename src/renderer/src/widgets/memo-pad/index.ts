import { StickyNote } from "lucide-react";
import { defineWidget } from "@/src/widgets/widget-registry";
import { MemoPadClient, type MemoPadConfig } from "./ui/MemoPadClient";

export type { MemoPadConfig };

export const memoPadWidget = defineWidget<MemoPadConfig>({
  meta: {
    id: "memo-pad",
    name: "Memo",
    description:
      "A scratch memo that survives restarts, with 100 steps of undo and one-click snapshots",
    category: "utility",
    icon: StickyNote,
    size: {
      minW: 3,
      minH: 3,
      maxW: 8,
      maxH: 8,
      defaultW: 4,
      defaultH: 4,
    },
  },
  defaultConfig: {},
  ClientComponent: MemoPadClient,
});

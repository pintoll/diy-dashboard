import { Square, RectangleHorizontal, RectangleVertical, Maximize } from "lucide-react";
import { defineWidget } from "@/src/widgets/widget-registry";
import { TestWidgetClient } from "./ui/TestWidgetClient";

// Small Square: 2x2 (min 2x2, max 3x3)
export const testSmallWidget = defineWidget({
  meta: {
    id: "test-small",
    name: "Small (2x2)",
    description: "Small square widget for testing",
    category: "utility",
    icon: Square,
    size: {
      minW: 2,
      minH: 2,
      maxW: 3,
      maxH: 3,
      defaultW: 2,
      defaultH: 2,
    },
  },
  defaultConfig: {
    label: "Small 2×2",
    color: "#6366f1", // indigo
  },
  ClientComponent: TestWidgetClient,
});

// Wide: 6x2 (min 4x2, max 12x3)
export const testWideWidget = defineWidget({
  meta: {
    id: "test-wide",
    name: "Wide (6x2)",
    description: "Wide horizontal widget for testing",
    category: "utility",
    icon: RectangleHorizontal,
    size: {
      minW: 4,
      minH: 2,
      maxW: 12,
      maxH: 3,
      defaultW: 6,
      defaultH: 2,
    },
  },
  defaultConfig: {
    label: "Wide 6×2",
    color: "#0891b2", // cyan
  },
  ClientComponent: TestWidgetClient,
});

// Tall: 2x4 (min 2x3, max 4x6)
export const testTallWidget = defineWidget({
  meta: {
    id: "test-tall",
    name: "Tall (2x4)",
    description: "Tall vertical widget for testing",
    category: "utility",
    icon: RectangleVertical,
    size: {
      minW: 2,
      minH: 3,
      maxW: 4,
      maxH: 6,
      defaultW: 2,
      defaultH: 4,
    },
  },
  defaultConfig: {
    label: "Tall 2×4",
    color: "#16a34a", // green
  },
  ClientComponent: TestWidgetClient,
});

// Large: 4x4 (min 3x3, max 6x6)
export const testLargeWidget = defineWidget({
  meta: {
    id: "test-large",
    name: "Large (4x4)",
    description: "Large square widget for testing",
    category: "utility",
    icon: Maximize,
    size: {
      minW: 3,
      minH: 3,
      maxW: 6,
      maxH: 6,
      defaultW: 4,
      defaultH: 4,
    },
  },
  defaultConfig: {
    label: "Large 4×4",
    color: "#dc2626", // red
  },
  ClientComponent: TestWidgetClient,
});

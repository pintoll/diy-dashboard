import type { BreakpointKey, WidgetSize } from "@/src/shared/types";
import type { LayoutItem } from "react-grid-layout";

export const GRID_COLS: Record<BreakpointKey, number> = {
  xxl: 14,
  xl: 12,
  lg: 10,
  md: 8,
  sm: 6,
  xs: 4,
  xxs: 2,
};

export const GRID_BREAKPOINTS: Record<BreakpointKey, number> = {
  xxl: 1800,
  xl: 1500,
  lg: 1200,
  md: 900,
  sm: 600,
  xs: 300,
  xxs: 0,
};

export const GRID_ROW_HEIGHT = 100;
export const GRID_MARGIN: [number, number] = [16, 16];
export const BASE_COLS = 12;

type ConstraintsMap = Map<
  string,
  { minW: number; maxW?: number; minH: number; maxH?: number }
>;

function scaleConstraint(
  value: number,
  scale: number,
  floor: number = 1
): number {
  return Math.max(floor, Math.round(value * scale));
}

export function scaleLayoutItems(
  items: readonly LayoutItem[],
  sourceCols: number,
  targetCols: number,
  constraintsMap?: ConstraintsMap
): LayoutItem[] {
  const scale = targetCols / sourceCols;

  return items.map((item) => {
    const constraints = constraintsMap?.get(item.i);

    const scaledMinW = constraints
      ? scaleConstraint(constraints.minW, scale)
      : item.minW != null
        ? scaleConstraint(item.minW, scale)
        : undefined;
    const scaledMaxW = constraints?.maxW
      ? scaleConstraint(constraints.maxW, scale)
      : item.maxW != null
        ? scaleConstraint(item.maxW, scale)
        : undefined;

    let w = Math.round(item.w * scale);
    if (scaledMinW != null) w = Math.max(w, scaledMinW);
    if (scaledMaxW != null) w = Math.min(w, scaledMaxW);
    w = Math.min(w, targetCols);

    let x = Math.round(item.x * scale);
    x = Math.max(0, Math.min(x, targetCols - w));

    return {
      ...item,
      x,
      w,
      minW: scaledMinW,
      maxW: scaledMaxW,
    };
  });
}

export function reverseScaleLayoutItems(
  items: readonly LayoutItem[],
  currentCols: number,
  baseCols: number,
  constraintsMap?: ConstraintsMap
): LayoutItem[] {
  const scale = baseCols / currentCols;

  return items.map((item) => {
    const constraints = constraintsMap?.get(item.i);

    const minW = constraints?.minW ?? item.minW;
    const maxW = constraints?.maxW ?? item.maxW;

    let w = Math.round(item.w * scale);
    if (minW != null) w = Math.max(w, minW);
    if (maxW != null) w = Math.min(w, maxW);
    w = Math.min(w, baseCols);

    let x = Math.round(item.x * scale);
    x = Math.max(0, Math.min(x, baseCols - w));

    return {
      ...item,
      x,
      w,
      minW,
      maxW,
    };
  });
}

export function computeAllBreakpointLayouts(
  baseItems: LayoutItem[],
  constraintsMap?: ConstraintsMap
): Record<BreakpointKey, LayoutItem[]> {
  const breakpointKeys = Object.keys(GRID_COLS) as BreakpointKey[];

  const layouts = {} as Record<BreakpointKey, LayoutItem[]>;

  for (const bp of breakpointKeys) {
    const targetCols = GRID_COLS[bp];
    if (targetCols === BASE_COLS) {
      layouts[bp] = baseItems;
    } else {
      layouts[bp] = scaleLayoutItems(
        baseItems,
        BASE_COLS,
        targetCols,
        constraintsMap
      );
    }
  }

  return layouts;
}

export function buildConstraintsMap(
  widgets: Array<{ instanceId: string; widgetId: string }>,
  registry: { get(id: string): { meta: { size: WidgetSize } } | undefined }
): ConstraintsMap {
  const map: ConstraintsMap = new Map();
  for (const w of widgets) {
    const def = registry.get(w.widgetId);
    if (def) {
      map.set(w.instanceId, {
        minW: def.meta.size.minW,
        maxW: def.meta.size.maxW,
        minH: def.meta.size.minH,
        maxH: def.meta.size.maxH,
      });
    }
  }
  return map;
}

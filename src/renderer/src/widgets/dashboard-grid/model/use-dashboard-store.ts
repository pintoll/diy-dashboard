import { create } from "zustand";
import { persist } from "zustand/middleware";
import { nanoid } from "nanoid";
import type { WidgetInstance, WidgetLayout } from "@/src/shared/types";
import { GRID_COLS } from "@/src/shared/lib/grid";
import { widgetRegistry } from "@/src/widgets/widget-registry";

type DashboardState = {
  widgets: WidgetInstance[];
  isEditMode: boolean;
  addWidget: (widgetId: string) => void;
  removeWidget: (instanceId: string) => void;
  updateLayout: (instanceId: string, layout: WidgetLayout) => void;
  updateLayouts: (
    layouts: Array<{ instanceId: string; layout: WidgetLayout }>
  ) => void;
  updateConfig: (instanceId: string, config: Record<string, unknown>) => void;
  toggleEditMode: () => void;
};

function findAvailablePosition(
  existingWidgets: WidgetInstance[],
  width: number,
  height: number,
  cols: number = GRID_COLS
): { x: number; y: number } {
  const grid: boolean[][] = [];

  for (const widget of existingWidgets) {
    const { x, y, w, h } = widget.layout;
    for (let row = y; row < y + h; row++) {
      if (!grid[row]) grid[row] = [];
      for (let col = x; col < x + w; col++) {
        grid[row][col] = true;
      }
    }
  }

  for (let y = 0; y < 100; y++) {
    for (let x = 0; x <= cols - width; x++) {
      let fits = true;
      outer: for (let row = y; row < y + height; row++) {
        for (let col = x; col < x + width; col++) {
          if (grid[row]?.[col]) {
            fits = false;
            break outer;
          }
        }
      }
      if (fits) return { x, y };
    }
  }

  return { x: 0, y: 0 };
}

export const useDashboardStore = create<DashboardState>()(
  persist(
    (set, get) => ({
      widgets: [],
      isEditMode: false,

      addWidget: (widgetId: string) => {
        const definition = widgetRegistry.get(widgetId);
        if (!definition) {
          console.error(`Widget "${widgetId}" not found in registry`);
          return;
        }

        const { defaultW, defaultH } = definition.meta.size;
        const position = findAvailablePosition(
          get().widgets,
          defaultW,
          defaultH
        );

        const instance: WidgetInstance = {
          instanceId: nanoid(),
          widgetId,
          config: definition.defaultConfig,
          layout: {
            x: position.x,
            y: position.y,
            w: defaultW,
            h: defaultH,
          },
        };

        set((state) => ({
          widgets: [...state.widgets, instance],
        }));
      },

      removeWidget: (instanceId: string) => {
        set((state) => ({
          widgets: state.widgets.filter((w) => w.instanceId !== instanceId),
        }));
      },

      updateLayout: (instanceId: string, layout: WidgetLayout) => {
        set((state) => ({
          widgets: state.widgets.map((w) =>
            w.instanceId === instanceId ? { ...w, layout } : w
          ),
        }));
      },

      updateLayouts: (
        layouts: Array<{ instanceId: string; layout: WidgetLayout }>
      ) => {
        set((state) => ({
          widgets: state.widgets.map((w) => {
            const update = layouts.find((l) => l.instanceId === w.instanceId);
            return update ? { ...w, layout: update.layout } : w;
          }),
        }));
      },

      updateConfig: (instanceId: string, config: Record<string, unknown>) => {
        set((state) => ({
          widgets: state.widgets.map((w) =>
            w.instanceId === instanceId ? { ...w, config } : w
          ),
        }));
      },

      toggleEditMode: () => {
        set((state) => ({ isEditMode: !state.isEditMode }));
      },
    }),
    {
      name: "dashboard-storage",
    }
  )
);

"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
import {
  ResponsiveGridLayout,
  useContainerWidth,
  type Layout,
  type LayoutItem,
  type ResponsiveLayouts,
} from "react-grid-layout";
import { Edit, Lock, Plus } from "lucide-react";
import { Button } from "@/src/shared/ui/button";
import { useDashboardStore } from "../model/use-dashboard-store";
import { WidgetWrapper } from "./WidgetWrapper";
import { WidgetPickerDialog } from "@/src/features/manage-widget/ui/WidgetPickerDialog";
import { widgetRegistry } from "@/src/widgets/widget-registry";
import "react-grid-layout/css/styles.css";

const COLS = { lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 };
const BREAKPOINTS = { lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 };
const ROW_HEIGHT = 80;

type BreakpointKey = "lg" | "md" | "sm" | "xs" | "xxs";

export function DashboardGrid() {
  const { widgets, isEditMode, toggleEditMode, updateLayouts } =
    useDashboardStore();
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [clientMounted, setClientMounted] = useState(false);
  const { width, containerRef } = useContainerWidth({
    initialWidth: 1200,
  });

  useEffect(() => {
    setClientMounted(true);
  }, []);

  const layout: LayoutItem[] = useMemo(
    () =>
      widgets.map((w) => {
        const definition = widgetRegistry.get(w.widgetId);
        const sizeConstraints = definition?.meta.size;

        return {
          i: w.instanceId,
          x: w.layout.x,
          y: w.layout.y,
          w: w.layout.w,
          h: w.layout.h,
          minW: sizeConstraints?.minW,
          minH: sizeConstraints?.minH,
          maxW: sizeConstraints?.maxW,
          maxH: sizeConstraints?.maxH,
          isDraggable: isEditMode,
          isResizable: isEditMode,
        };
      }),
    [widgets, isEditMode]
  );

  const layouts: ResponsiveLayouts<BreakpointKey> = useMemo(
    () => ({ lg: layout }),
    [layout]
  );

  const handleLayoutChange = useCallback(
    (newLayout: Layout) => {
      const updates = newLayout.map((item) => ({
        instanceId: item.i,
        layout: { x: item.x, y: item.y, w: item.w, h: item.h },
      }));
      updateLayouts(updates);
    },
    [updateLayouts]
  );

  if (!clientMounted) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading dashboard...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4">
      <header className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">Dashboard</h1>
        <div className="flex items-center gap-2">
          <Button
            variant={isEditMode ? "default" : "outline"}
            size="sm"
            onClick={toggleEditMode}
          >
            {isEditMode ? (
              <>
                <Lock className="h-4 w-4 mr-2" />
                Lock
              </>
            ) : (
              <>
                <Edit className="h-4 w-4 mr-2" />
                Edit
              </>
            )}
          </Button>
          <Button size="sm" onClick={() => setIsPickerOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Widget
          </Button>
        </div>
      </header>

      {/* Container ref is always attached for consistent width measurement */}
      <div ref={containerRef} className="w-full min-h-[400px]">
        {widgets.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[60vh] border-2 border-dashed border-border rounded-lg">
            <p className="text-muted-foreground mb-4">No widgets yet</p>
            <Button onClick={() => setIsPickerOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Your First Widget
            </Button>
          </div>
        ) : (
          <ResponsiveGridLayout
            className="layout"
            layouts={layouts}
            breakpoints={BREAKPOINTS}
            cols={COLS}
            rowHeight={ROW_HEIGHT}
            width={width}
            dragConfig={{
              handle: ".drag-handle",
            }}
            onLayoutChange={handleLayoutChange}
            margin={[16, 16]}
          >
            {widgets.map((widget) => (
              <div key={widget.instanceId} className="h-full">
                <WidgetWrapper instance={widget} />
              </div>
            ))}
          </ResponsiveGridLayout>
        )}
      </div>

      <WidgetPickerDialog open={isPickerOpen} onOpenChange={setIsPickerOpen} />
    </div>
  );
}

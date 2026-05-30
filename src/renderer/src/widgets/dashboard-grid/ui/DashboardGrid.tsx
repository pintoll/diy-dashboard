import { useCallback, useEffect, useState, useMemo } from "react";
import {
  GridLayout,
  useContainerWidth,
  type Layout,
  type LayoutItem,
} from "react-grid-layout";
import { Edit, Lock, Plus } from "lucide-react";
import { Button } from "@/src/shared/ui/button";
import {
  GRID_COLS,
  GRID_ROW_HEIGHT,
  GRID_MARGIN,
} from "@/src/shared/lib/grid";
import { useDashboardStore } from "../model/use-dashboard-store";
import { WidgetWrapper } from "./WidgetWrapper";
import { WidgetPickerDialog } from "@/src/features/manage-widget/ui/WidgetPickerDialog";
import { widgetRegistry } from "@/src/widgets/widget-registry";
import "react-grid-layout/css/styles.css";

export function DashboardGrid() {
  const { widgets, isEditMode, toggleEditMode, updateLayouts } =
    useDashboardStore();
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [clientMounted, setClientMounted] = useState(false);
  const { width, containerRef } = useContainerWidth({
    initialWidth: 1280,
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

  const handleInteractionStop = useCallback(
    (nextLayout: Layout) => {
      const updates = nextLayout.map((item) => ({
        instanceId: item.i,
        layout: { x: item.x, y: item.y, w: item.w, h: item.h },
      }));
      updateLayouts(updates);
    },
    [updateLayouts]
  );

  return (
    <div className="min-h-screen p-4">
      {clientMounted && (
        <header className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold">Dashboard</h1>
          </div>
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
      )}

      {/* containerRef must always be in the DOM so useContainerWidth can measure */}
      <div ref={containerRef} className="w-full min-h-[400px]">
        {!clientMounted ? (
          <div className="flex items-center justify-center h-[60vh]">
            <p className="text-muted-foreground">Loading dashboard...</p>
          </div>
        ) : widgets.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[60vh] border-2 border-dashed border-border rounded-lg">
            <p className="text-muted-foreground mb-4">No widgets yet</p>
            <Button onClick={() => setIsPickerOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Your First Widget
            </Button>
          </div>
        ) : (
          <GridLayout
            className="layout"
            layout={layout}
            width={width}
            gridConfig={{
              cols: GRID_COLS,
              rowHeight: GRID_ROW_HEIGHT,
              margin: GRID_MARGIN,
            }}
            dragConfig={{
              handle: ".drag-handle",
            }}
            onDragStop={handleInteractionStop}
            onResizeStop={handleInteractionStop}
          >
            {widgets.map((widget) => (
              <div key={widget.instanceId} className="h-full">
                <WidgetWrapper instance={widget} />
              </div>
            ))}
          </GridLayout>
        )}
      </div>

      {clientMounted && (
        <WidgetPickerDialog
          open={isPickerOpen}
          onOpenChange={setIsPickerOpen}
        />
      )}
    </div>
  );
}

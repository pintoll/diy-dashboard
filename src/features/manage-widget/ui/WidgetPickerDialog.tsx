"use client";

import { useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/src/shared/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/src/shared/ui/tabs";
import { Card, CardDescription, CardTitle } from "@/src/shared/ui/card";
import { widgetRegistry } from "@/src/widgets/widget-registry";
import { useDashboardStore } from "@/src/widgets/dashboard-grid";
import type { WidgetCategory, WidgetMeta } from "@/src/shared/types";

type WidgetPickerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const CATEGORY_LABELS: Record<WidgetCategory, string> = {
  productivity: "Productivity",
  data: "Data",
  media: "Media",
  utility: "Utility",
};

export function WidgetPickerDialog({
  open,
  onOpenChange,
}: WidgetPickerDialogProps) {
  const addWidget = useDashboardStore((s) => s.addWidget);
  const allWidgets = widgetRegistry.getAllMeta();

  const widgetsByCategory = useMemo(() => {
    const grouped: Record<WidgetCategory, WidgetMeta[]> = {
      productivity: [],
      data: [],
      media: [],
      utility: [],
    };
    for (const widget of allWidgets) {
      grouped[widget.category].push(widget);
    }
    return grouped;
  }, [allWidgets]);

  const availableCategories = useMemo(() => {
    return (Object.keys(widgetsByCategory) as WidgetCategory[]).filter(
      (cat) => widgetsByCategory[cat].length > 0
    );
  }, [widgetsByCategory]);

  const handleAddWidget = (widgetId: string) => {
    addWidget(widgetId);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add Widget</DialogTitle>
        </DialogHeader>

        {allWidgets.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            No widgets available
          </div>
        ) : (
          <Tabs
            defaultValue={availableCategories[0] || "productivity"}
            className="mt-4"
          >
            <TabsList className="w-full justify-start">
              {availableCategories.map((category) => (
                <TabsTrigger key={category} value={category}>
                  {CATEGORY_LABELS[category]}
                </TabsTrigger>
              ))}
            </TabsList>

            {availableCategories.map((category) => (
              <TabsContent
                key={category}
                value={category}
                className="grid grid-cols-2 gap-3 mt-4"
              >
                {widgetsByCategory[category].map((widget) => {
                  const Icon = widget.icon;
                  return (
                    <Card
                      key={widget.id}
                      className="p-4 cursor-pointer hover:bg-accent/10 transition-colors"
                      onClick={() => handleAddWidget(widget.id)}
                    >
                      <div className="flex items-start gap-3">
                        <div className="p-2 bg-primary/10 rounded-md">
                          <Icon className="h-5 w-5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-sm">
                            {widget.name}
                          </CardTitle>
                          <CardDescription className="text-xs mt-1 line-clamp-2">
                            {widget.description}
                          </CardDescription>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </TabsContent>
            ))}
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { GripVertical, Settings, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/src/shared/ui/dropdown-menu";
import { Button } from "@/src/shared/ui/button";
import { widgetRegistry } from "@/src/widgets/widget-registry";
import type { WidgetInstance } from "@/src/shared/types";
import { useDashboardStore } from "../model/use-dashboard-store";

type WidgetWrapperProps = {
  instance: WidgetInstance;
};

export function WidgetWrapper({ instance }: WidgetWrapperProps) {
  const { isEditMode, removeWidget } = useDashboardStore();
  const definition = widgetRegistry.get(instance.widgetId);

  if (!definition) {
    return (
      <div className="h-full bg-card text-card-foreground rounded-lg border flex items-center justify-center">
        <p className="text-muted-foreground">Widget not found</p>
      </div>
    );
  }

  const { meta, ClientComponent } = definition;
  const Icon = meta.icon;

  return (
    <div className="h-full bg-card text-card-foreground rounded-lg border flex flex-col overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          {isEditMode && (
            <div className="drag-handle cursor-grab active:cursor-grabbing">
              <GripVertical className="h-4 w-4 text-muted-foreground" />
            </div>
          )}
          <Icon className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">{meta.name}</span>
        </div>

        {isEditMode && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6">
                <Settings className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => removeWidget(instance.instanceId)}
                className="text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Remove
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <div className="flex-1 p-3 overflow-auto">
        <ClientComponent
          instanceId={instance.instanceId}
          config={instance.config}
          isEditMode={isEditMode}
        />
      </div>
    </div>
  );
}

import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";

export type BreakpointKey = "xxl" | "xl" | "lg" | "md" | "sm" | "xs" | "xxs";

export type WidgetCategory = "productivity" | "data" | "media" | "utility";

export const WIDGET_CATEGORY_LABELS: Record<WidgetCategory, string> = {
  productivity: "Productivity",
  data: "Data",
  media: "Media",
  utility: "Utility",
};

export type WidgetSize = {
  minW: number;
  minH: number;
  maxW?: number;
  maxH?: number;
  defaultW: number;
  defaultH: number;
};

export type WidgetMeta = {
  id: string;
  name: string;
  description: string;
  category: WidgetCategory;
  icon: LucideIcon;
  size: WidgetSize;
};

export type WidgetLayout = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type WidgetInstance<TConfig = Record<string, unknown>> = {
  instanceId: string;
  widgetId: string;
  config: TConfig;
  layout: WidgetLayout;
};

export type WidgetProps<TConfig = Record<string, unknown>> = {
  instanceId: string;
  config: TConfig;
  isEditMode: boolean;
};

export type WidgetClientComponent<TConfig = Record<string, unknown>> =
  ComponentType<WidgetProps<TConfig>>;

export type WidgetDefinition<TConfig = Record<string, unknown>> = {
  meta: WidgetMeta;
  defaultConfig: TConfig;
  ClientComponent: WidgetClientComponent<TConfig>;
};

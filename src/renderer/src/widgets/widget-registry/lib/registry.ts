import type {
  WidgetDefinition,
  WidgetMeta,
} from "@/src/shared/types";

type WidgetRegistry = {
  register: <TConfig>(definition: WidgetDefinition<TConfig>) => void;
  get: <TConfig = Record<string, unknown>>(
    id: string
  ) => WidgetDefinition<TConfig> | undefined;
  getAllMeta: () => WidgetMeta[];
  getAll: () => WidgetDefinition[];
};

const registry = new Map<string, WidgetDefinition>();

export const widgetRegistry: WidgetRegistry = {
  register: <TConfig>(definition: WidgetDefinition<TConfig>) => {
    if (registry.has(definition.meta.id)) {
      console.warn(
        `Widget "${definition.meta.id}" is already registered. Skipping.`
      );
      return;
    }
    registry.set(definition.meta.id, definition as WidgetDefinition);
  },

  get: <TConfig = Record<string, unknown>>(id: string) => {
    return registry.get(id) as WidgetDefinition<TConfig> | undefined;
  },

  getAllMeta: () => {
    return Array.from(registry.values()).map((def) => def.meta);
  },

  getAll: () => {
    return Array.from(registry.values());
  },
};

export function defineWidget<TConfig>(
  definition: WidgetDefinition<TConfig>
): WidgetDefinition<TConfig> {
  return definition;
}

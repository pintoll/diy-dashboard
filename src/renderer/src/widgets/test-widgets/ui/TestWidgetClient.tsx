import type { WidgetProps } from "@/src/shared/types";

type TestWidgetConfig = {
  label: string;
  color: string;
};

export function TestWidgetClient({ config }: WidgetProps<TestWidgetConfig>) {
  return (
    <div
      className="h-full w-full flex items-center justify-center rounded-md"
      style={{ backgroundColor: config.color }}
    >
      <span className="text-white font-bold text-lg drop-shadow-md">
        {config.label}
      </span>
    </div>
  );
}

import { cva } from "class-variance-authority";
import { Shield, Coffee, Lock } from "lucide-react";
import { cn } from "@/src/shared/lib/utils";
import { useFocusModeStore } from "@/src/entities/focus-mode";
import type { FocusMode } from "@/src/shared/types";

// Top-left intent declaration. The calm self who starts the Pomodoro picks
// focus or leisure here; once a work session is active the choice locks (intent
// is immutable mid-session — the only exit is the Pomodoro stop button).
const segment = cva(
  "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed",
  {
    variants: {
      mode: { focus: "", leisure: "" },
      selected: {
        true: "",
        false: "text-muted-foreground hover:text-foreground",
      },
    },
    compoundVariants: [
      {
        mode: "focus",
        selected: true,
        class: "bg-blue-500/15 text-blue-600 dark:text-blue-300",
      },
      {
        mode: "leisure",
        selected: true,
        class: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
      },
    ],
    defaultVariants: { selected: false },
  }
);

export function FocusModeTab() {
  const intendedMode = useFocusModeStore((s) => s.intendedMode);
  const sessionActive = useFocusModeStore((s) => s.sessionActive);
  const setIntendedMode = useFocusModeStore((s) => s.setIntendedMode);

  const select = (mode: FocusMode) => {
    if (sessionActive) return;
    setIntendedMode(mode);
  };

  return (
    <div
      className="inline-flex items-center gap-1 rounded-lg border bg-muted/40 p-[3px]"
      title={sessionActive ? "Locked during a focus session — stop to change" : undefined}
    >
      <button
        type="button"
        onClick={() => select("focus")}
        disabled={sessionActive}
        className={cn(segment({ mode: "focus", selected: intendedMode === "focus" }))}
      >
        <Shield className="h-3.5 w-3.5" />
        Focus
      </button>
      <button
        type="button"
        onClick={() => select("leisure")}
        disabled={sessionActive}
        className={cn(segment({ mode: "leisure", selected: intendedMode === "leisure" }))}
      >
        <Coffee className="h-3.5 w-3.5" />
        Leisure
      </button>
      {sessionActive && (
        <Lock className="ml-0.5 h-3 w-3 text-muted-foreground" aria-label="Locked" />
      )}
    </div>
  );
}

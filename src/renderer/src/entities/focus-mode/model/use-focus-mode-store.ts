import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { FocusMode } from "@/src/shared/types";

// Global focus-mode signal, shared between the pomodoro widget (writes
// sessionActive, reads intendedMode at record time) and the focus-mode feature
// (the intent tab + the block controller). Lives in the entities layer so both
// consumers can import it without an upward FSD dependency.
//
// intendedMode is persisted so the last declared intent survives a restart.
// sessionActive is ephemeral — it must always start false on a fresh load, so
// it is excluded from persistence via partialize.
type FocusModeState = {
  intendedMode: FocusMode;
  sessionActive: boolean;
  setIntendedMode: (mode: FocusMode) => void;
  setSessionActive: (active: boolean) => void;
};

export const useFocusModeStore = create<FocusModeState>()(
  persist(
    (set) => ({
      intendedMode: "focus",
      sessionActive: false,
      setIntendedMode: (mode) => set({ intendedMode: mode }),
      setSessionActive: (active) => set({ sessionActive: active }),
    }),
    {
      name: "focus-mode-intent",
      partialize: (state) => ({ intendedMode: state.intendedMode }),
    }
  )
);

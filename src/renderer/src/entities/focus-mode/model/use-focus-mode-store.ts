import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { FocusMode } from "@/src/shared/types";

// Global focus-mode signal, shared between the pomodoro widget (writes
// sessionActive, reads intendedMode at record time) and the focus-mode feature
// (the intent tab + the block controller). Lives in the entities layer so both
// consumers can import it without an upward FSD dependency.
//
// intendedMode is persisted so the last declared intent survives a restart.
// sessionActive and siteBlockError are ephemeral — they must always start clear
// on a fresh load, so they are excluded from persistence via partialize.
// siteBlockError holds the site guard's last hosts-write failure while a focus
// session is active, so the UI can warn that blocking did not actually apply.
type FocusModeState = {
  intendedMode: FocusMode;
  sessionActive: boolean;
  siteBlockError: string | null;
  setIntendedMode: (mode: FocusMode) => void;
  setSessionActive: (active: boolean) => void;
  setSiteBlockError: (message: string | null) => void;
};

export const useFocusModeStore = create<FocusModeState>()(
  persist(
    (set) => ({
      intendedMode: "focus",
      sessionActive: false,
      siteBlockError: null,
      setIntendedMode: (mode) => set({ intendedMode: mode }),
      setSessionActive: (active) => set({ sessionActive: active }),
      setSiteBlockError: (message) => set({ siteBlockError: message }),
    }),
    {
      name: "focus-mode-intent",
      partialize: (state) => ({ intendedMode: state.intendedMode }),
    }
  )
);

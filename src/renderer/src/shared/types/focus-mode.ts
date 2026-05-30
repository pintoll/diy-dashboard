// The session's declared intent and the end-of-session attention verdict share
// this binary scale. Declared at session start (intendedMode), it is immutable
// for the session — the only exit is the Pomodoro stop button.
export type FocusMode = "focus" | "leisure";

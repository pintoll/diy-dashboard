# Pomodoro Timer — Improvement Roadmap

## Current State

Core timer with presets (25:5, 50:10, 120:30, custom), native OS notifications,
per-instance Zustand persistence, background timer support via `backgroundThrottling: false`.

## High Impact

- **Circular progress ring** — Visual countdown arc around the time display.
  Instant "how much is left?" feedback without reading numbers.
- **Sound alert** — Short chime/bell on phase end. Notifications can be missed,
  sound grabs attention. Add volume toggle in settings.
- **Auto-start next phase** — Optional toggle to auto-start break after work
  (and vice versa) for uninterrupted flow.

## Medium Impact

- **Session stats** — Track daily completed pomodoros with a small bar chart
  or streak counter.
- **Keyboard shortcuts** — Space: play/pause, R: reset, S: skip.
  Useful for a desktop app.

## Nice-to-Have

- **Task label** — Editable text field to name current focus ("Fix auth bug").
  Could feed into stats later.
- **Tray timer display** — Show remaining time in tray tooltip so you can
  check without opening the window.
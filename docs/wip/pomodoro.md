# WIP — Pomodoro Timer

The core (presets 25:5 / 50:10 / 120:30 / custom, native notifications, per-instance Zustand persist, background ticking via `backgroundThrottling: false`) is done. This file collects work notes for the next features.

## High Impact

### Circular Progress Ring

SVG countdown arc around the time display. Glanceable "how much is left" without reading numbers.

- Where: `widgets/pomodoro-timer/ui/`, add `ProgressRing.tsx`
- SVG `<circle>` + `stroke-dasharray` trick, interpolate `dashoffset` from `remainingMs / totalMs`
- Color varies per phase (work / break)

### Sound Alert

Short chime on phase end. Notifications can be missed; audio is harder to ignore.

- Audio file: `src/renderer/src/widgets/pomodoro-timer/assets/`, mp3/ogg
- `<audio>` element or the `Audio` API
- Settings: add `soundEnabled: boolean` and `volume: number` to `Config`, include in persist
- Mute toggle as a header icon button

### Auto-start Next Phase

Optional: when work ends, break starts automatically (and vice versa). Removes the manual click between phases.

- Add `autoStartNext: boolean` to `Config`
- In the phase-transition handler, call `start()` automatically when enabled
- Default `false` — explicit opt-in

## Medium Impact

### Session Stats

Track completed pomodoros per day. Small bar chart or streak counter.

- Storage: `localStorage` key `pomodoro-stats:<instanceId>`, shape `{ date: count }`
- UI: "Today: X" line at the bottom of the card; click opens a 7-day bar chart modal
- Chart via Recharts (already a dependency)

### Keyboard Shortcuts

Desktop-app expectation.

- `Space`: play/pause
- `R`: reset
- `S`: skip to next phase
- Active only when the widget is focused (no global hotkeys — they would clash with other widgets)
- `useEffect` + `keydown` listener with cleanup

## Nice-to-Have

### Task Label

Editable text for the current focus ("Fix auth bug"). Could feed into stats later.

- `Config.currentTask: string | null`
- Small input above the time display, persists on blur
- Stats can later widen to `{ date, count, tasks: string[] }` to log completed task names

### Tray Timer Display

Show remaining time in the tray tooltip so you don't need to open the window.

- IPC: `pomodoro:tick` from renderer to main, every second
- Main: `tray.setToolTip(\`Pomodoro: \${mm}:\${ss}\`)`
- Trade-off: with multiple instances, pick a policy — "most recently active" or "first running instance".

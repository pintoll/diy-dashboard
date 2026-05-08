# WIP — Pomodoro Timer

Remaining roadmap. The core (presets, persistence, native notifications, background ticking), overtime/attention detection, phase-end chime/flash, and session stats (today/week/streak/heatmap) are shipped.

## High Impact

### Circular Progress Ring

SVG countdown arc around the time display. Glanceable progress without reading numbers.

- New `widgets/pomodoro-timer/ui/ProgressRing.tsx`
- SVG `<circle>` + `stroke-dasharray`, interpolate `dashoffset` from `remainingMs / totalMs`
- Color varies per phase

### Auto-start Next Phase

Optional auto-transition between work and break.

- Add `autoStartNext: boolean` to `PomodoroConfig` (default `false`)
- Phase-transition handler calls `start()` when enabled

## Medium Impact

### Keyboard Shortcuts

- `Space`: play/pause, `R`: reset, `S`: skip phase
- Active only when widget is focused (no global hotkeys)
- `useEffect` + `keydown` listener with cleanup

## Nice-to-Have

### Task Label

Editable text for the current focus ("Fix auth bug"). Can feed into stats later.

- `PomodoroConfig.currentTask: string | null`
- Small input above time display, persists on blur

### Tray Timer Display

Show remaining time in the tray tooltip.

- IPC `pomodoro:tick` from renderer to main, every second
- Main: `tray.setToolTip(\`Pomodoro: ${mm}:${ss}\`)`
- Multi-instance policy needed (e.g. "first running")

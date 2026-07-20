# WIP — Pomodoro Timer

Remaining roadmap. The core (presets, persistence, native notifications, background ticking), overtime/attention detection, phase-end chime/flash, session stats (today/week/streak/heatmap), and the desk model (todos on the clock, per-todo time accrual) are shipped.

The old "Task Label" item is dropped: the desk supersedes a free-text label, and it feeds stats properly rather than "later".

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

### Tray Timer Display

Show remaining time in the tray tooltip.

- IPC `pomodoro:tick` from renderer to main, every second
- Main: `tray.setToolTip(\`Pomodoro: ${mm}:${ss}\`)`
- Multi-instance policy needed (e.g. "first running")

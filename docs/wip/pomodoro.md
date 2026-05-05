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

---

# Upgrade: Overtime + Attention/Leisure Detection

Goal: when a work timer ends, keep counting "extra time" until the user explicitly stops — but guard against the "forgot to stop" case with system-idle awareness, escalating alarms, and a hard 60m cap. After stop, surface an end-of-session dialog showing the app's attention/leisure verdict (based on which apps were foregrounded) with reasons; user can override. If user doesn't interact within 1 min, auto-confirm the verdict and the idle-trimmed time.

Decisions (locked):

- Auto-confirm timeout in dialog: **1 min**.
- Active-window polling cadence: **10s**.
- Display scope: **primary display only**.
- Overtime hard cap: **60 min** — past that, auto-stop and **discard the extra time** (do not record).
- Idle threshold during overtime: **60s** (no input → freeze counter; resume on input).
- Alarm escalation while in overtime: **+5, +10, +20, +30, +60 min** (last one auto-stops).
- Detection lib: **`active-win`** (or `get-windows`). No PowerShell.
- Default leisure rule: **`brave.exe` → leisure**, plus user-editable denylist. Everything else → not leisure.
- Dev/WSL2: leisure detector is a **no-op stub**; only runs in packaged Windows build.

The work is split into 7 stages. Land and validate each before starting the next.

---

## Stage 1 — Schema foundations — **Done**

Extended `entities/pomodoro-session` so later stages slot in without further migrations.

- `PomodoroSessionRecord` gained six fields: `overtimeSec`, `idleSec`, `attention` (`"focus" | "leisure" | "mixed"`), `attentionSource` (`"auto" | "user"`), `processBuckets` (`Record<string, number>`, exe name → seconds), `cappedAt60m`.
- New type aliases `AttentionVerdict` and `AttentionSource` exported from the entity public API.
- `useSessionLogStore` now declares `STORE_VERSION = 1` and a `migrate(persistedState, version)` that backfills the six fields on v0 → v1 (defaults: `0, 0, "focus", "auto", {}, false`).
- `recordSession` input was softened to `Omit<…, "id" | <stage-1-fields>> & Partial<Pick<…, <stage-1-fields>>>` so the existing Stage-0 call site (`widgets/pomodoro-timer/model/use-pomodoro-store.ts`) compiles unchanged; the action spreads default values before the caller's record.
- Stage 2+ callers can now pass real values for the new fields without further schema changes.

Files touched: `src/renderer/src/entities/pomodoro-session/{index.ts, model/pomodoro-session.types.ts, model/use-session-log-store.ts}`.

---

## Stage 2 — Overtime counter + idle-aware trimming

Add overtime state to the pomodoro store and an idle-aware counter that freezes during inactivity.

- Add to `PomodoroState`: `overtimeStartedAt: number | null`, `overtimeAccumulatedSec: number`, `lastActiveAt: number`.
- When `tick()` detects `remaining <= 0` and phase is `work`: instead of immediately calling `completePhase`, transition into "overtime" — set `overtimeStartedAt`, keep `isRunning: true`, do not record yet.
- Main process: expose `powerMonitor.getSystemIdleTime()` over IPC channel `pomodoro:get-idle-time`. Renderer polls every 5s during overtime.
- Idle trimming: when reported idle ≥ 60s, freeze the accumulator (snapshot `overtimeAccumulatedSec`); on next tick where idle < 60s, resume from snapshot.
- Hard cap: when `overtimeAccumulatedSec >= 3600`, auto-stop, set `cappedAt60m=true`, **do not** add the cap-overflow to the recorded time (only record up to the cap, and the user explicitly wanted past-cap discarded — re-confirm by recording only `min(overtime, 3600)` and flagging cap).
- Phase-end sound + taskbar flash: renderer plays an `<audio>` chime; main calls `BrowserWindow.flashFrame(true)`.
- Stop action: explicit user "stop" finalizes overtime, records the work session via `recordSession` with `overtimeSec` set.
- No dialog yet — stop just records and resets.

Files: `widgets/pomodoro-timer/model/use-pomodoro-store.ts`, `src/main/index.ts` (IPC handler + flashFrame), `src/preload/index.ts` (expose `getIdleTime`), `widgets/pomodoro-timer/assets/chime.mp3` (new), `widgets/pomodoro-timer/ui/PomodoroClient.tsx` (audio element, stop button wiring).

---

## Stage 3 — Escalating overtime alarms

Notify on +5/+10/+20/+30/+60 min into overtime. Independent of detection.

- Renderer schedules notifications via `window.electronAPI` at thresholds.
- Schedule on overtime entry; cancel/clear on stop.
- The +60 alarm is the auto-stop trigger (already handled in Stage 2 cap logic — just ensure notification fires at the same moment).

Files: `widgets/pomodoro-timer/model/use-pomodoro-store.ts` (overtime alarm scheduler), `widgets/pomodoro-timer/model/notifications.ts`.

---

## Stage 4 — End-of-session dialog (no detection yet)

Big modal on stop. Default attention verdict is `"focus"` since detection isn't wired up yet. Auto-confirms in 1 min.

- New component `widgets/pomodoro-timer/ui/SessionReviewDialog.tsx`. Radix `Dialog` (already a dep).
- Shows: phase duration, overtime, idle trimmed, total recorded, attention verdict, "Auto-saving in 1:00" countdown.
- Countdown resets on any pointer/keyboard event inside the dialog.
- If user interacts: editable total time field + radio for `focus`/`leisure`/`mixed`. On save, set `attentionSource="user"`.
- If countdown hits 0: save with `attentionSource="auto"`.
- Open on stop (and on auto-stop at 60m cap).

Files: `widgets/pomodoro-timer/ui/SessionReviewDialog.tsx` (new), `widgets/pomodoro-timer/ui/PomodoroClient.tsx` (mount + state).

---

## Stage 5 — Active window polling (data only, no rules)

Sample foreground process every 10s during a work session. Aggregate per-exe seconds. No verdict yet.

- Add `active-win` (or `get-windows`) dep. Configure `electron-builder` (`asarUnpack` for the helper binary).
- Main process: `setInterval(10s)` while a renderer-side work session is active; signal via IPC `pomodoro:session-started` / `pomodoro:session-ended`.
- Each poll: filter to `displayId === primaryDisplay.id`; emit `pomodoro:active-window` with `{ exeName, title }`.
- Renderer: aggregate into `processBuckets[exeName] += 10` until session ends.
- Dev stub: on non-Windows or when `active-win` errors, return `null` — buckets stay empty.
- Display in the Stage 4 dialog (read-only) the top buckets: "Chrome 18m, Code 22m, Brave 6m". Verdict still hardcoded `"focus"`.

Files: `package.json` (dep), `electron-builder.yml` (asarUnpack), `src/main/index.ts` (poller + IPC), `src/preload/index.ts` (subscription), `widgets/pomodoro-timer/model/use-pomodoro-store.ts` (bucket accumulator), `widgets/pomodoro-timer/ui/SessionReviewDialog.tsx` (breakdown).

---

## Stage 6 — Leisure rules + verdict

Apply rules to compute attention verdict; surface reasons; allow override.

- Storage: `leisureProcesses: string[]` in widget config; default `["brave.exe"]`.
- On session end, compute `leisureSec = sum(buckets[exe] for exe in leisureProcesses)` and `activeSec = totalSec - idleSec`. Verdict: `leisureSec / activeSec > 0.5` → `"leisure"`; `> 0.15` → `"mixed"`; else `"focus"`.
- Dialog shows reason: e.g. "Detected leisure: 6m 10s in brave.exe (>15% of active time)".
- "Mark as leisure" button next to each non-flagged exe in the breakdown — adds to `leisureProcesses` for next session.
- User can still override the final verdict regardless of detection.

Files: `widgets/pomodoro-timer/model/leisure-rules.ts` (new — pure function), `widgets/pomodoro-timer/ui/SessionReviewDialog.tsx`, `widgets/pomodoro-timer/ui/PomodoroSettings.tsx` (manage leisure list).

---

## Stage 7 — Settings + polish

- Settings panel: list/add/remove leisure processes, toggle whole detection feature on/off, toggle phase-end chime + flash.
- Empty-state UX in dialog when buckets are empty (dev/WSL2 case): show "Active-window detection unavailable in dev — verdict from manual selection only".
- Doc updates: feature description in the widget README header comment.

---

## Out of scope (separate work)

- Daily/weekly stats panel (already in Medium Impact above).
- Session export.
- Per-task labels feeding session log (already in Nice-to-Have above).

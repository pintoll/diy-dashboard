# Pomodoro — Local Agent API

Extends the local agent API with read/control of the live pomodoro timer. Discovery, auth, transport, and error envelope are identical to [`todos-agent-api.md`](todos-agent-api.md) — read that first.

Status: **implemented** — routes in `src/main/agent-api/pomodoro-routes.ts`, renderer bridge in `src/renderer/src/widgets/pomodoro-timer/ui/PomodoroBridgeController.tsx`. Consumed by the `dyd` CLI ([`dyd-cli.md`](dyd-cli.md)) and, later, the remote-view web UI.

## Architecture: the renderer bridge

Timer authority stays in the renderer (`use-pomodoro-store`, per-instance Zustand). The HTTP server lives in main and cannot touch that store, so both directions go through a bridge:

- **State**: an app-level headless module in the renderer subscribes to the pomodoro store and pushes a raw snapshot to main on every state *transition* (start/pause/skip/preset/overtime enter-exit), not every second. The snapshot carries `startedAt`, `pausedTimeRemaining`, phase durations, and overtime fields; main recomputes `remainingSec` / `overtime.elapsedSec` at request time using the same formulas as the store (`computeTimeRemaining`, `getOvertimeElapsed`). Reads are always fresh without any polling loop.
- **Commands**: the HTTP handler forwards the command to the renderer over IPC with a correlation id; the bridge validates it against current state (guard table below), executes the store action, and replies with the resulting snapshot. No reply within ~1.5 s → `504`.
- **Instance binding**: pomodoro stores are per-widget-instance. The bridge binds the first pomodoro instance in the dashboard layout store. No pomodoro widget on the dashboard → no snapshot ever arrives → `503`.
- Window hidden to tray keeps the renderer (and the bridge) alive — close-to-tray is why renderer authority is acceptable here. App not running → `ECONNREFUSED`, as with every other route.

Commands mutate the same store the widget renders from, so the UI reflects an agent command immediately; nothing extra to emit.

## Routes

### `GET /api/pomodoro`

```jsonc
→ 200
{
  "phase": "work",              // "work" | "shortBreak" | "longBreak"
  "isRunning": true,
  "remainingSec": 812,          // computed at request time, clamped ≥ 0
  "phaseDurationSec": 1500,
  "completedPomodoros": 3,      // this cycle (resets with preset change)
  "presetId": "25:5",
  "overtime": null,             // or { "elapsedSec": 340, "isIdle": false }
  "pendingReview": false,       // true → a session review awaits confirmation in the app UI
  "activeTodo": null            // or { "id": "...", "title": "..." } — same todo as GET /api/active-todo
}
```

- `remainingSec: 0` with `isRunning: true` means the phase end is imminent — the renderer tick finalizes it within a second (a finished work phase then enters overtime and `overtime` becomes non-null).
- `503 { "error": "pomodoro bridge not ready" }` — renderer hasn't reported yet (app just launched, or no pomodoro widget on the dashboard).

### `POST /api/pomodoro/command`

```jsonc
POST /api/pomodoro/command
{ "action": "start" }                            // most actions
{ "action": "set-preset", "presetId": "50:10" }  // set-preset only

→ 200 { "applied": true,  "state": { ...same shape as GET } }   // state is post-command
→ 200 { "applied": false, "reason": "...", "state": { ... } }   // guarded no-op; state unchanged
→ 400   unknown action, or set-preset with missing/unknown presetId
→ 503   bridge not ready
→ 504   renderer did not reply (bridge bound but unresponsive)
```

A guarded no-op is a `200` with `applied: false`, not an error: the caller usually wants "and what is the state now?" either way.

| action | semantics | rejected when (`applied: false`) |
|---|---|---|
| `start` | start or resume the current phase | already running; overtime active |
| `pause` | pause, keep remaining time | not running; overtime active |
| `stop` | work: end early → `pendingReview` ("early-stop"); break: clear to idle | overtime active (use `stop-overtime`) |
| `skip` | complete current phase and advance — a skipped **work** phase records a full completed session | overtime active |
| `reset` | clear timer, overtime, and pendingReview — discards without recording | — |
| `set-preset` | switch preset; resets to a fresh stopped work phase | overtime active |
| `stop-overtime` | end overtime → `pendingReview` | no overtime active |

Guards live in the renderer bridge, not the store: the store's own guards silently no-op, and the bridge exists to turn that silence into `applied: false` + `reason`.

Preset ids (fixed, from `POMODORO_PRESETS`): `25:5`, `50:10`, `100:20`, `120:30` (work:shortBreak minutes; long break scales with the preset).

## Deliberately not exposed

- **Review confirmation** (`confirmReview`) — requires an attention/focus judgment; that decision belongs in the app UI. Agents see `pendingReview: true` and leave it alone.
- Notification/chime/flash toggles, leisure-process list — settings, not remote-control surface.
- Per-second tick or push updates — poll `GET /api/pomodoro`; it is cheap and always fresh. A push channel can be added when the remote-view web UI needs one.

# Remote CLI (dyd) — implementation plan

Specs are the contract: [`spec/dyd-cli.md`](../spec/dyd-cli.md), [`spec/pomodoro-agent-api.md`](../spec/pomodoro-agent-api.md). Todos side needs zero app changes ([`spec/todos-agent-api.md`](../spec/todos-agent-api.md) already shipped).

Branch: `feature/remote-view`. This CLI is step 1; the remote-view web UI later consumes the same pomodoro routes.

## Order of work

1. **Main: pomodoro bridge** — `src/main/pomodoro/remote-bridge.ts`. Snapshot cache (raw store fields, recompute remaining/overtime at read), command forwarding with correlation id + ~1.5 s timeout. IPC channels: renderer→main `pomodoro:remote:state`, main→renderer `pomodoro:remote:command`, renderer→main reply `pomodoro:remote:result`.
2. **Main: routes** — `src/main/agent-api/pomodoro-routes.ts` (GET state, POST command per spec incl. `applied/reason` envelope, 503/504). Merge into the routes array in `server.ts`.
3. **Preload** — expose `onPomodoroRemoteCommand(cb)` / `reportPomodoroState(snapshot)` / `sendPomodoroRemoteResult(...)` on `window.electronAPI`.
4. **Renderer: app-level headless bridge** — subscribe to the first pomodoro instance in the dashboard layout store (store cache survives route changes; widget mount not required). Guard table from the spec lives here (`applied: false` + reason); store's own silent guards are not enough.
5. **CLI** — `tools/dyd/dyd` bash script per spec (connection resolution, curl.exe transport, index addressing, exit codes).
6. **Verify end-to-end from WSL** — app on Windows: overview, pomo start/pause/skip/stop, overtime stop path, set-preset, todo add/done/use. Confirm UI reflects each command live.

## Open questions (decide during implementation)

- Snapshot push cadence during overtime: overtime `accumulatedSec` advances via `pollIdle`, so transitions are frequent anyway — check it doesn't spam IPC (throttle to ≥1/s if so).
- `completedPomodoros` shown as "#N this cycle" — confirm reset semantics with preset switch is acceptable in CLI output.

# dyd — terminal CLI for diy-dashboard

Drive the daily-use features (pomodoro, today's todos) from a terminal. Primary scenario: laptop/phone → Tailscale SSH → desktop WSL tmux, where the app runs on the same desktop's Windows side. The CLI only ever talks to the loopback agent API — remote access is SSH's job, so nothing is exposed to the network.

Status: **implemented.** Script at `tools/dyd/dyd`. Consumes [`todos-agent-api.md`](todos-agent-api.md) and [`pomodoro-agent-api.md`](pomodoro-agent-api.md).

Named `dyd` because `dash` is `/bin/dash` on Debian/Ubuntu.

## Runtime

- `tools/dyd/dyd` — single bash script, no build step. Deps: bash, `python3` (JSON parse/build), `curl` or `curl.exe`.
- Install: `ln -s "$(pwd)/tools/dyd/dyd" ~/.local/bin/dyd`.

## Connection resolution

In order:

1. `$DYD_API_FILE` — explicit discovery-file path override.
2. Glob `/mnt/c/Users/*/AppData/Roaming/diy-dashboard/agent-api.json` → app runs on Windows; transport is **`curl.exe`** (WSL interop, runs in Windows loopback context — Linux `curl` cannot reach it).
3. `~/.config/diy-dashboard/agent-api.json` → native Linux app; transport is `curl`.

Read `port` + `token` per request (cheap, and survives app restarts that change the port). JSON bodies are built with `python3` (correct escaping of titles/notes) and passed inline via `-d`; never via temp files (`curl.exe` cannot read WSL paths).

No discovery file, or connection refused → print `diy-dashboard is not running` and exit `2`. No daemon to wait for; do not retry.

## Exit codes

| code | meaning |
|---|---|
| 0 | success — including `applied: false` command responses (state is reported, nothing broke) |
| 1 | API error (4xx/5xx) or usage error |
| 2 | app not running / unreachable |

## Global flags

- `--json` — print the raw API response body instead of formatted output (read commands and command responses alike). For scripting and the future tmux status-line integration.

## Commands

### `dyd` — overview

The at-a-glance check ("what's the state of my desk"). One pomodoro line + today's todos + overdue count:

```
work 13:28 / 25:00  running   (25:5, #4)
── today 2026-07-13 ─────────────
  1 [x] Review PR
* 2 [ ] Write migration        50m
* 3 [ ] Ship release
── overdue: 2 (dyd todo overdue)
```

`*` marks **every** todo on the desk (there can be more than one — the desk is a
set); the right column is accrued `workedSec` (minutes, omitted when 0). Pomodoro
line when the bridge is not ready: `pomodoro: unavailable (no widget?)`.

### `dyd pomo` — pomodoro status

Verbose form of the overview line:

```
phase      work (preset 25:5, 3 done this cycle)
timer      13:28 remaining / 25:00   running
desk       Write migration
           Ship release
```

The `desk` block lists every member (one per line); `desk       (none)` when empty.

Overtime and pending review, when present:

```
overtime   +05:40 (active)          # or (idle)
review     pending — confirm in the app
```

### `dyd pomo <action>`

`start` `pause` `stop` `skip` `reset` — map 1:1 to `POST /api/pomodoro/command`.

- Prints the post-command status line, e.g. `▶ work 25:00 running`.
- `applied: false` → print `not applied: <reason>` + current status line, exit 0.
- `stop` is overtime-aware: if status shows overtime active, send `stop-overtime` instead of `stop`. One user-facing verb; the API distinction stays hidden.
- Any action that leaves `pendingReview: true` appends `review pending — confirm in the app`.

### `dyd pomo set <preset>`

`25:5` | `50:10` | `100:20` | `120:30`. Validated client-side against this list (server validates too). Resets to a fresh stopped work phase — say so in the output.

### `dyd todo` — today's list

Same list block as the overview (without the pomodoro line). `dyd todo overdue` prints the overdue list (each with its original planned date).

### `dyd todo add "<title>" [-d <date>] [-n <note>]`

`POST /api/todos`. `-d` accepts `YYYY-MM-DD` or `tomorrow`; default today. Prints the created todo with its list index.

### `dyd todo done <n|id>`

`PATCH /api/todos/:id { done: true }`.

### `dyd todo use <n|id>` · `dyd todo drop <n|id>`

Manage the **desk** — the set of todos the running work pomodoro credits (every
member accrues; see [`todos-agent-api.md`](todos-agent-api.md#the-desk)).

- `dyd todo use <n|id>` → `POST /api/desk` — **adds** the todo to the desk
  (additive, not a replace).
- `dyd todo use -` → `DELETE /api/desk` — clears the whole desk.
- `dyd todo drop <n|id>` → `DELETE /api/desk/:id` — removes one member.

Each prints the resulting desk: `desk: Write migration, Ship release` (or
`desk: (empty)`). Adding a completed todo errors (exit 1).

### Index addressing

`<n|id>` args: a small integer is a 1-based position in **today's list as `dyd todo` prints it** (API order: `sortOrder`, then creation). Resolved by refetching today's list at execution time — not from a cached view, so it's only racy against concurrent edits in the same second, acceptable single-user. Anything non-numeric is treated as a todo id. Positions do not address the overdue list; use ids there.

## Non-goals (MVP)

- News, stats/analytics, finance — not daily-driver commands; add on demand.
- Review confirmation — app UI only (see pomodoro spec).
- Watch/daemon mode — `watch -n 5 dyd pomo` covers it; a tmux status-line segment can later shell out to `dyd pomo --json`.
- Editing todos beyond done/desk membership — the manage-todo agent path (Claude) already covers reconcile/reschedule flows.

# dyd — terminal CLI for diy-dashboard

Drive the daily-use features (pomodoro, today's todos) and the data sources behind the market widgets from a terminal. Primary scenario: laptop/phone → Tailscale SSH → desktop WSL tmux, where the app runs on the same desktop's Windows side. The CLI only ever talks to the loopback agent API — remote access is SSH's job, so nothing is exposed to the network.

Status: **implemented.** Script at `tools/dyd/dyd`. Consumes [`todos-agent-api.md`](todos-agent-api.md), [`pomodoro-agent-api.md`](pomodoro-agent-api.md), and [`connectors-agent-api.md`](connectors-agent-api.md).

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
── backlog: 7 (dyd todo backlog)
```

`*` marks **every** todo on the desk (there can be more than one — the desk is a
set); the right column is accrued `workedSec` (minutes, omitted when 0). Pomodoro
line when the bridge is not ready: `pomodoro: unavailable (no widget?)`. The
overdue and backlog lines are omitted when their count is zero.

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

### `dyd todo backlog` — the backlog

`GET /api/todos/backlog` — todos with no planned day
([`todos-agent-api.md`](todos-agent-api.md), `docs/design/todo-backlog.md`).
Positions are printed as `b<n>` so they cannot be confused with today's:

```
  b1 [ ] mdx 블로그 첫 글 만들기
  b2 [ ] Read the Postgres locking chapter    35m
```

### `dyd todo add "<title>" [-d <date>] [-n <note>]`

`POST /api/todos`. `-d` accepts `YYYY-MM-DD`, `today`, `tomorrow`, or `backlog`; default today. Prints the created todo with its list index. `-d backlog` sends `"date": null` and prints a `b<n>` index.

### `dyd todo done <n|id>`

`PATCH /api/todos/:id { done: true }`. Completing a backlog todo un-parks it onto today.

### `dyd todo move <n|id|b<n>> <target>`

`PATCH /api/todos/:id { date }`. One verb for every re-plan: `backlog` parks the
todo (sends `null`), `today` / `tomorrow` / `YYYY-MM-DD` place it on a day.

```
dyd todo move 2 backlog        # today's #2 → the backlog
dyd todo move b1 today         # backlog #1 → today
dyd todo move b1 2026-08-01
```

Prints `moved: [ ] <title>   -> <date|backlog>`. A moved todo lands at the end
of its destination bucket.

### `dyd todo use <n|id>` · `dyd todo drop <n|id>`

Manage the **desk** — the set of todos the running work pomodoro credits (every
member accrues; see [`todos-agent-api.md`](todos-agent-api.md#the-desk)).

- `dyd todo use <n|id>` → `POST /api/desk` — **adds** the todo to the desk
  (additive, not a replace).
- `dyd todo use -` → `DELETE /api/desk` — clears the whole desk.
- `dyd todo drop <n|id>` → `DELETE /api/desk/:id` — removes one member.

Each prints the resulting desk: `desk: Write migration, Ship release` (or
`desk: (empty)`). Adding a completed todo errors (exit 1). Adding a **backlog**
todo un-parks it onto today — it is about to accrue time.

### Index addressing

`<n|id>` args: a small integer is a 1-based position in **today's list as `dyd todo` prints it** (API order: `sortOrder`, then creation). `b<n>` is the same, against **the backlog as `dyd todo backlog` prints it**. Both are resolved by refetching that list at execution time — not from a cached view, so it's only racy against concurrent edits in the same second, acceptable single-user. Anything else is treated as a todo id. Positions do not address the overdue list; use ids there.

### `dyd source` — data-source connectors

Manage the declarative HTTP connectors behind the macro and calendar widgets.
Connectors are addressed by **id only** (they have meaningful ids; there is no
positional addressing). The definition schema is
[`connector-protocol.md`](connector-protocol.md).

```
dyd source                          list (same as `dyd source list`)
dyd source list [--group <g>] [--kind <series|events>]
dyd source show <id>                full definition, one field per line
dyd source add <json>               POST /api/connectors
dyd source patch <id> <json>        PATCH /api/connectors/:id
dyd source rm <id>                  DELETE /api/connectors/:id
dyd source test <id>                POST /api/connectors/:id/test
dyd source enable <id>
dyd source disable <id>
```

```
  DGS10            series  Rates   10Y UST
- upbit-btc-krw    series  Crypto  BTC/KRW
  fred-release-10  events  US      CPI
(1 disabled, marked -)
```

A leading `-` marks a disabled connector, mirroring how `*` marks desk members.

The JSON argument is passed as **one shell argument** and is syntax-checked
locally before it is sent, so a stray comma is reported with its column instead
of arriving as a bare `400`.

`add` and `patch` are **slow on purpose**: the app fetches the endpoint for real
before storing anything, and a failed fetch is an error, not a saved connector
(see [`connectors-agent-api.md`](connectors-agent-api.md#why-writes-are-slow)).
Both print the stored connector plus the dry-run sample:

```
saved      upbit-btc-krw  (series, Crypto, enabled)
test       ok, 10 items
           2026-07-18  97120000
           2026-07-19  98750000
```

A rejected write surfaces the app's parse error verbatim, which is the whole
point of the dry-run:

```
dyd: error: connector test failed: parsed 0 usable points from 10 items — check datePath "date" and valuePath "price"
```

`disable` sends `skipTest` with the patch. A connector is usually switched off
*because* it broke, and the dry-run would otherwise refuse the very edit that
silences it. `enable` does run the dry-run, since turning a source on is exactly
when you want to know it works.

`dyd source test` exits **1** when the connector fails, even though the API
answered `200`: the verdict is the only reason to run the command, so it is
scriptable as `dyd source test X && ...`.

### `dyd cred` — credentials

```
dyd cred                     list (same as `dyd cred list`)
dyd cred set <name> <host> <secret>
dyd cred rm <name>
```

```
  fred  api.stlouisfed.org
  ecos  ecos.bok.or.kr
```

Secrets are **write-only**: the API has no route that returns one, so there is
no `cred show` and nothing this CLI prints can leak a key. `list` shows the name
and the pinned `allowedHost` only.

`<host>` is the host the secret is pinned to; a connector naming this credential
but pointing elsewhere is refused before the request goes out. A full URL is
accepted and reduced to its hostname.

The secret is an ordinary argv element, so it lands in shell history and is
visible in `ps` while the command runs. Prefer `dyd cred set fred api.stlouisfed.org "$KEY"`
with the key in an environment variable, or a leading space if your shell is
configured to keep such lines out of history.

## Non-goals (MVP)

- News, stats/analytics, finance — not daily-driver commands; add on demand.
- Review confirmation — app UI only (see pomodoro spec).
- Watch/daemon mode — `watch -n 5 dyd pomo` covers it; a tmux status-line segment can later shell out to `dyd pomo --json`.
- Editing todos beyond done/desk membership — the manage-todo agent path (Claude) already covers reconcile/reschedule flows.

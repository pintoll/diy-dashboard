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

A view built from several independent reads issues them **concurrently** (`api_get_all`), so its latency is one round trip rather than N — the overview needs six. Responses land in a scratch directory, which does not violate the rule above: the redirect is bash's, so `curl.exe` is never handed a WSL path. Each caller still validates every response itself, because tolerance differs per endpoint (a failed `/api/pomodoro` prints an unavailable line; a failed todo read is fatal).

No discovery file, or connection refused → print `diy-dashboard is not running` and exit `2`. No daemon to wait for; do not retry.

## Exit codes

| code | meaning |
|---|---|
| 0 | success — including `applied: false` command responses (state is reported, nothing broke) |
| 1 | API error (4xx/5xx) or usage error |
| 2 | app not running / unreachable |

## Global flags

- `--json` — print the raw API response body instead of formatted output (read commands and command responses alike). For scripting and the future tmux status-line integration.

## "Today" is the server's call

The app's day runs **05:00 → 05:00 Asia/Seoul** (`src/shared/day.ts`), so
between midnight and 05:00 the machine's calendar date is one day ahead of the
day every API route means by "today". The CLI therefore never computes a date
from its own clock: `today`/`tomorrow` date specs and the `── today` header
all come from `GET /api/today` (`{ "date": "YYYY-MM-DD" }`). Re-deriving the
boundary client-side would be a second copy of the rule — the drift the shared
module exists to prevent.

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
── inbox ─────────────
  b1 [ ] mdx 블로그 첫 글 만들기
  b2 [ ] 세금 자료 정리
── Ship the projects layer ─────────────
  b3 [ ] Read the Postgres locking chapter    35m
```

The undated bucket is **split by project** (`docs/design/projects-para.md`), so
this view groups: the **inbox** (undated, unfiled) first, then one block per
project. The grouping is the route's own order, not the CLI's — `sortOrder`
numbers each of those lists separately and therefore repeats across them, so
sorting the rows here would interleave them.

`b<n>` is unchanged and still addresses the **whole** warehouse in printed
order, which makes the inbox exactly the `b1..bk` prefix. That is what makes
`dyd projects file b3 p2` typable.

### `dyd todo add "<title>" [-d <date>] [-n <note>] [--reason <text>]`

`POST /api/todos`. `-d` accepts `YYYY-MM-DD`, `today`, `tomorrow`, or `backlog`; `today`/`tomorrow` resolve against `GET /api/today` (the app's 05:00-bounded day, see above). No `-d` omits `date` from the body, which the API itself reads as today. Prints the created todo with its list index. `-d backlog` sends `"date": null` and prints a `b<n>` index.

`--reason` forwards one natural-language line as the API's `reason` — why this write happened. It is journaled with the change and surfaces in the in-app assistant's log; `done` and `move` take the same flag.

### `dyd todo done <n|id> [--reason <text>]`

`PATCH /api/todos/:id { done: true }`. Completing a backlog todo un-parks it onto today.

### `dyd todo move <n|id|b<n>> <target> [--reason <text>]`

`PATCH /api/todos/:id { date }`. One verb for every re-plan: `backlog` parks the
todo (sends `null`), `today` / `tomorrow` / `YYYY-MM-DD` place it on a day
(`today`/`tomorrow` via `GET /api/today`, as in `add`).

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

### `dyd projects` — the steering layer

Todos answer "finish today"; **projects** answer "is the right work moving at
all" ([`projects-para.md`](../design/projects-para.md),
[`todos-agent-api.md`](todos-agent-api.md#projects--the-steering-layer)). A
project has an end and an outcome line, an area does not, and archiving is a
status rather than a second place.

**Execution happens only in today's list.** The single path from a project into
doing is `pull`, which is an ordinary `PATCH /api/todos/:id` with a date. That
is why there is no `start`, no `plan`, no project-level timer here, and why
there should never be one: a project backlog is a supply, not a second task
list.

#### `dyd projects` · `dyd projects list [--status <s>] [--stale]`

One screen from four concurrent reads (`/api/projects`,
`/api/projects/stats`, `/api/todos/backlog`, `/api/today`).

```
── projects 2026-08-28 ─────────────
  p1 Ship the projects layer
     3/8     4h20m   2d     -> wire dyd projects
! p3 Rewrite the ingest job
     0/4             14d    -> (no next action)
── areas ─────────────
  p2 Health
     6/6     3h10m   today  -> 러닝 루틴 정리
── someday: 4   done: 2   (dyd projects list --status all)
── inbox: 5 (dyd todo backlog)
(1 stale, marked !)
```

Two lines per project. Line 1 ends with the title, and every padded column on
line 2 is ASCII, because f-string padding counts codepoints rather than display
width and a Korean title would otherwise skew the row. Line 2 is
`done/total`, accrued time, time since the project last moved, and `->` its
**next action** (the head of its backlog). Footers are omitted at zero, as in
the overview.

`!` marks a **stale** project, the third mark in the CLI's language after `*`
(desk member) and `-` (disabled connector). The verdict comes from the API,
which owns the day the rule turns on; the CLI never re-derives it.

`--status` narrows to one status (or `all`, which prints every block); `--stale`
prints only stale projects. Filtering **never renumbers** — see Index
addressing below.

#### `dyd projects show <p<n>|id> [--doc <title>]`

Re-entry after a gap: outcome, progress, last activity, the backlog in pull
order, the read-only scheduled list, a collapsed completed count, and the tail
of one doc (default `notes`, last 3 lines). Absent fields are omitted, as in
`source show`.

An empty backlog prints `(empty — this project is not moving)` rather than
`(none)`: an active project with no next action is exactly what a weekly review
is looking for.

The project row comes from the list `resolve_pid` already read — the API exposes
no `GET /api/projects/:id`, and one project is reached through the list.

#### `dyd projects add "<title>" [--kind <project|area>] [--outcome <t>] [--target <date>] [--someday] [--reason <text>]`

`POST /api/projects`, then a refetch so the new project prints with its `p<n>`
(same shape as `dyd todo add`). Every project is created with one doc titled
`notes`; the CLI cannot create a second one.

#### `dyd projects set <p<n>|id> [--title <t>] [--outcome <t>] [--target <date>] [--kind <k>] [--reason <text>]`

`PATCH /api/projects/:id`. No field at all is a usage error, caught before the
round trip. An empty `--outcome` / `--target` sends `null` (clear), the same
rule as `dyd fold --remarks ""`.

#### `dyd projects activate | someday | done | archive <p<n>|id> [--reason <text>]`

Four verbs, one status PATCH — a review speaks them as verbs ("park it",
"archive it"), the way `dyd source enable|disable` does.

#### `dyd projects note <p<n>|id> "<line>" [--doc <title>] [--raw] [--reason <text>]`

`PATCH /api/docs/:id` with `append`, which adds one line rather than replacing
the body. The line is **prefixed with the app's day** (`2026-08-28: …`) unless
`--raw` is passed: the server does not date an append, and the date has to be
the app's 05:00 day, so only the CLI can put it there. Dated appends are what
make the worklog accumulate without anyone maintaining it.

`--doc` defaults to `notes`; an unknown title is a client-side error naming the
project, not a 404 on a blank id.

#### `dyd projects notes <p<n>|id> [--doc <title>]`

Prints one doc's whole body. The read for "where was I on X" without opening
the app.

#### `dyd projects file <n|id|b<n>> <p<n>|id|->`

`PATCH /api/todos/:id` with `projectId`; `-` unfiles back to the inbox. This is
the weekly review's first step, which is why the backlog view groups by project.

#### `dyd projects pull <p<n>|id> [<k>] [-d <date>] [--reason <text>]`

Pulls the project's **k-th backlog item** (default 1, the next action) onto a
day (default today). An ordinary date patch — the only project-into-doing verb
there is. Out of range, or an empty backlog, is a client-side error naming the
project.

#### No `dyd projects rm`

Deleting a project detaches its todos and destroys its docs. Archiving keeps
the history the archive exists for, so deletion stays an app act, or an
`/api/apply` batch under a reason that says why.

### `dyd log [date|today|yesterday]`

`GET /api/days/:day/log` — a day's journal, rendered to natural language by the
server ([`todos-agent-api.md`](todos-agent-api.md#get-apidaysdaylog)). Read-only.

```
── log 2026-08-25 ─────────────
  05:57  added "Write tests"
  10:02  planned "Write tests" 10:00-12:00
  11:03  [agent] Front-load the migration work: added "Write migration", planned "Write migration" 13:00-15:00
  18:30  deleted "Write tests" (2 planned blocks removed)
```

- No argument (or `today`) is the app's day via `GET /api/today`, per the
  "today is the server's call" rule. `yesterday` is that day minus one — the
  calendar-style neighbor, **not** `GET /api/yesterday`'s "last unfolded day
  with records". Anything else goes to the server verbatim; a bad date is its
  `400` (exit 1). Every command that names a day (`log`, `day`, `fold`) reads
  the spec the same way.
- `[source]` tags mark non-user writers only (`[agent]`, later `[assistant]`);
  direct app edits are the majority and stay untagged.
- A day with no journaled changes prints `(empty)` — pomodoro work accrual is
  not journaled, so a pure focus day can be empty here while its sessions still
  count elsewhere.

### `dyd day [date|today|yesterday]`

A folded day also prints the snapshot's **projects moved** rollup:

```
  folded at 2026-08-26T23:41:02.113Z
  remarks: good first day
── projects moved ─────────────
  Ship the projects layer  1h25m   1 done
  Infra                    12m
```

"Moved" means the day banked time against one of the project's todos or
completed one — a todo merely *dated* on the day puts no project here. This is
the evening ritual's input: the block names the projects worth a
`dyd projects note` line. It is omitted entirely for a day that moved no filed
work, and for a `v: 1` fold written before project attribution existed
(re-folding upgrades it).

`GET /api/days/:day` — a day's record: the plan, joined with todo state
(`GET /api/todos/by-ids`), and its fold state.

```
── day 2026-08-26 ─────────────
  10:00-12:00  [x] Write migration          85m
  13:00-15:00  [ ] Ship release
  (not folded)
```

A folded day renders from its snapshot instead (titles and outcomes are frozen
in it): plan lines with each todo's outcome, any off-plan involved todos, then
`folded at <ts>` and the remarks.

### `dyd yesterday`

`GET /api/yesterday` — the last day before today with records after the last
fold, i.e. the day a morning session offers to fold. Prints
`unfolded: 2026-08-24   (dyd day …, dyd log …, dyd fold)` or `all days folded`.
Distinct from the `yesterday` **day spec** accepted by `log`/`day`/`fold`, which
is plain calendar arithmetic on the app's today.

### `dyd fold [date|today|yesterday] [--remarks <text>]`

`POST /api/days/:day/fold` — close a day. With no day named, folds the pending
day `dyd yesterday` reports (exit 1 with `nothing to fold` when history is
clean) — the lazy morning path; `dyd fold today` is the night close. Naming
`yesterday` folds the calendar day before today, which is the pending day on an
ordinary morning but not after a gap; a day with no records is the API's `400`.
Re-folding
recomputes the snapshot and restamps `foldedAt`; `--remarks ""` sends `null`,
clearing stored remarks, and omitting the flag keeps them.

```
folded 2026-08-26: 2 plan entries, 1/3 todos done
  remarks: good first day
```

### `dyd apply <json>`

`POST /api/apply` — one intent as an atomic batch: a required `reason`, an
optional `sessionId`, and `ops` that may reference earlier creates as `"$N"`
([`todos-agent-api.md`](todos-agent-api.md#post-apiapply--one-intent-atomically)).
The argument is the request body verbatim; a JSON syntax error is caught
client-side with a caret position. Any op failing rolls back the whole batch
(exit 1 with the server's message).

```
dyd apply '{"reason":"split C into C-1 and C-2","ops":[
  {"op":"todo.create","title":"C-1"},
  {"op":"todo.create","title":"C-2"},
  {"op":"todo.delete","id":"abc123"},
  {"op":"plan.create","todoId":"$0","start":"10:00","end":"12:00"}]}'
applied 4 op(s)   reason: split C into C-1 and C-2
  + todo [ ] C-1   (2026-08-26)
  + todo [ ] C-2   (2026-08-26)
  - todo abc123
  + plan 10:00-12:00   (2026-08-26)
```

Project and doc ops render the same way, which is what a weekly review looks
like as one intent:

```
applied 3 op(s)   reason: weekly review: retire the ingest rewrite
  ~ project Rewrite the ingest job   (project, archived)
  ~ doc notes   (14 lines)
  ~ todo [ ] rotate the API key   (backlog)
```

### Index addressing

`<n|id>` args: a small integer is a 1-based position in **today's list as `dyd todo` prints it** (API order: `sortOrder`, then creation). `b<n>` is the same, against **the backlog as `dyd todo backlog` prints it**. Both are resolved by refetching that list at execution time — not from a cached view, so it's only racy against concurrent edits in the same second, acceptable single-user. Anything else is treated as a todo id. Positions do not address the overdue list; use ids there.

`p<n>` addresses a **project**, and it is the one deliberate departure from the
rule above: it is a position in the **unfiltered** `GET /api/projects` order
(`sortOrder`, then creation), *not* in the list as printed. So a `p7` seen under
`--status someday` is still `p7` for `dyd projects archive p7`, and no view ever
renumbers another. The visible cost is gaps — the active block may print `p1 p3
p5` — which is the honest reading of a stable handle. Projects are few and
long-lived, where todos churn daily, so stability is worth more here than
contiguity.

No collision is possible: only bare digits and `b<digits>` are special to todo
resolution, and a project reference is only ever accepted in a slot that expects
a project. `dyd projects file 3 p2` is unambiguous by position and by prefix.

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
- Deleting a project — it detaches todos and destroys docs; archive instead, or spell it out in an `/api/apply` batch under a reason.
- Creating extra project docs — every project has `notes`, and a second doc is a shaping act on the page.
- Reordering projects — `sortOrder` is drag-and-drop semantics; no terminal ritual needs it.

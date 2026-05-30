# Focus Mode (Site + App Blocking)

Time-boxed distraction blocking driven by a per-session **intent declaration**. Windows 11 target.

## Goal

Block distracting sites and apps during focus, open during leisure. A self-discipline aid (defeatable by design), not an unbreakable lock. The job is a speed bump higher than an impulse but lower than a real need.

## Mechanism

Block state is a pure function of the session's declared mode, not a mid-session toggle:

```
intent = focus   -> BLOCKED   (write hosts entries + kill-on-sight apps)
intent = leisure -> OPEN      (no blocking)
break/idle       -> OPEN      (remove hosts entries, stop app watch)
```

The user declares intent **at session start** via a small focus/leisure tab (top-left). The calm self who started the Pomodoro made the decision; the tempted self mid-session cannot flip a switch — the only exit is **stop** (see "no unlock key").

Single block layer only: leisure fully opens everything (the reward). No separate always-on block tier.

## Two labels: intent vs. outcome

The declared mode at start and the verdict at end are **separate fields, both recorded** — this is the core data the feature exists to produce.

```
intendedMode: FocusMode | null   // declared at start, immutable
attention:    FocusMode          // verdict at end (auto-computed or user-overridden)
attentionSource: "auto" | "user" // whether the verdict was computed or hand-set
```

`FocusMode = "focus" | "leisure"`. The old `mixed` verdict is being removed (in a sibling branch); the model is binary on both axes so the analysis is a clean 2x2:

| | outcome focus | outcome leisure |
|---|---|---|
| **intent focus** | held the line | **collapse** (started focused, drifted) |
| **intent leisure** | bonus (meant to rest, worked) | honest rest |

The "collapse" cell is the headline metric: "I started in focus but ended in leisure — and it happens this often." Legacy records predating this field are `intendedMode: null` and are **never backfilled** (a fake intent would pollute collapse analysis); the null row is excluded from the 2x2.

Note: in focus mode the distracting sites are blocked, so a collapse leaves little trace in `processBuckets` (active-app seconds) — the blocked browser never loads. Collapse is therefore caught by the **manual label / idle time**, i.e. metacognition (honestly re-labeling to leisure), not by auto-detection.

## Key Decision: no unlock key

There is **no early-unlock button, no cooldown, no timed peek window.** The only exit is the existing Pomodoro **stop** button.

Rationale: stop = abandon the focus block = leisure = unblocked. Wanting to peek means stopping, and stopping is recorded as a give-up. Friction moves from artificial *time* delay to honest *meaning*: you must declare defeat to get out. This also collapses the engineering (no peek state machine) and yields clean data.

Consequence: deterrence shifts from in-the-moment to retrospective. Stop is one click, so the **stats are the enforcement mechanism, not optional polish.** Early-stop must be visible and stinging (count, time-of-break, streak reset).

## Block layers

Two engines, both driven by the same focus signal, both releasing on any exit:

### Site block (hosts)

Blocks at the **domain** level, not per browser — Brave, Chrome, anything is covered at once. hosts distinguishes subdomains, so the blocklist is surgical:

```
0.0.0.0  www.youtube.com
0.0.0.0  youtube.com
# music.youtube.com NOT listed -> music stays allowed
```

This is deliberate: focus mode still permits a browser open for, e.g., YouTube Music, while the video site is dead. The **blocklist is the only lever** — only what is listed is blocked.

### App block (kill-on-sight)

Reuses the existing active-window poll in main (`pollActiveWindow`, 10s interval, already reports `owner.name`/`owner.processId`). During focus, if the **foreground** exe is on the app blocklist, kill it.

**As built (commit 663bdfe):** kill via `taskkill /F /T /PID <pid>` — chosen over `process.kill(pid)` (more reliable for GUI/elevated windows; `/T` tears down the child tree). No UAC needed: `taskkill` works on same-user processes, so unlike the hosts engine there is no elevation step. The kill fires right after the foreground exe is read, **before** the poll's primary-display filter, so a blocked app is killed on any monitor (that filter exists only for the pomodoro active-app telemetry). `ActiveWindowFn` was widened to type `owner.processId` (already present at runtime). Engine lives in `src/main/focus-guard/app-guard.ts`; IPC is `appGuard.enforce(exeList)` / `.release()`.

- Chosen over IFEO registry blocking: no persistent OS mutation, no leftover-on-crash risk (a crashed IFEO entry would lock the app out forever), aligns with "defeatable, not a permanent lock."
- Cost is ~zero: the poll already runs and already fetches the exe; this adds a Set lookup + one kill syscall per tick. Keep the 10s interval — the goal is "launching is pointless, it dies" (a speed bump), not instant-kill. Do not tighten the interval just for this.
- Limits (acceptable): foreground-only (background processes untouched, which matches intent), and the app flickers visible for up to one poll before dying. Keep the app blocklist **narrow** (obvious time-sinks like games) — killing is more aggressive than hosts and can lose unsaved work.

## Failure points addressed

Two diagnosed pains:

- **Mid-session drift** (reflexive hand to a distracting site or app): killed structurally. Site won't load and the app gets killed-on-sight during focus. Zero willpower spent because blocked-is-default.
- **"Just a peek" balloons to an hour**: no peek path exists. Exit = stop = recorded abandonment. The balloon becomes a measurable data point instead of a silent loss.

## Stats integration

Belongs with `feature/stastics-of-pomodoro` and the focus-analysis page. This feature feeds it:

- The intent/outcome 2x2 (above) is the central artifact. `intendedMode` is recorded here; `attention` comes from the existing review flow.
- Tag stop events: **completed** (focus ran out) vs **early-stop** (stopped mid-focus = temptation surrender). Auto-tag by remaining time.
- "focus early-stop" and "collapse" (intent focus -> outcome leisure) are first-class metrics. Block engine and stats share the same event stream.

## Technical shape (FSD)

- `src/main/` — hosts read/write + elevation helper (OS mutation lives in main). **As built (commit 77a7949):** elevation is a *one-time ACL grant*, not per-edit elevation. A bundled PowerShell script (`resources/focus-guard/grant-hosts-access.ps1`, shipped via electron-builder `extraResources`) runs once through a nested `Start-Process -Verb RunAs -Wait` (single UAC prompt) and does `icacls <hosts> /grant "<user>:(M)"`; the username comes from `os.userInfo()` (passed as `-User`) so the grant targets the real user even if a different admin approves the prompt. After the grant, runtime block/unblock are plain no-prompt `fs` writes. Write permission is confirmed by a real-write probe (rewrite hosts with identical content), since `fs.access(W_OK)` is unreliable against NTFS ACLs. Flush DNS after each edit (`ipconfig /flushdns`). Files: `src/main/focus-guard/{site-guard,elevate,ipc}.ts`. App kill reuses the existing `pollActiveWindow` loop (`focus-guard/app-guard.ts`) and needs no elevation.
- `src/preload/` — IPC bridge, mirrored for both engines: `electronAPI.siteGuard.block(domains)` / `.unblock()` and `electronAPI.appGuard.enforce(exeList)` / `.release()`.
- renderer — subscriber that calls enforce/release on focus-mode entry/exit, plus blocklist config UI (sites + apps) and the top-left focus/leisure intent tab. Feature must not import the pomodoro-timer widget (FSD upward import); expose the mode signal via `shared` or wire at the widget composition level.

## Build order

1. **Site engine** (hosts). Validate UAC elevation + hosts write on Win11 *first* — it is the real risk; blocklist logic is trivial by comparison. If elevation can't be obtained the whole design shifts. **Built (commit 77a7949)** as a one-time ACL grant (see Technical shape); Win11 verification pending.
2. **App engine** (kill-on-sight). Hook the kill into the existing poll, mirror the `siteGuard` IPC shape as `appGuard`. **Built (commit 663bdfe)** with `taskkill /F /T /PID` and `appGuard.enforce`/`release`; Win11 verification pending.
3. **Mode**: data + UI (`FocusMode` enum, `intendedMode` field, store version/migrate, focus/leisure tab with per-mode color), then wiring (focus declaration -> both engines enforce; any exit -> release).
4. **Remaining logic**: stats surfacing of the 2x2 / collapse, blocklist config UI polish, edge cases.

## Notes / caveats

- **hosts beats Tailscale**: Windows DNS Client checks hosts before querying any DNS server, so MagicDNS (100.100.100.100) and exit-node routing do not bypass it.
- Real bypass vectors (acceptable for self-discipline use): browser-native DoH, direct-IP access, missing subdomains, app relaunch between polls.
- Re-block must be airtight on focus re-entry: focus start = block + watch immediately, any exit = unblock + stop watch immediately.

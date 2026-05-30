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
- Tag stop events: **completed** (focus ran out) vs **early-stop** (stopped mid-focus = temptation surrender). Auto-tag by remaining time. **As built:** recorded here as an immutable `sessionEndType: "completed" | "early-stop"` on the session record, derived from the exit *path* rather than re-reading a remaining-time number — the only `early-stop` producer is the `stop()` branch that fires while the work timer still has time left; every timer-zero path (`finishWorkPhase`, `skip`, all overtime exits) is `completed`. Threaded like `intendedMode` (snapshotted into `PendingReview`, not user-editable in review). Visualization stays on the sibling branch (decision: this branch ships the data layer only).
- "focus early-stop" and "collapse" (intent focus -> outcome leisure) are first-class metrics. Block engine and stats share the same event stream.

## Technical shape (FSD)

- `src/main/` — hosts read/write + elevation helper (OS mutation lives in main). **As built (commit 77a7949):** elevation is a *one-time ACL grant*, not per-edit elevation. A bundled PowerShell script (`resources/focus-guard/grant-hosts-access.ps1`, shipped via electron-builder `extraResources`) runs once through a nested `Start-Process -Verb RunAs -Wait` (single UAC prompt) and does `icacls <hosts> /grant "<user>:(M)"`; the username comes from `os.userInfo()` (passed as `-User`) so the grant targets the real user even if a different admin approves the prompt. After the grant, runtime block/unblock are plain no-prompt `fs` writes. Write permission is confirmed by a real-write probe (rewrite hosts with identical content), since `fs.access(W_OK)` is unreliable against NTFS ACLs. Flush DNS after each edit (`ipconfig /flushdns`). Files: `src/main/focus-guard/{site-guard,elevate,ipc}.ts`. App kill reuses the existing `pollActiveWindow` loop (`focus-guard/app-guard.ts`) and needs no elevation.
- `src/preload/` — IPC bridge, mirrored for both engines: `electronAPI.siteGuard.block(domains)` / `.unblock()` and `electronAPI.appGuard.enforce(exeList)` / `.release()`.
- renderer — subscriber that calls enforce/release on focus-mode entry/exit, plus blocklist config UI (sites + apps) and the top-left focus/leisure intent tab. Feature must not import the pomodoro-timer widget (FSD upward import); expose the mode signal via `shared` or wire at the widget composition level. **As built (commit 7c61b5e):** the mode signal lives in a new `entities/focus-mode` store (`useFocusModeStore { intendedMode, sessionActive }`) — both the pomodoro widget (writes `sessionActive`, reads `intendedMode` at record time) and the feature (intent tab + controller) sit above entities, so neither needs the widget. `FocusMode` is in `shared/types` for the same reason. The block is gated by a live session signal: `shouldBlock = sessionActive && intendedMode === "focus"`, where the widget publishes `sessionActive = phase === "work" && (isRunning || isOvertime)` **independent of `detectionEnabled`**. A headless `FocusModeController` (mounted at the app root) drives both engines on the `shouldBlock` rising edge and also keeps the active-window poll alive (`notifyPomodoroSessionStarted/Ended`, ref-counted) so app kill fires even with detection off; any exit releases both. The intent tab (`FocusModeTab`, per-mode CVA color, locked while `sessionActive`) is composed into the `dashboard-grid` header (widget -> feature). The blocklist is a persisted `useBlocklistStore` (`focus-blocklist`, sites + apps) seeded from the Phase 1/2 test constants, with a minimal `BlocklistSettings` editor; the debug panels are retained for the pending Win11 verification. Files: `entities/focus-mode/`, `features/focus-mode/{model/use-blocklist-store,ui/FocusModeTab,ui/FocusModeController,ui/BlocklistSettings}.tsx`, `shared/types/focus-mode.ts`.

  **As built (UI relocation, follow-up to 7c61b5e):** the focus/leisure controls moved out of the window chrome and into the pomodoro-timer widget, so all focus-session controls live in one place. `FocusModeTab` now renders at the widget's **top-left** (`absolute top-0 left-0` in `PomodoroClient`) and was removed from the `dashboard-grid` header. The blocklist's global floating panel (`BlocklistSettings`, fixed top-right, collapsible) was replaced by `BlocklistButton` — a `Ban` icon button beside the settings gear at the widget's top-right that opens a `Dialog` with the same sites/apps editor. Editing is **locked while `sessionActive`** (input + add + remove disabled), mirroring the `FocusModeTab` lock: the blocklist is a commitment set by the calm self before starting, immutable mid-session. `App.tsx` no longer mounts the blocklist globally. Files: `BlocklistSettings.tsx` deleted, `features/focus-mode/ui/BlocklistButton.tsx` added; both `FocusModeTab` and `BlocklistButton` are pulled into `PomodoroClient` via the feature client barrel (widget -> feature).

  **As built (Phase 4 — data tag + crash/quit safety net):** two pieces landed. (1) **Stop-event tag:** `SessionEndType` + `sessionEndType` field added to `PomodoroSessionRecord` (`entities/pomodoro-session/model/pomodoro-session.types.ts`); `PendingReview` inherits it via its existing `Omit`. The session-log store bumps v2 -> v3 (legacy records backfilled to `"completed"`, since they store no remaining-time info to reclassify) with `"completed"` as the record default. Set in `use-pomodoro-store.ts`: `buildPendingReview` -> `"completed"`, the `stop()` inline review -> `"early-stop"`, `confirmReview` forwards `pendingReview.sessionEndType`; `recordCompletedWorkSession` inherits the default. The **pomodoro store is not version-bumped** — a `PendingReview` persisted before the change forwards `undefined` and falls back to the `"completed"` default. (2) **Hosts crash/quit safety net** (closes the "any exit = unblock" gap when the app dies mid-focus): `site-guard.ts` gains a synchronous `stripFocusBlockSync()` (win32-only, reuses `stripBlock`, no DNS flush, errors swallowed) called from `app.on("before-quit")` — close-to-tray does not fire `before-quit`, so a hidden session keeps blocking and releases only on real quit. On startup, main calls async `unblock()` (win32-only) after `registerFocusGuardIpc()`, clearing any block left by a prior crash/force-quit — safe because `sessionActive` is ephemeral, so a fresh launch always means "no session". Files: `entities/pomodoro-session/model/{pomodoro-session.types,use-session-log-store}.ts`, `widgets/pomodoro-timer/model/use-pomodoro-store.ts`, `src/main/focus-guard/site-guard.ts`, `src/main/index.ts`. Deferred from the original Phase 4 list: the 2x2/collapse visualization (sibling `feature/stastics-of-pomodoro`) and blocklist UI polish / debug-panel removal (held for the pending Win11 verification).

## Build order

1. **Site engine** (hosts). Validate UAC elevation + hosts write on Win11 *first* — it is the real risk; blocklist logic is trivial by comparison. If elevation can't be obtained the whole design shifts. **Built (commit 77a7949)** as a one-time ACL grant (see Technical shape); Win11 verification pending.
2. **App engine** (kill-on-sight). Hook the kill into the existing poll, mirror the `siteGuard` IPC shape as `appGuard`. **Built (commit 663bdfe)** with `taskkill /F /T /PID` and `appGuard.enforce`/`release`; Win11 verification pending.
3. **Mode**: data + UI (`FocusMode` enum, `intendedMode` field, store version/migrate, focus/leisure tab with per-mode color), then wiring (focus declaration -> both engines enforce; any exit -> release). **Built (commit 7c61b5e):** see the renderer note in Technical shape. Data divergences: the session-log store migrates v1 -> v2 (legacy records get `intendedMode: null`, never backfilled); the **pomodoro store is not version-bumped** — intent is read from `useFocusModeStore` at record time and snapshotted into `PendingReview` at session end (the tab unlocks once the session is over, so the snapshot stops a post-session flip from polluting the deferred review). Default `intendedMode` is `focus`.
4. **Remaining logic**: stats surfacing of the 2x2 / collapse, blocklist config UI polish, edge cases. **Built (Phase 4):** shipped the data-layer slice — the `sessionEndType` (`completed` vs `early-stop`) tag + v3 migration that the stats branch consumes — and the hosts crash/quit safety net (`stripFocusBlockSync` on `before-quit`, startup `unblock`). See the Phase 4 as-built note in Technical shape. Stats visualization deferred to `feature/stastics-of-pomodoro`; blocklist UI polish / debug-panel removal deferred to the pending Win11 verification.

## Notes / caveats

- **hosts beats Tailscale**: Windows DNS Client checks hosts before querying any DNS server, so MagicDNS (100.100.100.100) and exit-node routing do not bypass it.
- Real bypass vectors (acceptable for self-discipline use): browser-native DoH, direct-IP access, missing subdomains, app relaunch between polls.
- Re-block must be airtight on focus re-entry: focus start = block + watch immediately, any exit = unblock + stop watch immediately.

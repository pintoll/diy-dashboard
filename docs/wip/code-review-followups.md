# WIP — Code Review Follow-ups (feature/improve-utilities)

Findings from a recall-oriented review of `main...feature/improve-utilities` (16 commits: desk
model, pomodoro agent-API bridge, `dyd` CLI, pointer-driven drag reorder, auto-updater hardening).
Reviewed at `5e89a51`, working tree clean. Nothing here is fixed yet.

Requested focus was performance and UI, with security as a secondary pass.

**Ordering is by severity, not by effort.** Items 1–2 are silent data-correctness bugs in the
new desk accrual and are the reason this file exists; the rest is real but survivable.

---

## Security — no findings

The new routes (`/api/pomodoro`, `/api/pomodoro/command`, `/api/desk*`) inherit the existing
agent-API defenses and do not weaken any of them. Verified rather than assumed:

- 127.0.0.1 bind, plus a Host-header allowlist that rejects DNS-rebinding requests before routing
  (`agent-api/server.ts`)
- bearer token on every route except `GET /api/health`
- `readJsonBody` caps bodies at 64KB; `matchPattern` wraps `decodeURIComponent` in try/catch
- all SQL parameter-bound. `getTodoTitlesByIds`' dynamic `IN (...)` builds placeholders only and
  binds the values (`todos/crud.ts`)
- `action` and `presetId` are both validated against allowlists (`agent-api/pomodoro-routes.ts`)

Two non-issues noted so they are not re-litigated next session:

- The token compare is not constant-time. Over loopback against a `nanoid(32)` secret this is not
  worth changing.
- `ipcMain.on("pomodoro:bridge:snapshot" | "pomodoro:bridge:command-result")` does not validate
  the sender. Harmless while there is exactly one renderer; revisit if a second window is ever
  added (see item 10, which has the same trigger).

## Verified clean — do not re-review

`lib/reorder-geometry.ts` was checked specifically for the unequal-row-height case flagged in
`backlog.md`. It is correct: `unit` (dragged row height + gap) is the right displacement for every
shifted row regardless of their own heights, because removing the dragged row closes a gap of
exactly that size. Freezing the comparison against pre-drag centers to prevent oscillation is also
correct. The backlog item about adding tests there still stands on its own merits.

---

## 1. Overtime is credited in full to intervals that opened after it began

`src/renderer/src/widgets/pomodoro-timer/model/desk-attribution.ts:78`

`bankInterval` computes `workedSec = blockSec + overtimeSec`. `blockSec` is clamped by the
interval's start (`blockOverlapSec`), but `overtimeSec` is not — every interval still open at
`endBlock` receives the whole overtime total.

Failure: a 25m block ends, overtime runs 50 minutes. At minute 74 the user adds todo C to the desk,
then stops overtime at minute 75. C's interval opens past `phaseEndMs`, so `blockSec = 0`, but it
still banks the full 3000s. C gains 50 minutes for 1 minute of presence.

The two halves of the same formula disagree about whether presence is time-weighted. Clamp the
overtime share by the interval's start against the overtime window, the same way the block share is
clamped against `phaseEndMs`.

Note: the existing test `"a member that only ever exists in overtime banks 0 block seconds"`
(`desk-attribution.test.ts`) asserts exactly this behavior, so it **pins the bug**. Fixing the
engine means rewriting that expectation, not just adding a case.

## 2. `reset()` / `setPreset()` discard an unreviewed session's accrual

`src/renderer/src/widgets/pomodoro-timer/model/use-pomodoro-store.ts:519` (and `:643`)

`stop()` deliberately leaves intervals open so `confirmReview` can bank them once the user has
edited the overtime total. But `reset()` and `setPreset()` both set
`attribution: initialAttribution()` without banking first.

Failure: work 20 minutes on todo T, press Stop (the session-log record is written with
`todoIds: [T]`), then press Reset or switch preset before confirming the review. `attribution` is
wiped; `confirmReview` later sees `sessionId === null` and `endBlock` returns no banks. Focus
analytics shows a 20-minute session on T while `T.worked_sec` never moves.

Reachable remotely too: the agent API allows `reset` unconditionally, so `dyd pomo reset` loses the
same data. Either bank open intervals before discarding, or refuse `reset` while `pendingReview`
is non-null and return `applied: false` from the bridge guard table.

## 3. Widget-to-widget deep import violates the FSD rules

`src/renderer/src/widgets/pomodoro-timer/ui/DeskAttributionController.tsx:2`
`src/renderer/src/widgets/pomodoro-timer/ui/PomodoroBridgeController.tsx:2`

Both do `import { useDashboardStore } from "@/src/widgets/dashboard-grid/model/use-dashboard-store"`.

`.claude/rules/ARCHITECTURE.md` states: *"Dependency Rule: Unidirectional flow only (`app` ->
`widgets` -> `features` -> `entities` -> `shared`). Never import upwards."* and requires consumers
to go through slice entry points (*"Consumer: `import { ... } from "@/widgets/my-widget/server"`"*).
This is a sibling-widget import that additionally reaches past the barrel into `model/`.

Cost: `dashboard-grid`'s internal file layout is now load-bearing for the pomodoro slice, and a
refactor there silently breaks the agent-API bridge. Both controllers only need "the first pomodoro
instance id" — that belongs behind a `widget-registry` or `dashboard-grid` public export, or is
resolved by mounting the controllers from `app/` with the id passed in as a prop.

## 4. Desk removals emit change events on no-ops

`src/main/todos/desk.ts:50` (`removeFromDesk`), `:55` (`clearDesk`)

`addToDesk` guards its `emitTodosChanged` on `info.changes === 1`. The two removal paths emit
unconditionally.

Cost: every no-op `DELETE /api/desk/:id` or repeated clear fires `{reason: "active"}` ->
`use-todo-store`'s debounced listener runs `refresh()` (two IPC round trips: day list + desk) ->
`DeskAttributionController` re-evaluates. An agent polling `dyd todo drop` pays this repeatedly.

Same asymmetry at the API layer: `DELETE /api/desk/:id` returns 200 for an id that is not on the
desk *and* for an id that does not exist, while `POST /api/desk` 404s. `dyd todo drop <typo>`
reports success. Fix both together — gate the emit on `info.changes`, and 404 on an unknown id.

## 5. Desk banner grows one line per member inside a `shrink-0` box

`src/renderer/src/widgets/todo-today/ui/TodoTodayClient.tsx:65`

The "Working" banner renders one `<p>` per desk member with no cap, and its wrapper is
`flex shrink-0`.

Failure: put 6 todos on the desk with the widget at its minimum grid height. The banner takes 6
lines, the `overflow-y-auto` list below collapses to near zero, and `AddTodoForm` plus the footer
are pushed out of view. The pre-desk version was fixed at one line, so this is a regression
introduced by the very feature it displays.

Cap the rendered members (show 2 plus `+N more`) or let the banner scroll.

## 6. Hourly update check can throw on a destroyed window

`src/main/auto-updater.ts:140` (`scheduleUpdateChecks`), `:70` (`reportError`)

`targetWindow` is captured in `initAutoUpdater` and never cleared, and `reportError` calls
`targetWindow?.webContents.send(...)` without an `isDestroyed()` check. The `setInterval` is never
cleared either.

Failure: on quit (or any path that destroys the BrowserWindow while the process lingers) the next
hourly `checkForUpdates()` fails — offline, GitHub 5xx — and `reportError` hits a non-null but
destroyed window. `webContents.send` throws `Object has been destroyed`, which escapes the catch in
`checkForUpdates` and surfaces as an unhandled rejection from `void checkForUpdates()`.

Guard with `targetWindow && !targetWindow.isDestroyed()`, and clear the interval on app quit.

## 7. `updater.log` is appended synchronously with no rotation

`src/main/auto-updater.ts:34`

`writeLog` does an `appendFileSync` per line into one file that is never truncated. With
`RECHECK_INTERVAL_MS = 1h` and an app designed to stay resident in the tray, electron-updater's
checking/resolving/not-available lines are written every hour for the life of the session, each one
blocking the main thread.

Over weeks of uptime the file grows without bound. Either rotate/truncate on a size check, or give
electron-updater a logger that only records `warn`/`error` (the `info` stream is the bulk of it and
the diagnostic value is in the failures).

## 8. Timer math is duplicated across the process boundary

`src/main/agent-api/pomodoro-bridge.ts:80` (`recomputeRemaining`, `recomputeOvertime`)

These are byte-for-byte copies of `computeTimeRemaining` and `getOvertimeElapsed` in
`use-pomodoro-store.ts` (around `:436-448`). The comments say "Mirrors the renderer store's ..."
but nothing enforces it — no shared module, no shared type, no test.

Cost: change the idle-exclusion rule or the flooring in the store and `GET /api/pomodoro` keeps
reporting the old value. `dyd pomo` and any agent reading `remainingSec` drift from what the widget
shows, silently.

Both functions take plain numbers already, so they extract cleanly into one pure module imported by
main and renderer — the same shape the `desk-attribution.ts` split already established.

## 9. Universal `!important` rule toggled at drag start/end

`src/renderer/src/globals.css:122`

`body[data-reordering] *` applies `cursor` and `user-select` with `!important` to every element in
the document.

Cost: the drag itself is carefully rAF-driven and layout-neutral, but
`toggleAttribute("data-reordering")` invalidates matched styles for every node on the page. On a
dashboard with many widgets mounted (grid, charts, finance tables) that is the one synchronous
hitch in the gesture, and it lands on the first frame of the drag.

Scope the rule to the list wrapper and its descendants, or apply it to a single full-screen overlay
element, for the same effect without touching unrelated subtrees.

## 10. Bridge command targets an arbitrary window; a `send` throw leaks the pending entry

`src/main/agent-api/pomodoro-bridge.ts:131`, `:141`

Two separate problems in `sendPomodoroCommand`:

- The target is `BrowserWindow.getAllWindows().find((w) => !w.isDestroyed())`. If a second window
  ever exists (settings, auth), `find()` can pick a renderer with no `PomodoroBridgeController`;
  main then waits out `COMMAND_TIMEOUT_MS` and returns 504 instead of acting.
- If the window is destroyed between the `isDestroyed()` check and the `send`, the throw escapes
  the Promise executor. The `setTimeout` is never cleared and the entry stays in `pending` until it
  fires, so the caller gets a 1.5s-delayed 504 where an immediate 503 is correct.

Track the dashboard window explicitly, and wrap the send in a try/catch that clears the timer,
deletes the pending entry, and rejects with `BridgeNotReadyError`.

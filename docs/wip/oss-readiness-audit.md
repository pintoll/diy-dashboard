# WIP — Open-Source Readiness Audit

Full-repo security/performance/functional review done as prep for open-sourcing
the repo. All 4 publish blockers are resolved (repo is public, PAT revoked +
scrubbed from history, keys are runtime-entered, LICENSE/README shipped). This
doc now tracks only what's still open. Resolved-item history lives in git log,
not here.

Legend: 🟠 high · 🟡 medium.

## 🟠 Security

- **No Content-Security-Policy** (`src/renderer/index.html`). No CSP meta, no
  `onHeadersReceived`. Any future XSS has zero containment and full access to
  the contextBridge IPC surface (finance/todos/focus/settings); no
  `connect-src` limit means localStorage can be exfiltrated. Add a strict CSP
  (`default-src 'self'; connect-src 'self'; object-src 'none'; frame-src
  'none'`), loosened only for the Vite dev server. The directive set needs a
  runtime pass (Vite's inline dev preamble, any external images) in both dev
  and packaged builds before enforcing — not safe to land blind.

## 🟡 Security

- **Persistent hosts ACL grant** (`resources/focus-guard/grant-hosts-access.ps1:13`).
  `icacls hosts /grant User:(M)` permanently gives the user Modify rights on
  the system hosts file, never reverted. Afterward any user-level process
  (malware, a tainted npm postinstall) can rewrite hosts with no UAC. Revert
  on uninstall/teardown, or elevate per-write, and document the trade-off.

- **Gemini key handed to the renderer verbatim** (`src/main/settings/ipc.ts`
  `settings:getGeminiKey`). At-rest storage is `safeStorage`-encrypted, but the
  value is still returned in full over IPC to prefill the Settings dialog; a
  renderer compromise reads it. Fixing it means returning only a set/unset flag
  and losing the prefill UX — decide alongside CSP.

  The FRED half of this item is **resolved**: `settings:getFredKey`/`setFredKey`
  are gone, and the connector credential store that replaced them returns names
  and hosts only (`credentials:list` → `CredentialMeta[]`), never the secret.
  That store is the model for whatever Gemini migrates to.

- **Renderer can force-kill arbitrary processes** (`src/main/focus-guard/app-guard.ts:94`).
  Renderer-supplied exe blocklist drives `taskkill /F /T /PID`. A compromised
  renderer can terminate AV / the shell / any app tree (DoS, defense evasion).

- **Renderer-invokable UAC prompt** (`src/main/focus-guard/ipc.ts:25`
  `focus:site:grant-permission`). No user-gesture requirement; repeated calls
  = prompt fatigue to coax an elevation approval.

## Accepted, not open

The agent API's newer surface (`/api/pomodoro`, `/api/pomodoro/command`, `/api/desk*`) was reviewed
at `5e89a51` and inherits the existing defenses intact — 127.0.0.1 bind, Host-header allowlist,
bearer token on every route but `GET /api/health`, 64KB body cap, all SQL parameter-bound, `action`
and `presetId` allowlisted. Two deliberate exceptions, recorded so they are not re-raised:

- **Token compare is not constant-time.** Over loopback against a `nanoid(32)` secret, not worth
  changing.
- **`ipcMain.on("pomodoro:bridge:snapshot" | "pomodoro:bridge:command-result")` does not validate
  the sender.** Harmless while there is exactly one renderer. Revisit if a second window is ever
  added — the same trigger as the CSP item above, and the command path's explicit window tracking
  does not cover these two listeners.

## 🟡 Functional / robustness

- **No shared schema migration runner**. `pomodoro.db` stamps `PRAGMA
  user_version` (baseline = 1) so its next column add has a version to branch
  on, but there's still no shared migration runner, and the other three DBs
  (`daily-news`, `finance`, `todos`) remain unversioned. Deferred until a real
  migration needs one, so the runner gets exercised rather than shipped dead.

## Windows runtime verification (pending)

Everything below is implemented and static-verified (eslint, `tsc --noEmit`,
`electron-vite build`) but still wants a pass on real Windows hardware — see
[`design/focus-mode.md`](../design/focus-mode.md) for the mechanism these
verify:

- `elevate.ts` PowerShell argument quoting (single-quote escaping for
  `${ps1}`/`${user}`) — was fixed blind, never run against a real elevation
  prompt.
- Hosts-file domain validation + forged-end-marker cleanup in `site-guard.ts`.
- Site block + app kill end-to-end on Win11 (hosts write, `taskkill`
  enforcement, crash/quit safety net).
- Pomodoro hide-to-tray: a phase end while hidden should fire the OS
  notification **and** chime/taskbar flash on time, with exactly one
  notification on re-show (the single phase-end timer is meant to advance
  state before re-open so `syncTime()` doesn't re-fire).
- Overtime-while-hidden: the countdown display freezes while hidden by
  design, but the 5s idle poll should still drive correct overtime elapsed/
  threshold alarms.

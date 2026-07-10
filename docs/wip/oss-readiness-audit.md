# WIP — Open-Source Readiness Audit

Full-repo review (security / performance / functional) done as prep for a future
open-source release. **Not urgent** while the repo stays private and single-user,
but the items below are the debt to clear before publishing. Ranked by severity.

Method: 8 parallel finders (secrets, agent-api, focus-guard command exec, IPC
surface, renderer/CSP, performance, DB integrity, error handling), then dedup +
spot verification of the most severe items against source.

Legend: 🔴 blocker before publish · 🟠 high · 🟡 medium · ⚪ low / informational.

---

## 🔴 Publish blockers

### 1. Hardcoded GitHub PAT in the auto-updater

`src/main/auto-updater.ts:22` embeds a live fine-grained PAT
(`github_pat_11A2DW5IQ0919…`) in the updater feed config. Present in git history
since `e238415`, and extractable from every shipped `.exe` (unpack `app.asar`)
today. Publishing exposes it in HEAD + history.

- Revoke the token now (it is already exposed in released binaries, independent
  of open-sourcing).
- Rewrite history (`git filter-repo`) or start a fresh repo before publishing.
- Redesign updates so no token is needed: a **public releases repo** separate
  from the code repo, or a download proxy.

### 2. FRED (and Gemini) API key baked into the build

`.github/workflows/release.yml:44` injects `secrets.MAIN_VITE_FRED_API_KEY` into
`pnpm build`; electron-vite statically inlines `import.meta.env.MAIN_VITE_FRED_API_KEY`
(`src/main/market/fred-client.ts:34`) as a string literal in `out/main/index.js`.
Every release binary ships the maintainer's key. Same mechanism for the Gemini
fallback at `src/main/settings/store.ts:35`.

- Drop the build-time env key path; use runtime-entered keys only.

### 3. FRED key can't be entered from the dashboard

`SettingsDialog.tsx` only has a Gemini field. FRED has no runtime input, so the
stated goal (all widget keys enterable in-app) is unmet, and packaged installs
have permanently-dead market widgets (macro-indicators, economic-calendar). The
in-widget hint tells users to edit a project-root `.env` that doesn't exist in an
installed app.

- Add FRED (and any future widget key) to settings.json + IPC, wrapped with
  Electron `safeStorage`.

### 4. No LICENSE, empty README, incomplete `.env.example`

`README.md` is 0 bytes; no `LICENSE` file (without one it is legally *not* open
source). `.env.example` documents only FRED, not `MAIN_VITE_GEMINI_API_KEY`. No
setup / key-acquisition / platform-support (focus-guard is Windows-only) / build
docs.

---

## 🟠 Security

Baseline: the renderer has **no CSP** and renders external news content, so most
items below have "if the renderer is compromised" as a realistic precondition.

- 🟠 **No Content-Security-Policy** (`src/renderer/index.html`). No CSP meta, no
  `onHeadersReceived`. Any future XSS has zero containment and full access to the
  contextBridge IPC surface (finance/todos/focus/settings); no `connect-src`
  limit means localStorage can be exfiltrated. `sandbox: false` amplifies blast
  radius. Add a strict CSP (`default-src 'self'; connect-src 'self'; object-src
  'none'; frame-src 'none'`), loosened only for the Vite dev server.

- 🟠 **`shell.openExternal` with no scheme allowlist** (`src/main/index.ts:90`,
  reached from `NewsItem.tsx:18` `window.open(item.url)`). `item.url` is untrusted
  RSS/Gemini data. A crafted feed link can be a UNC/SMB path (NTLM hash leak), an
  `ms-msdt:`/`search-ms:` protocol handler (classic openExternal RCE), or
  `file://`. Allowlist `http:`/`https:` in the handler and validate in `NewsItem`.

- 🟠 **PowerShell argument injection in elevation** (`src/main/focus-guard/elevate.ts:39`).
  `${ps1}` and `${user}` are interpolated into a single-quoted `-ArgumentList`
  then passed to `powershell -Command`. A `'` in the username (`O'Brien`) or
  install path breaks the quoting; crafted metacharacters give code execution
  under the RunAs (elevated) prompt. Pass args via the `execFile` array instead of
  a `-Command` string.

- 🟠 **hosts-file line injection** (`src/main/focus-guard/site-guard.ts:104`).
  `block(domains)` only `.trim().toLowerCase()`s renderer-supplied domains, never
  strips newlines/whitespace; `buildBlock` writes `0.0.0.0\t${domain}` per line.
  A domain like `x\n1.2.3.4 login.mybank.com` injects an arbitrary IP→domain
  mapping (DNS hijack / phishing). Validate each entry against a strict hostname
  regex; reject whitespace/control chars.

- 🟠 **Forged end-marker survives cleanup** (`src/main/focus-guard/site-guard.ts:73`).
  `stripBlock` removes only up to the *first* `BLOCK_END`. A domain that embeds
  the end-marker text leaves attacker lines outside the stripped region, so a
  redirect persists after unblock / quit / restart. Rewrite the managed region
  wholesale instead of marker-splicing, and sanitize `#`/marker text out of
  domains.

- 🟡 **Persistent hosts ACL grant** (`resources/focus-guard/grant-hosts-access.ps1:13`).
  `icacls hosts /grant User:(M)` permanently gives the user Modify rights on the
  system hosts file, never reverted. Afterward any user-level process (malware,
  a tainted npm postinstall) can rewrite hosts with no UAC. Revert on
  uninstall/teardown, or elevate per-write, and document the trade-off.

- 🟡 **Gemini key handed to the renderer** (`src/main/daily-news/ipc.ts:27`
  `settings:getGeminiKey`). The stored secret is returned verbatim over IPC and
  prefilled into the settings input; a renderer compromise reads it. Stored
  plaintext in settings.json + agent-api.json (no `safeStorage`).

- 🟡 **Renderer can force-kill arbitrary processes** (`src/main/focus-guard/app-guard.ts:94`).
  Renderer-supplied exe blocklist drives `taskkill /F /T /PID`. A compromised
  renderer can terminate AV / the shell / any app tree (DoS, defense evasion).

- 🟡 **Renderer-invokable UAC prompt** (`src/main/focus-guard/ipc.ts:25`
  `focus:site:grant-permission`). No user-gesture requirement; repeated calls =
  prompt fatigue to coax an elevation approval.

- 🟡 **agent-api: no Host-header check + unauth `/api/health`** (`src/main/agent-api/server.ts:62`).
  Health leaks version + port with no token, enabling DNS-rebinding recon
  (writes still gated by the bearer token). Reject Host not in
  `{127.0.0.1, localhost}`; don't leak version pre-auth.

- 🟡 **Route param decode can hang the handler** (`src/main/agent-api/router.ts:38`).
  `decodeURIComponent` throws on malformed `%` escapes, outside the try/catch at
  `server.ts:75` → unhandled rejection, no response, client hangs ~300s. Wrap the
  decode to return null on `URIError`.

- 🟡 **Unvalidated IPC inputs**: `show-notification` (`index.ts:109`) passes
  renderer title/body straight into a native `Notification` (system-alert
  spoofing / phishing). `market:fred:getMany` (`market/ipc.ts`) has no length/type
  cap on `seriesIds` → `Promise.all` over a huge array can exhaust the main
  process. Add runtime validation at the IPC boundary generally (no handler
  checks the sender frame or arg shapes at runtime).

- ⚪ **Missing `will-navigate` guard** (`index.ts`) — nothing pins the renderer to
  the app origin. Consider `sandbox: true` (preload is only an IPC bridge).

- ⚪ Correctly assessed as **non-issues** by the finders (recorded so we don't
  re-litigate): non-constant-time token compare (nanoid = 192 bits, no oracle),
  no rate limiting (brute force infeasible), JSON `__proto__` prototype pollution
  (no merge sink; parameterized SQL). Stale comment in `server.ts:145-150` claims
  "no single-instance lock" but `index.ts:34` now takes one — fix the comment.

---

## 🟠 Performance

- 🟠 **`getSettings()` re-reads + parses settings.json on every call**
  (`src/main/settings/store.ts:23`). `getUsdKrwRate()` runs in 5 finance handlers,
  so one FinancePage load does 5 redundant sync disk reads, each blocking the main
  event loop (and thus all IPC). Cache in memory, invalidate on write.

- 🟡 **articles table has no indexes** (`src/main/daily-news/db.ts`). The 30-min
  scheduler does `COUNT(*) WHERE fetched_date=?` and the widget does
  `WHERE fetched_date=? ORDER BY final_score DESC` — full scans + filesort on a
  table that grows forever. Add `idx_articles_fetched_date`.

- 🟡 **`recentMonths()` N+1** (`src/main/finance/summary.ts:75`). Loops
  `monthlySummary()` per month (6, up to 24), recompiling the same CTE and doing a
  separate scan each time. Replace with one `GROUP BY substr(date,1,7)`.

- 🟡 **macro store serializes ~0.5MB per `set()`** (`use-macro-indicators-store.ts`).
  6 series × 1300 points persisted with no `partialize`; every transient
  `set({status:'loading'})` and timeframe click runs `JSON.stringify` + sync
  `localStorage.setItem` (tens of ms main-thread stall).

- 🟡 **Unbounded session log → silent data loss**
  (`src/renderer/src/entities/pomodoro-session/model/use-session-log-store.ts:93`).
  One persisted array, full rewrite on every session end / note edit. At ~5MB
  localStorage quota the persist write throws and is dropped → new sessions stop
  saving silently. Prune/cap, or move to SQLite.

- 🟡 **`backgroundThrottling: false` + hide-to-tray** (`src/main/index.ts:85`).
  Hidden renderer keeps firing the 100ms pomodoro ticker (~864k callbacks/day)
  with no visible output — battery drain Chromium's throttling would have cut
  ~100×.

- 🟡 **FRED: no main-process cache / concurrency cap** (`fred-client.ts:82`).
  Per-instance refetch; 6 + 10 concurrent requests against a 120/min limit, no 429
  backoff. Also the 10s active-window poll (`index.ts:302`) does display-geometry
  + kill-check on the main process and a localStorage rewrite per push.

---

## 🟡 Functional / robustness

- 🟠 **Non-atomic settings write + swallowed read error = permanent loss**
  (`src/main/settings/store.ts:31`). `setSettings` is read-modify-write with a
  direct `writeFileSync` (no temp+rename/fsync); `getSettings` returns `{}` on any
  read error. A crash mid-write → next launch `ensureToken` rewrites the emptied
  file: Gemini key gone, agent token regenerated (breaks external agent configs),
  FX rate reverts to 1380 (silently re-values every USD ledger row). No error
  shown. Write atomically; back up / warn on read failure.

- 🟡 **No schema migration**. All three `db.ts` just `db.exec(SCHEMA)` with
  `CREATE TABLE IF NOT EXISTS`. Adding a column later is a no-op on existing DBs →
  the first INSERT naming it throws at runtime. Add `PRAGMA user_version` +
  migrations.

- 🟡 **daily-news DB missing `PRAGMA foreign_keys = ON`** (`daily-news/db.ts`; the
  other two DBs set it). FK is decorative → orphan feedback rows silently dropped
  from the learning JOIN.

- 🟡 **finance uses local TZ, everything else uses KST** (`src/main/finance/month.ts:66`
  vs `todos/date.ts`, `daily-news/kst.ts`). On a UTC/WSL machine, "this month" is
  wrong between KST midnight and 09:00.

- 🟡 **`dailyNews:fetch` swallows non-key errors** (`src/main/daily-news/ipc.ts:16`).
  Returns an empty result marked success on network/429/RSS failures — user can't
  tell "no news" from "broken".

- 🟡 **`scoreBatch` fabricates score 5 on parse failure** (`src/main/daily-news/ingest.ts:202`).
  Emits every article as `include: true`, score 5, tag `parse_error` —
  indistinguishable from real scores, pollutes the feed and the weekly learning
  loop.

- 🟡 **Weekly decay committed before the Gemini call** (`src/main/daily-news/profile.ts:42`).
  Repeated failures (expired key, outage) bleed interest signals below the
  stability threshold with no learning applied, erasing the profile.

- 🟡 **`archiveAccount` has no zero-balance guard** (`src/main/finance/accounts.ts:76`).
  Archiving a funded account drops net worth with no warning; past transactions
  still count in monthly summaries → inconsistency.

- 🟡 **site-guard failures never surface to the UI**. Starting a session without
  hosts write permission looks active but blocks nothing; a crash/uninstall while
  active leaves `0.0.0.0` entries system-wide (only an app relaunch clears them).

- 🟡 **Korean UI strings in market widgets** (`MacroIndicatorsClient.tsx`,
  `EconomicCalendarClient.tsx`, widget `README.md`). Violates the English-only
  source convention; the FRED empty state is the first onboarding screen and is
  both untranslated and factually wrong for packaged builds.

- ⚪ **Unbounded tables/logs**: `articles`, `interest_signals`, `todo_sessions`,
  the pomodoro session log — no pruning anywhere.

---

## Suggested order when we pick this up

1. Revoke the PAT + rewrite history + redesign updates (blocker 1).
2. Remove build-time keys; make FRED/Gemini runtime-entered + `safeStorage`
   (blockers 2–3).
3. LICENSE + README + `.env.example` (blocker 4).
4. CSP + `openExternal` allowlist + `will-navigate` (renderer-compromise chain).
5. hosts domain validation + `elevate.ts` execFile args.
6. Atomic settings write + schema migrations.
7. Market-widget Korean → English.

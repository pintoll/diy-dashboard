# WIP — Open-Source Readiness Audit

Full-repo review (security / performance / functional) done as prep for a future
open-source release. **Not urgent** while the repo stays private and single-user,
but the items below are the debt to clear before publishing. Ranked by severity.

Method: 8 parallel finders (secrets, agent-api, focus-guard command exec, IPC
surface, renderer/CSP, performance, DB integrity, error handling), then dedup +
spot verification of the most severe items against source.

Legend: 🔴 blocker before publish · 🟠 high · 🟡 medium · ⚪ low / informational
· ✅ fixed.

**Status (2026-07-10):** first fix pass applied on `feature/upgrade-pomodoro`.
Scope: every item that needs **no design decision** *and* **changes no intended
behavior** — marked ✅ inline below. Verified with eslint, `tsc --noEmit` (both
projects), and `electron-vite build`; the focus-guard changes still need the
same Windows runtime pass the feature itself is waiting on. Everything
unmarked either needs a product/design decision (key handling, pruning policy,
error-surfacing UX) or changes observable behavior and should be done
deliberately (CSP, health response, decay ordering, packaging).

**Status (2026-07-11):** second pass on `feature/upgrade-pomodoro` cleared a
batch of the small **behavior-changing robustness** items that were deferred
above (daily-news error surfacing, `scoreBatch` parse-failure, `archiveAccount`
zero-balance guard, site-guard failure surfacing) — marked ✅ inline. Same
verification (eslint, `tsc --noEmit` both projects, `electron-vite build`); the
site-guard UI badge still awaits the pending Windows runtime pass. Key handling,
CSP, LICENSE/README, and the remaining decay/pruning items are still open.

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

- ✅ *Partially fixed (2026-07-10):* `.env.example` now documents
  `MAIN_VITE_GEMINI_API_KEY` and notes that runtime Settings takes precedence.
  LICENSE (license choice) and README content remain open.

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
  *Deferred:* the directive set needs a runtime pass (Vite's inline dev
  preamble, any external images) in both dev and packaged builds before
  enforcing — not safe to land blind.

- ✅ ~~🟠~~ **`shell.openExternal` with no scheme allowlist** (`src/main/index.ts:90`,
  reached from `NewsItem.tsx:18` `window.open(item.url)`). `item.url` is untrusted
  RSS/Gemini data. A crafted feed link can be a UNC/SMB path (NTLM hash leak), an
  `ms-msdt:`/`search-ms:` protocol handler (classic openExternal RCE), or
  `file://`. Allowlist `http:`/`https:` in the handler and validate in `NewsItem`.
  *Fixed 2026-07-10:* window-open handler only forwards `http(s):` to
  `openExternal`; `NewsItem` also checks the scheme before `window.open`.

- ✅ ~~🟠~~ **PowerShell argument injection in elevation** (`src/main/focus-guard/elevate.ts:39`).
  `${ps1}` and `${user}` are interpolated into a single-quoted `-ArgumentList`
  then passed to `powershell -Command`. A `'` in the username (`O'Brien`) or
  install path breaks the quoting; crafted metacharacters give code execution
  under the RunAs (elevated) prompt. Pass args via the `execFile` array instead of
  a `-Command` string.
  *Fixed 2026-07-10:* every interpolated value is single-quote-escaped
  (`psQuote`, `'` → `''` — the only metacharacter inside a PS single-quoted
  literal). Kept the `-Command` structure since `Start-Process -Verb RunAs`
  needs it; needs the pending Windows verification pass.

- ✅ ~~🟠~~ **hosts-file line injection** (`src/main/focus-guard/site-guard.ts:104`).
  `block(domains)` only `.trim().toLowerCase()`s renderer-supplied domains, never
  strips newlines/whitespace; `buildBlock` writes `0.0.0.0\t${domain}` per line.
  A domain like `x\n1.2.3.4 login.mybank.com` injects an arbitrary IP→domain
  mapping (DNS hijack / phishing). Validate each entry against a strict hostname
  regex; reject whitespace/control chars.
  *Fixed 2026-07-10:* entries must match a strict RFC-1123 hostname regex;
  invalid ones are dropped and counted in the diagnostics history message.

- ✅ ~~🟠~~ **Forged end-marker survives cleanup** (`src/main/focus-guard/site-guard.ts:73`).
  `stripBlock` removes only up to the *first* `BLOCK_END`. A domain that embeds
  the end-marker text leaves attacker lines outside the stripped region, so a
  redirect persists after unblock / quit / restart. Rewrite the managed region
  wholesale instead of marker-splicing, and sanitize `#`/marker text out of
  domains.
  *Fixed 2026-07-10:* `stripBlock` now removes the span from the first marker
  line through the last marker line with whole-line marker matching (embedded
  marker text can't terminate the region early); the hostname regex above keeps
  marker/`#` text out of domains in the first place.

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
  ✅ *Host check fixed 2026-07-10:* requests whose Host (port stripped) is not
  `127.0.0.1`/`localhost`/`[::1]` get 403 before any route. The version field in
  unauth `/api/health` is still returned — removing it changes the health
  contract external agents may read, so it's left as a decision.

- ✅ ~~🟡~~ **Route param decode can hang the handler** (`src/main/agent-api/router.ts:38`).
  `decodeURIComponent` throws on malformed `%` escapes, outside the try/catch at
  `server.ts:75` → unhandled rejection, no response, client hangs ~300s. Wrap the
  decode to return null on `URIError`.
  *Fixed 2026-07-10:* malformed escapes now read as a non-matching route (404).

- 🟡 **Unvalidated IPC inputs**: `show-notification` (`index.ts:109`) passes
  renderer title/body straight into a native `Notification` (system-alert
  spoofing / phishing). `market:fred:getMany` (`market/ipc.ts`) has no length/type
  cap on `seriesIds` → `Promise.all` over a huge array can exhaust the main
  process. Add runtime validation at the IPC boundary generally (no handler
  checks the sender frame or arg shapes at runtime).
  ✅ *The two named handlers fixed 2026-07-10:* `show-notification` type-checks
  and caps title (128) / body (512); all three `market:fred:*` handlers validate
  types and cap batch arrays at 50 items. Blanket per-handler runtime validation
  across the rest of the IPC surface is still open.

- ⚪ **Missing `will-navigate` guard** (`index.ts`) — nothing pins the renderer to
  the app origin. Consider `sandbox: true` (preload is only an IPC bridge).
  ✅ *Guard fixed 2026-07-10:* navigation is pinned to the renderer's `file://`
  root (dev: the Vite server URL); everything else is `preventDefault`ed.
  `sandbox: true` not attempted — needs a runtime pass.

- ⚪ Correctly assessed as **non-issues** by the finders (recorded so we don't
  re-litigate): non-constant-time token compare (nanoid = 192 bits, no oracle),
  no rate limiting (brute force infeasible), JSON `__proto__` prototype pollution
  (no merge sink; parameterized SQL). Stale comment in `server.ts:145-150` claims
  "no single-instance lock" but `index.ts:34` now takes one — fix the comment.
  ✅ *Comment fixed 2026-07-10* (now describes the restart-race rationale).

---

## 🟠 Performance

- ✅ ~~🟠~~ **`getSettings()` re-reads + parses settings.json on every call**
  (`src/main/settings/store.ts:23`). `getUsdKrwRate()` runs in 5 finance handlers,
  so one FinancePage load does 5 redundant sync disk reads, each blocking the main
  event loop (and thus all IPC). Cache in memory, invalidate on write.
  *Fixed 2026-07-10:* module-level cache, updated on every write; callers get a
  copy so the cache can't be mutated externally.

- ✅ ~~🟡~~ **articles table has no indexes** (`src/main/daily-news/db.ts`). The 30-min
  scheduler does `COUNT(*) WHERE fetched_date=?` and the widget does
  `WHERE fetched_date=? ORDER BY final_score DESC` — full scans + filesort on a
  table that grows forever. Add `idx_articles_fetched_date`.
  *Fixed 2026-07-10:* `idx_articles_fetched_date(fetched_date, final_score)` in
  the schema (`IF NOT EXISTS`, so existing DBs get it on next launch); serves
  both the count and the reverse-ordered read.

- ✅ ~~🟡~~ **`recentMonths()` N+1** (`src/main/finance/summary.ts:75`). Loops
  `monthlySummary()` per month (6, up to 24), recompiling the same CTE and doing a
  separate scan each time. Replace with one `GROUP BY substr(date,1,7)`.
  *Fixed 2026-07-10:* single range scan grouped by month; the WHERE stays a
  range predicate (index-friendly), months without rows are zero-filled in JS so
  the output shape is unchanged.

- 🟡 **macro store serializes ~0.5MB per `set()`** (`use-macro-indicators-store.ts`).
  6 series × 1300 points persisted with no `partialize`; every transient
  `set({status:'loading'})` and timeframe click runs `JSON.stringify` + sync
  `localStorage.setItem` (tens of ms main-thread stall).
  *Deferred:* `partialize` alone doesn't help — the snapshots *are* the 0.5MB.
  Choosing what to persist (drop snapshots? debounce?) changes reload behavior,
  so it needs a decision.

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

- ✅ ~~🟠~~ **Non-atomic settings write + swallowed read error = permanent loss**
  (`src/main/settings/store.ts:31`). `setSettings` is read-modify-write with a
  direct `writeFileSync` (no temp+rename/fsync); `getSettings` returns `{}` on any
  read error. A crash mid-write → next launch `ensureToken` rewrites the emptied
  file: Gemini key gone, agent token regenerated (breaks external agent configs),
  FX rate reverts to 1380 (silently re-values every USD ledger row). No error
  shown. Write atomically; back up / warn on read failure.
  *Fixed 2026-07-10:* temp-file + fsync + rename; a corrupt-but-present file is
  backed up as `settings.json.corrupt` and logged instead of silently becoming
  `{}`. A user-visible warning UI is still open.

- 🟡 **No schema migration**. All three `db.ts` just `db.exec(SCHEMA)` with
  `CREATE TABLE IF NOT EXISTS`. Adding a column later is a no-op on existing DBs →
  the first INSERT naming it throws at runtime. Add `PRAGMA user_version` +
  migrations.
  *Deferred:* infra addition with no behavior today; best landed together with
  the first real migration so the runner is exercised, not dead code.

- ✅ ~~🟡~~ **daily-news DB missing `PRAGMA foreign_keys = ON`** (`daily-news/db.ts`; the
  other two DBs set it). FK is decorative → orphan feedback rows silently dropped
  from the learning JOIN.
  *Fixed 2026-07-10.* Safe to enable: no code path deletes articles yet, so
  enforcement cannot break existing flows.

- ✅ ~~🟡~~ **finance uses local TZ, everything else uses KST** (`src/main/finance/month.ts:66`
  vs `todos/date.ts`, `daily-news/kst.ts`). On a UTC/WSL machine, "this month" is
  wrong between KST midnight and 09:00.
  *Fixed 2026-07-10:* `currentYm()` now derives from `Asia/Seoul` like the todos
  and daily-news date helpers. No-op on a KST machine.

- ✅ ~~🟡~~ **`dailyNews:fetch` swallows non-key errors** (`src/main/daily-news/ipc.ts:16`).
  Returns an empty result marked success on network/429/RSS failures — user can't
  tell "no news" from "broken".
  *Fixed 2026-07-11:* the handler now re-throws non-key failures (`Could not
  refresh news: …`) instead of falling through to `getTodayNews()`. The widget
  store already treats a thrown error as an error state and keeps cached items,
  so a broken refresh is now distinguishable from an empty feed. The scheduled
  tick keeps its own log-and-swallow (background job, no UI to inform).

- ✅ ~~🟡~~ **`scoreBatch` fabricates score 5 on parse failure** (`src/main/daily-news/ingest.ts:202`).
  Emits every article as `include: true`, score 5, tag `parse_error` —
  indistinguishable from real scores, pollutes the feed and the weekly learning
  loop.
  *Fixed 2026-07-11:* on unparseable Gemini JSON the batch is now dropped (warn
  + return no rows) instead of fabricating scores. Note the downstream filter is
  `tag != "dropped"`, so the old `parse_error`/`include:false` shaping would
  still have leaked into the feed — dropping the batch is the clean fix.

- 🟡 **Weekly decay committed before the Gemini call** (`src/main/daily-news/profile.ts:42`).
  Repeated failures (expired key, outage) bleed interest signals below the
  stability threshold with no learning applied, erasing the profile.
  *Deferred:* fix direction is clear (decay only after a successful call) but it
  changes failure-path learning behavior — do deliberately, not in a
  no-behavior-change pass.

- ✅ ~~🟡~~ **`archiveAccount` has no zero-balance guard** (`src/main/finance/accounts.ts:76`).
  Archiving a funded account drops net worth with no warning; past transactions
  still count in monthly summaries → inconsistency.
  *Fixed 2026-07-11:* `archiveAccount(id, rate)` refuses an account whose
  `computeBalances` figure is non-zero and throws a user-facing message ("Move
  it to another account (or settle the debt) before archiving"), which
  `AccountForm.archive` already surfaces via `ledgerErrorMessage`. `balanceKrw`
  is 0 exactly when the native balance is 0, so the check is rate-independent in
  practice; the IPC handler passes `getUsdKrwRate()`.

- ✅ ~~🟡~~ **site-guard failures never surface to the UI**. Starting a session without
  hosts write permission looks active but blocks nothing; a crash/uninstall while
  active leaves `0.0.0.0` entries system-wide (only an app relaunch clears them).
  *Fixed 2026-07-11 (surfacing half):* `FocusModeController` now reads the
  `block()` diagnostics and stores `lastError` on the focus-mode store; a "Sites
  not blocked" badge (`SiteBlockWarning`) appears next to the focus toggle
  whenever a focus session's hosts write failed, and clears on a clean write.
  The crash/uninstall-leftover half is unchanged — the quit/startup strip still
  clears stale entries, but a hard crash mid-session relies on the next relaunch.
  Needs the pending Windows runtime pass.

- ✅ ~~🟡~~ **Korean UI strings in market widgets** (`MacroIndicatorsClient.tsx`,
  `EconomicCalendarClient.tsx`, widget `README.md`). Violates the English-only
  source convention; the FRED empty state is the first onboarding screen and is
  both untranslated and factually wrong for packaged builds.
  *Fixed 2026-07-10:* macro-indicators client empty state, widget description,
  timeframe labels, and README are English now; the empty state says
  "(development builds)" until the runtime key UI (blocker 3) exists. Correction:
  `EconomicCalendarClient.tsx` had no Korean at fix time — that finder claim was
  stale; a repo-wide Hangul grep now only matches this audit's history.

- ⚪ **Unbounded tables/logs**: `articles`, `interest_signals`, `todo_sessions`,
  the pomodoro session log — no pruning anywhere.

---

## Suggested order when we pick this up

1. Revoke the PAT + rewrite history + redesign updates (blocker 1).
2. Remove build-time keys; make FRED/Gemini runtime-entered + `safeStorage`
   (blockers 2–3).
3. LICENSE + README (blocker 4; ✅ `.env.example` done).
4. CSP (✅ `openExternal` allowlist + `will-navigate` done).
5. ✅ hosts domain validation + `elevate.ts` quoting.
6. Schema migrations (✅ atomic settings write done).
7. ✅ Market-widget Korean → English.

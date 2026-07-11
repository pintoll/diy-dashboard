# DIY Dashboard

A personal desktop dashboard built with Electron. It composes independent
widgets on a draggable, resizable grid: a Pomodoro timer with focus tracking,
market indicators, an AI-curated news feed, a personal ledger, and daily todos.
State is local (localStorage + SQLite under the app's user-data directory); the
only network calls are to the external data APIs you configure.

> Status: single-user hobby project. It runs, but expect rough edges outside the
> author's setup (developed and tested primarily on Windows).

## Features

- **Pomodoro Timer** with presets (25:5, 50:10, 100:20, 120:30) and optional
  active-window detection to label a session focus vs leisure.
- **Focus Analytics** (`/focus-analytics`): intent-vs-outcome breakdown, streaks,
  and per-day drill-down over your logged sessions.
- **Focus Mode blocking** (Windows only): blocks distracting sites (via the
  hosts file, requires elevation) and force-closes configured apps during a
  focus session.
- **Daily News**: an RSS + Gemini pipeline that fetches, scores, and de-dupes
  articles against a self-updating interest profile. Runs locally on a schedule.
- **Macro Indicators** and **Economic Calendar**: FRED-backed market series and
  release calendar.
- **Money Flow** (`/finance`): a double-entry-ish personal ledger with accounts,
  transactions, monthly summaries, and USD/KRW handling.
- **Todo Today** (`/todos`): date-scoped todos, also reachable by a local agent
  over HTTP (see `docs/spec/todos-agent-api.md`).

## Tech Stack

React 19 + TypeScript 5.9 (strict) + Vite 6 + electron-vite 5 + Electron 40 +
React Router 7 + Tailwind 4 + Zustand 5 + Radix UI + react-grid-layout.
Package manager: **pnpm** (via corepack). Local storage: `better-sqlite3`.

The renderer follows a strict Feature-Sliced Design layout; see
`.claude/rules/ARCHITECTURE.md`.

## Getting Started

Prerequisites: Node.js 20+ and pnpm (enable via `corepack enable`).

```bash
pnpm install         # electron-builder rebuilds native deps (better-sqlite3) on postinstall
cp .env.example .env # then fill in the keys you want (see below)
pnpm dev             # Electron dev window with HMR
```

If the native build for `better-sqlite3`/`electron` does not run on install, run
`node node_modules/electron/install.js` (and re-run `pnpm install`) once.

## Configuration (API keys)

Keys are read at build time from `.env` (see `.env.example`). Copy it and fill in
what you need:

- `MAIN_VITE_FRED_API_KEY` — required for the Macro Indicators and Economic
  Calendar widgets. Free key: https://fredaccount.stlouisfed.org/apikey
- `MAIN_VITE_GEMINI_API_KEY` — used by the Daily News pipeline. This is a
  build-time fallback; the Gemini key can also be entered at runtime in
  **Settings**, which takes precedence.

Without a FRED key the market widgets stay empty. Runtime entry of the FRED key
from Settings is not implemented yet, so a packaged build needs the key present
at build time.

## Build

```bash
pnpm build           # electron-vite build -> out/
pnpm preview         # preview the production build
pnpm electron:build  # package with electron-builder -> dist-electron/
pnpm lint            # ESLint
```

No test runner is configured.

## Releases

Tagging `v*` triggers `.github/workflows/release.yml`, which builds the Windows
`.exe` and uploads it to GitHub Releases.

## Platform Support

The app itself is cross-platform (Electron), but the Focus Mode blocking engine
(site + app blocking) is **Windows only** and relies on hosts-file edits with
elevation. Everything else works on any Electron-supported OS, though only
Windows is exercised regularly.

## License

[MIT](LICENSE) (c) 2026 pintoll.

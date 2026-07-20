# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev          # Electron dev with HMR
pnpm build        # electron-vite build (outputs to out/)
pnpm preview      # Preview production build
pnpm lint         # ESLint
pnpm test         # vitest run
pnpm electron:build  # Package with electron-builder
```

Tests are vitest, matched by `src/**/*.test.ts`. The default environment is `node`, since coverage is deliberately limited to pure logic; a file needing a DOM opts in with a `// @vitest-environment jsdom` pragma on line 1. There are no React component tests and no testing-library dependency, so the convention is to extract logic into a pure module and test that.

## Tech Stack

React 19 + TypeScript 5.9 (strict) + Vite 6 + electron-vite 5 + Electron 40 + React Router 7 + Tailwind 4 + Zustand 5 + Radix UI + react-grid-layout. Package manager: **pnpm** (corepack enabled).

## Architecture

FSD rules and naming conventions are defined in `.claude/rules/ARCHITECTURE.md` (auto-loaded).

Electron structure: `src/main/` (main process), `src/preload/` (IPC bridge), `src/renderer/src/` (React app). Config: `electron.vite.config.ts`.

Key slices in renderer: `shared/` (Radix UI kit, types, utilities), `features/manage-widget`, `widgets/dashboard-grid`, `widgets/pomodoro-timer`, `widgets/widget-registry`. Routes: `/` → DashboardGrid.

System tray: close hides to tray, context menu to show/quit. Native notifications via IPC (`window.electronAPI`).

## Widget System

To add a widget:
1. Create slice under `src/renderer/src/widgets/<name>/` with `model/` (types + Zustand store) and `ui/` (component)
2. Use `defineWidget<Config>()` to declare metadata, default config, size constraints, and `ClientComponent`
3. Use `createWidgetStore(instanceId, ...)` for per-instance isolated state with optional persistence + migration
4. Register in `src/renderer/src/widgets/widget-registry/config/widgets.config.ts`
5. Export via `index.ts` and `client.ts`

## Key Patterns

- **Styling**: Tailwind 4 with CVA variants, `cn()` = clsx + tailwind-merge. Dark theme with CSS custom properties in `globals.css`
- **State**: Zustand stores cached by `instanceId` key. Global dashboard state persisted to `dashboard-storage` in localStorage
- **Grid**: Fixed 12-column fluid grid (`GridLayout` from react-grid-layout). Cell width scales continuously with container width; widget `w/h` values are constant grid units regardless of window size. Per-widget `minW/maxW/minH/maxH` constraints declared in `defineWidget`
- **Path alias**: `@/` → `src/renderer` (use `@/src/...` for imports in renderer code)
- **Notifications**: `window.electronAPI` for native OS notifications via IPC, browser Notification API fallback

## Deployment

GitHub Actions builds Windows `.exe` on tag push (`v*`). Workflow: `.github/workflows/release.yml`. Output uploaded to GitHub Releases.

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev          # Dev server on port 3000
pnpm build        # Type-check (tsc -b) + Vite build
pnpm preview      # Preview production build
pnpm lint         # ESLint
```

No test runner is configured.

## Tech Stack

React 19 + TypeScript 5.9 (strict) + Vite 6 + React Router 7 + Tailwind 4 + Zustand 5 + Radix UI + react-grid-layout + vite-plugin-pwa. Package manager: **pnpm** (corepack enabled).

## Architecture

FSD rules and naming conventions are defined in `.claude/rules/ARCHITECTURE.md` (auto-loaded).

Key slices in this repo: `shared/` (Radix UI kit, types, utilities), `features/manage-widget`, `widgets/dashboard-grid`, `widgets/pomodoro-timer`, `widgets/widget-registry`. Routes: `/` → DashboardGrid, `/offline` → OfflinePage.

## Widget System

To add a widget:
1. Create slice under `src/widgets/<name>/` with `model/` (types + Zustand store) and `ui/` (component)
2. Use `defineWidget<Config>()` to declare metadata, default config, size constraints, and `ClientComponent`
3. Use `createWidgetStore(instanceId, ...)` for per-instance isolated state with optional persistence + migration
4. Register in `src/widgets/widget-registry/config/widgets.config.ts`
5. Export via `index.ts` and `client.ts`

## Key Patterns

- **Styling**: Tailwind 4 with CVA variants, `cn()` = clsx + tailwind-merge. Dark theme with CSS custom properties in `globals.css`
- **State**: Zustand stores cached by `instanceId` key. Global dashboard state persisted to `dashboard-storage` in localStorage
- **Grid**: 12-column base, 7 responsive breakpoints (xxl→xxs). Layout scaling + constraint maps per widget
- **Path alias**: `@/` → project root (use `@/src/...` for imports)

## Deployment

Docker multi-stage build (Node 22 Alpine → static-web-server). CI/CD via GitHub Actions to AWS Lightsail on push to `main`.

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Essential Commands

**Development & Building**
- `npm run dev` — Start dev server (Turbopack-powered) on http://localhost:3000
- `npm run build` — Build for production
- `npm start` — Run production server
- `npm run lint` — Run ESLint

## Project Overview

**SAMUR Manual** is a medical reference application for emergency response procedures. It provides searchable procedures, drug information (vademecum), radio codes, hospital locations, and procedure graphs.

The app is built with Next.js 16 (see AGENTS.md for breaking changes), React 19, TypeScript, Tailwind CSS, and uses Turbopack for fast development builds.

## Architecture

### Directory Structure

- **`app/`** — Next.js App Router pages. Each route has a dedicated folder:
  - `manual/` — Procedures index and individual procedure pages
  - `vademecum/` — Drug reference (vademecum)
  - `codigos/` — Radio codes and indicators
  - `mapa/` — Interactive hospital/base map
  - Root `page.tsx` — Home page

- **`components/`** — React components organized by feature:
  - `codigos/` — Codes UI (code lists, filters)
  - `manual/` — Manual UI (sidebar, graph, content display)
  - `mapa/` — Map UI (MapLibre map component)
  - `vademecum/` — Drug UI (filters, search)
  - `shared/` — Reusable: NavBar, ViewportHeightObserver, Sidebar, Search, etc.
  - `ui/` — Shadcn/Radix primitives: Button, Dialog, Toast, etc.

- **`lib/`** — Utilities and hooks:
  - `manual-data.ts` — Procedure content normalization and parsing
  - `content.ts` — Content fetching and cache management
  - `codigos-config.ts`, `vademecum-config.ts` — Feature configs
  - `manual-cookies.ts` — Client-side preference persistence
  - `hooks/` — Custom hooks (use-toast)

- **`content/`** — Markdown procedures and data:
  - `procedures/` — Markdown files numbered (103.md, 201.md, etc.)
  - `data/` — JSON data files: hospitals.json, vademecum.json, codigos-*.json, fluidos.json, etc.

- **`public/`** — Static assets and PWA manifest/service worker

- **`tests/`** — Test files (manual-data.test.ts, viewport.test.ts)

### Key Patterns

**Content Pipeline**: Markdown procedures in `content/procedures/` are loaded, normalized (legacy link rewriting), and rendered. Procedure IDs map to slugs for routing. Related procedures are derived from internal links.

**Data Files**: JSON files in `content/data/` provide codes, drugs, hospitals, perfusions, status codes, etc. Most are imported directly in feature configs.

**UI Composition**: Pages import feature-specific components (ManualSidebar, VademecumList, etc.) which handle filtering/search logic locally. Toast notifications via `use-toast` hook.

**Theming**: next-themes provides light/dark mode. CSS variables defined in globals.css. Tailwind with custom utilities (tw-animate-css).

**Persistence**: Non-critical preferences stored in cookies via `manual-cookies.ts` (recent items, favorites).

## Development Notes

- **Next.js 16 Alert**: This is NOT the Next.js you know. Breaking changes exist. Read `node_modules/next/dist/docs/` before writing new code.
- **Service Worker**: Registered in root layout for PWA support. Worker file at `public/sw.js`.
- **Viewport Observer**: ViewportHeightObserver in layout sets `--viewport-height` CSS variable for mobile vh compensation.
- **No testing framework configured** — tests exist but no runner configured in package.json.
- **TypeScript strict mode enabled** — all files should be fully typed.

## Common Tasks

**Adding a new procedure page**: Place .md in `content/procedures/`, it will be auto-discovered. Links between procedures use markdown `[label](/manual/slug)` format after normalization.

**Adding code datasets**: Add JSON to `content/data/`, import in `lib/codigos-config.ts`, and reference in CodigosView component.

**Updating vademecum**: Edit `content/data/vademecum.json` or `vademecum-comerciales.json`, update import in `lib/vademecum-config.ts`.

**Theming changes**: Edit CSS variables in `app/globals.css`, use Tailwind classes in components.

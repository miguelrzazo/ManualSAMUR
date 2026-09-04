# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Essential Commands

**Development & Building**
- `npm run dev` — Start dev server (Turbopack-powered) on http://localhost:3000
- `npm run build` — Full production build. Chains `sync:docs-public` → `generate:client-data` → `generate-llms` → `next build`
- `npm start` — Run production server
- `npm run lint` — Run ESLint
- `npm test` — Run the test suite (Node's built-in runner over `tests/*.test.ts`)
- `npm run generate:client-data` — Emit the on-demand client datasets into `public/`

**Content sync**
- `npm run sync:manualsamur:detect` — Dry run against the upstream wiki. Writes nothing.
- `npm run sync:manualsamur:apply` — Real sync. Writes procedures and data files.

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
  - `shared/` — Reusable: NavBar, GlobalSearch, BreakingNewsTicker, AppMenu, ThemeToggle, BackToTop, ViewportHeightObserver
  - `ui/` — Shadcn/Radix primitives: Button, Dialog, Toast, etc.

- **`lib/`** — Utilities and hooks:
  - `manual-data.ts` — Procedure content normalization and parsing
  - `content.ts` — Loads/normalizes the corpus. `getAllProcedures()` is memoized at module scope (bypassed when `NODE_ENV === "development"` so content edits hot-reload). Reads `vademecum.json` via `fs` rather than importing it, so the module also runs under plain Node for build scripts.
  - `search.ts` / `global-search.ts` — Fuse.js search. `search.ts` is client-safe and defines `ProcedureSearchDoc`; it must never import `content.ts` (which pulls in `node:fs`).
  - `manual-sync.ts` — Sync metadata, update events, history. Server-only (`node:fs`).
  - `manual-updates-logic.ts` — Pure, client-safe half of the above: `applyNewThisWeek`, `isTickerWithinWindow`, `parseLocalDate`. Exists so client components can use this logic without pulling Node builtins into the browser bundle.
  - `sync-guards.ts` — Plausibility checks that abort a sync before it can emit mass "eliminado" events.
  - `codigos-config.ts`, `vademecum-config.ts` — Feature configs
  - `manual-cookies.ts` — Client-side preference persistence
  - `hooks/` — Custom hooks (`use-toast`, `use-now`)

- **`content/`** — Markdown procedures and data:
  - `procedures/` — 234 markdown files, in 10 section subfolders (`sva/`, `svb/`, `tecnicas/`, `operativos/`, `comunicaciones/`, `psicologicos/`, `administrativos/`, `drp/`, `intervinientes/`, `general/`). Named by ID: `301.md`, `412_01.md`, `drp_01.md`
  - `data/` — JSON data files: hospitals.json, vademecum.json, codigos-*.json, fluidos.json, etc.

- **`public/`** — Static assets and PWA manifest/service worker.
  Note: `search-index.json`, `manual-updates.json`, `manual-history.json`, `llms.txt`, `llms-full.txt`, `procedures/` and `docs/` are **generated at build time** — do not hand-edit them.

- **`tests/`** — 13 test files, run via `npm test`

### Key Patterns

**Content Pipeline**: Markdown procedures in `content/procedures/` are loaded, normalized (legacy link rewriting), and rendered. Procedure IDs map to slugs for routing. Related procedures are derived from internal links.

**Data Files**: JSON files in `content/data/` provide codes, drugs, hospitals, perfusions, status codes, etc. Most are imported directly in feature configs.

**UI Composition**: Pages import feature-specific components (ManualSidebar, VademecumList, etc.) which handle filtering/search logic locally. Toast notifications via `use-toast` hook.

**Theming**: next-themes provides light/dark mode. CSS variables defined in globals.css. Tailwind with custom utilities (tw-animate-css).

**Persistence**: Non-critical preferences stored in cookies via `manual-cookies.ts` (recent items, favorites).

## Development Notes

- **Next.js 16 Alert**: This is NOT the Next.js you know. Breaking changes exist. Read `node_modules/next/dist/docs/` before writing new code.

- **⚠️ Static export: never compare dates on the server.** `next.config.ts` sets `output: "export"`. There is no runtime server, so any `Date.now()` / `new Date()` in a server component or in a module it imports is evaluated **once, at build time**, and the result is frozen into the static HTML until the next deploy. This previously froze every expiry in the UI (the "nuevo" badge showed 117 items 47 days stale; the red ticker stayed up 40 days past its `enabledUntil`). Anything time-dependent must be decided on the client via the `useNow()` hook (`lib/hooks/use-now.ts`), which uses `useSyncExternalStore` so it is hydration-safe. Ship the raw timestamp to the client; never a pre-computed boolean.

- **⚠️ Client/server module split.** Client components must not import `lib/content.ts`, `lib/manual-sync.ts` or anything else that pulls `node:fs`/`node:crypto`. Pure logic those components need lives in `lib/manual-updates-logic.ts` and `lib/search.ts`. `import type` is erased and always safe.

- **⚠️ Watch the client payload.** This is a static site, so anything a server component passes to a `"use client"` component is serialized into **every** page that renders it. Large fields have escaped this way three times: `searchText` via the root layout (4.9 MB/page), the full event list with diffs, and `ManualSyncMetadata.runs` (1.07 MB of sync bookkeeping). Pass narrow types (`ProcedureNavMeta`, `ManualSyncClientMetadata`, `UpdatePillEvent`) and load bulk data on demand from the generated `public/*.json` files. Verify with `grep -o searchText out/manual.html | wc -l` after a build.
- **Service Worker**: Registered in root layout for PWA support. Worker file at `public/sw.js`.
- **Viewport Observer**: ViewportHeightObserver in layout sets `--viewport-height` CSS variable for mobile vh compensation.
- **Testing**: `npm test` runs Node's built-in test runner over `tests/*.test.ts`. CI runs it. Note `tsconfig.json` excludes `tests/**`, so tests are not typechecked.
- **TypeScript strict mode enabled** — all files should be fully typed.

## Common Tasks

**⚠️ Hand-editing a procedure body requires `editorialStatus: "enhanced"`.** The monthly sync rewrites `content/procedures/*.md` wholesale from the wiki (`scripts/sync-manualsamur.ts:627`), so an uncommented manual correction is silently clobbered on the 1st of the month. Setting `editorialStatus: "enhanced"` in the frontmatter makes the sync take `writeProcedureMetadataOnly` instead and preserve your body. The trade-off is real and one-way until you unset it: an `enhanced` procedure **stops receiving upstream body updates entirely** and needs a human to reconcile. The monthly PR report still shows the diff of what changed upstream underneath it, so you can see what you are holding out against. As of PR #55 only `214d` is marked.

**⚠️ A source date bump is not a change.** The wiki republishes pages moving only `sourceUpdated`, with identical content. `classifyProcedureChange` (`lib/manual-sync.ts`) deliberately excludes `sourceUpdated` from its comparison, so those republishes classify as `unchanged`, no file is written, no event is emitted and no PR opens. This means `updated:` in the frontmatter tracks the last *real* content change, which is what the UI claims to show. Do not "fix" this by adding `sourceUpdated` back to the comparison: it previously churned all 230 files monthly and filled `manual-history.json` with 492 empty `revisado` entries out of 500, evicting the real ones. `contentHash` must keep being written — `isDeletionCandidate` (`lib/sync-guards.ts`) needs it non-empty to tell a real deletion from a never-synced import.

**Adding a new procedure page**: Place the .md inside the right section subfolder (e.g. `content/procedures/sva/`) — `walkMarkdownFiles` recurses, and `scripts/lint-procedure-ids.ts` (run in CI) requires the filename stem to equal the `id` frontmatter. Links between procedures use markdown `[label](/manual/slug)` format after normalization.

**Adding code datasets**: Add JSON to `content/data/`, import in `lib/codigos-config.ts`, and reference in CodigosView component.

**Updating vademecum**: Edit `content/data/vademecum.json` or `vademecum-comerciales.json`, update import in `lib/vademecum-config.ts`.

**Theming changes**: Edit CSS variables in `app/globals.css`, use Tailwind classes in components.

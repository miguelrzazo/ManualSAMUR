# Design Spec: Design System Completion + iOS App

**Date:** 2026-05-17  
**Branch:** `feat/design-system-redesign` (web) / new work (iOS)  
**Status:** Approved

---

## Context

The SAMUR Manual app (Next.js 16, React 19, Tailwind CSS v4) is a medical reference tool for emergency responders. A design overhaul branch (`feat/design-system-redesign`) is ~70% complete, applying the SAMUR Academy design system defined in `SAMUR_Academy/DESIGN_SYSTEM.md`. This spec covers:

1. **Completing the web design system** — the remaining 30% of gaps
2. **Building a native iOS app** — React Native + Expo in a monorepo, parity with the web

---

## Part 1: Web — Design System Completion

### What's Already Done (~70%)

- Core accent color tokens (`--color-ambulance-yellow`, `--color-samur-red`, `--color-star-blue`, etc.)
- NavBar: always dark, mono uppercase labels, yellow active state
- Procedure sidebar: yellow active state, section color dots, mono labels
- Procedure content prose: serif headings, table styling, numbered protocol steps
- Light/dark theme toggle

### Remaining Gaps

#### 1. Font: Fraunces → Instrument Serif

Replace `Fraunces` with `Instrument Serif` in `app/layout.tsx` and update `--font-serif`.

```tsx
// app/layout.tsx
import { Instrument_Serif, IBM_Plex_Mono, Inter } from 'next/font/google'

const serif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  variable: '--font-serif',
})
```

Instrument Serif is specified in the design system. It is thinner and more precise than Fraunces — aligned with the "tech premium" aesthetic (Linear, Vercel, Raycast).

#### 2. Missing Semantic CSS Variables

Add to `app/globals.css` under `:root` and `.dark`:

```css
:root {
  --surface: #FFFFFF;
  --surface-elevated: #F8FAFC;
  --text-primary: #0F172A;
  --text-secondary: #64748B;
}
.dark {
  --surface: #081221;
  --surface-elevated: #0D1A2D;
  --text-primary: #F1F5F9;
  --text-secondary: #8CA0B8;
}
```

These are required by the design system for cards, panels, and content areas.

#### 3. bg-grain Texture

Add a noise SVG overlay utility to `app/globals.css`:

```css
.bg-grain {
  position: relative;
}
.bg-grain::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  opacity: 0.045;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E");
  background-repeat: repeat;
  background-size: 200px 200px;
}
```

Apply to: NavBar background (`components/shared/NavBar.tsx`), procedure sidebar dark sections, any container with `bg-sidebar` or `bg-night-blue`.

#### 4. Vademécum Card Redesign

Current vademécum cards use legacy Tailwind color utilities (`bg-violet-100`, `bg-red-100`). Replace with the design system card pattern:

```tsx
<div className="rounded-xl border border-{color}/40 bg-{color}/5 p-4 relative overflow-hidden">
  <div className="absolute top-0 left-4 right-4 h-px bg-{color} opacity-50" />
  <div className="flex items-start justify-between gap-3">
    <span className="font-mono text-[10px] uppercase tracking-widest text-{color}/60">
      {categoria}
    </span>
    <Badge variant="{color}">{via}</Badge>
  </div>
  <h3 className="font-serif text-lg text-text-primary mt-2">{nombre}</h3>
  <p className="font-mono text-xs text-text-secondary mt-1">{descripcion}</p>
</div>
```

Color mapping by `categoria` field from `vademecum.json`:

| Categoría | Token | Hex |
|---|---|---|
| Cardiovascular / Cardíaco | `star-blue` | `#0057B8` |
| Crítico / Emergencia / Anafilaxia | `samur-red` | `#D71920` |
| Analgesia / Sedación | `ia-violet` | `#8B5CF6` |
| Broncodilatador / Respiratorio | `tech-cyan` | `#06B6D4` |
| Anticonvulsivante / Neurológico | `operative-orange` | `#F97316` |
| Otros / Sin categoría | `progress-green` | `#10B981` |

If a drug has no matching category, fall back to `progress-green`.

#### 5. Section Header Pattern

Add `// descripción` mono prefix before section titles across all pages, consistent with the design system:

```tsx
<span className="font-mono text-xs text-text-secondary uppercase tracking-widest">
  {'// procedimientos · circulación'}
</span>
<h2 className="font-serif text-3xl text-text-primary leading-tight">
  Manual SAMUR
</h2>
```

Apply to: Manual index page, Vademécum page, Códigos page.

---

## Part 2: iOS — React Native + Expo

### Monorepo Structure

Migrate the repo to a Turborepo monorepo. The existing Next.js app moves to `apps/web/`. The new Expo app lives at `apps/ios/`. Content and core logic are extracted into shared packages.

```
ManualSAMUR/
├── apps/
│   ├── web/                  ← existing Next.js app (moved)
│   └── ios/                  ← new Expo app
├── packages/
│   ├── core/                 ← @samur/core: types, search (Fuse.js), MD parsing
│   └── content/              ← @samur/content: procedures/, data/ JSON files
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

**Migration path for web:** Move all files under `apps/web/`, update import paths, add `turbo.json`. The web app continues to work identically; `npm run dev` becomes `pnpm turbo dev --filter=web`.

### iOS App — Navigation Structure

```
TabNavigator (bottom, 4 tabs)
├── Manual
│   ├── Search bar (top, persistent)
│   ├── ProcedureList (grouped by section)
│   └── ProcedureDetail (Stack push)
│       └── RelatedProcedures (inline links)
├── Códigos
│   ├── Search bar (top)
│   └── CodesTable (sectioned list)
├── Vademécum
│   ├── Search bar (top)
│   ├── Filter chips (vía, categoría)
│   └── DrugList → DrugDetail (Stack push)
└── Mapa
    └── Apple Maps (react-native-maps)
        └── Hospital/Base annotations
```

Additional features reachable from tabs:
- **Favoritos:** heart icon in tab bar header, sheet modal
- **Historial:** accessible from Manual tab header
- **Abreviaturas:** accessible from Manual tab header (info icon)

### iOS — Tech Stack

| Concern | Solution | Notes |
|---|---|---|
| Framework | Expo SDK 52 + Expo Router v4 | File-based routing, tab + stack |
| Navigation | `expo-router` tabs + native stack | Full native animations |
| Maps | `react-native-maps` (Apple Maps) | Native MapKit |
| Markdown | `react-native-markdown-display` | Shared MD files from `@samur/content` |
| Search | Fuse.js from `@samur/core` | Shared with web |
| Offline | Assets bundled via `@samur/content` | No network required |
| Fonts | `expo-font` | Instrument Serif + IBM Plex Mono |
| Storage | `@react-native-async-storage/async-storage` | Favorites, history, preferences |
| Animations | `react-native-reanimated` + `react-native-gesture-handler` | Native thread animations |
| Icons | `@expo/vector-icons` (SF Symbols on iOS via `SFSymbol`) | Matches iOS HIG |
| Dark mode | `useColorScheme` + design system tokens | Matches system preference |
| Haptics | `expo-haptics` | Feedback on key interactions |
| Widgets | `expo-widgets` (WidgetKit) | Phase 2, not v1 |

### iOS — Design Tokens

The iOS app uses the same color and typography tokens as the web. These are defined in `packages/core/src/tokens.ts` and consumed by both apps.

```ts
// packages/core/src/tokens.ts
export const colors = {
  ambulanceYellow: '#DFFF00',
  samurRed: '#D71920',
  starBlue: '#0057B8',
  progressGreen: '#10B981',
  techCyan: '#06B6D4',
  iaViolet: '#8B5CF6',
  sidebar: '#020817',
  nightBlue: '#07111F',
} as const
```

### iOS — Native Feeling Checklist

- [ ] Swipe-back gesture on all Stack screens (default in Expo Router)
- [ ] `UIBlurEffect` (translucent) tab bar and search bar backgrounds
- [ ] SF Symbols for tab bar icons (Heart, Book, Radio, Map)
- [ ] `expo-haptics` on: favorites toggle, search submission, long-press actions
- [ ] Large title in navbar (iOS `largeTitle` style) for top-level screens
- [ ] Pull-to-refresh on list screens (cosmetic, data is local)
- [ ] `KeyboardAvoidingView` on search screens
- [ ] Contextual menus (long press → share, favorite, copy ID)

### iOS — Offline Data Strategy

All content is bundled at build time from `packages/content/`:
- `procedures/` Markdown files → bundled as assets, parsed at runtime with `@samur/core`
- `data/*.json` → bundled, imported directly
- Map tiles → Apple Maps handles offline caching automatically
- No API calls required; the app works with airplane mode on

### Shared Package: `@samur/core`

Extracted from the current `lib/` folder in the web app:

```
packages/core/src/
├── tokens.ts          ← color/spacing constants
├── types.ts           ← Procedure, Drug, Code, Hospital types
├── search.ts          ← Fuse.js search engine (procedures + drugs + codes)
├── markdown.ts        ← Markdown parsing/normalization
└── index.ts
```

The web app's `lib/manual-data.ts`, `lib/content.ts`, and `lib/vademecum-config.ts` are refactored to use `@samur/core` instead of local implementations.

---

## Scope Note

This spec covers two independent deliverables that should be implemented as **separate plans**:

- **Plan A** — Web design system completion (Phase 1 below). Self-contained, works on the existing branch.
- **Plan B** — iOS app + monorepo migration (Phases 2–3 below). Depends on Plan A being merged, starts a new branch.

---

## Implementation Phases

### Phase 1 — Web design system completion (branch: `feat/design-system-redesign`)
1. Swap Fraunces → Instrument Serif in `app/layout.tsx`
2. Add semantic CSS variables to `app/globals.css`
3. Implement `bg-grain` utility
4. Redesign Vademécum cards
5. Add section header `// código` pattern to Manual, Vademécum, Códigos pages

### Phase 2 — Monorepo migration
1. Initialize Turborepo + pnpm workspaces at root
2. Move web app to `apps/web/`
3. Extract `packages/content/` (procedures + data JSON)
4. Extract `packages/core/` (types, search, markdown parsing)
5. Update web imports to use `@samur/core` and `@samur/content`
6. Verify `pnpm turbo dev --filter=web` works identically

### Phase 3 — iOS app scaffold
1. `npx create-expo-app apps/ios` with TypeScript template
2. Configure Expo Router with 4-tab layout
3. Wire `@samur/content` and `@samur/core` packages
4. Implement Manual tab (list + detail with Markdown)
5. Implement Vademécum tab (search + filter + detail)
6. Implement Códigos tab (tables)
7. Implement Mapa tab (Apple Maps + annotations)
8. Global search bar behavior
9. Favorites + history (AsyncStorage)
10. Abreviaturas modal
11. Design polish: blur effects, SF Symbols, haptics, dark mode

---

## Verification

**Web:**
- `npm run build` passes with 0 TypeScript errors
- Visual check: Instrument Serif renders correctly in procedure headings
- Visual check: grain texture visible on dark NavBar
- Visual check: Vademécum cards use design system token colors
- Light/dark mode toggle works on all updated pages

**iOS:**
- `pnpm turbo dev --filter=ios` opens Expo Go / simulator
- All 4 tabs navigate correctly
- Procedure Markdown renders on iPhone 15 Pro simulator
- Search returns correct results offline (airplane mode)
- Map shows hospital pins
- Dark mode switches with system preference
- Swipe-back gesture works on all detail screens

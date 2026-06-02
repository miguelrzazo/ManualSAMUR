# Web Design System Completion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the remaining ~30% of the SAMUR Academy design system on the `feat/design-system-redesign` branch: font swap, semantic CSS variables, grain texture, Vademécum card redesign, and section header pattern.

**Architecture:** All changes are confined to `app/globals.css`, `app/layout.tsx`, the Vademécum view component, and three page-level components. No new files or dependencies required — only Tailwind class updates and CSS additions.

**Tech Stack:** Next.js 16, Tailwind CSS v4, `next/font/google`, IBM Plex Mono, Instrument Serif, Inter

**Branch:** `feat/design-system-redesign`

---

## File Map

| File | Change |
|---|---|
| `app/layout.tsx` | Swap `Fraunces` → `Instrument_Serif` |
| `app/globals.css` | Add `--surface`/`--text-primary`/`--text-secondary` variables + `bg-grain` utility |
| `components/shared/NavBar.tsx` | Add `bg-grain` class to dark container |
| `components/vademecum/VademecumView.tsx` | Redesign drug card inner markup with design system pattern |
| `app/manual/page.tsx` | Add `// código` section header |
| `app/vademecum/page.tsx` | Add `// código` section header |
| `app/codigos/page.tsx` | Add `// código` section header |

---

## Task 1: Swap Fraunces → Instrument Serif

**Files:**
- Modify: `app/layout.tsx`

- [ ] **Replace the font import**

Open `app/layout.tsx`. Find:
```tsx
import { Fraunces, Inter, IBM_Plex_Mono } from "next/font/google";

const fraunces = Fraunces({
  variable: "--font-serif",
  subsets: ["latin"],
  display: "swap",
  style: ["normal", "italic"],
});
```

Replace with:
```tsx
import { Instrument_Serif, Inter, IBM_Plex_Mono } from "next/font/google";

const instrumentSerif = Instrument_Serif({
  variable: "--font-serif",
  subsets: ["latin"],
  display: "swap",
  weight: "400",
  style: ["normal", "italic"],
});
```

- [ ] **Update the className spread**

Find:
```tsx
className={`${fraunces.variable} ${inter.variable} ${ibmPlexMono.variable}`}
```

Replace with:
```tsx
className={`${instrumentSerif.variable} ${inter.variable} ${ibmPlexMono.variable}`}
```

- [ ] **Verify build passes**

```bash
npm run build
```
Expected: 0 TypeScript errors, no font loading warnings.

- [ ] **Visual check**

```bash
npm run dev
```
Navigate to a procedure page (e.g. `/manual/103`). The headings (h2, h3) should render in a thinner, more refined serif — Instrument Serif — compared to the previous Fraunces.

- [ ] **Commit**

```bash
git add app/layout.tsx
git commit -m "design: swap Fraunces for Instrument Serif per design system spec"
```

---

## Task 2: Add Semantic CSS Variables

**Files:**
- Modify: `app/globals.css`

- [ ] **Add variables to `:root`**

In `app/globals.css`, locate the `:root {` block. Add these lines inside it (after existing variable declarations):

```css
  --surface: #FFFFFF;
  --surface-elevated: #F8FAFC;
  --text-primary: #0F172A;
  --text-secondary: #64748B;
```

- [ ] **Add variables to `.dark`**

Locate the `.dark {` block. Add inside it:

```css
  --surface: #081221;
  --surface-elevated: #0D1A2D;
  --text-primary: #F1F5F9;
  --text-secondary: #8CA0B8;
```

- [ ] **Expose as Tailwind utilities**

In `app/globals.css`, inside the `@theme inline {` block (or add one if absent), add:

```css
  --color-surface: var(--surface);
  --color-surface-elevated: var(--surface-elevated);
  --color-text-primary: var(--text-primary);
  --color-text-secondary: var(--text-secondary);
```

This lets you use `bg-surface`, `text-text-primary`, etc. in Tailwind classes.

- [ ] **Verify build passes**

```bash
npm run build
```
Expected: 0 errors.

- [ ] **Commit**

```bash
git add app/globals.css
git commit -m "design: add --surface, --text-primary, --text-secondary CSS variables"
```

---

## Task 3: bg-grain Texture Utility

**Files:**
- Modify: `app/globals.css`
- Modify: `components/shared/NavBar.tsx`

- [ ] **Add the `.bg-grain` utility to globals.css**

At the bottom of `app/globals.css`, add:

```css
/* Grain texture overlay — apply to dark background containers */
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

- [ ] **Apply grain to the NavBar**

Open `components/shared/NavBar.tsx`. Find the outermost `<nav>` element. It will have a class like `bg-[#020817]` or `bg-sidebar`. Add `bg-grain` to its className:

```tsx
<nav className="... bg-grain">
```

Note: any content inside `<nav>` that needs to appear above the grain overlay must have `relative z-[1]` or `relative` on its wrapper.

- [ ] **Verify no content is hidden behind overlay**

```bash
npm run dev
```
Open the app. Nav items, logo, and search bar should all be fully visible. If any are obscured, add `relative` to their container divs.

- [ ] **Commit**

```bash
git add app/globals.css components/shared/NavBar.tsx
git commit -m "design: add bg-grain texture utility, apply to NavBar"
```

---

## Task 4: Vademécum Card Redesign

**Files:**
- Modify: `components/vademecum/VademecumView.tsx`

The current drug cards use `border-border/60` with no color theming. Replace with the design system card pattern: colored accent bar, colored border/background tint, mono labels, Badge component.

- [ ] **Define color mapping at the top of VademecumView.tsx**

At the top of `components/vademecum/VademecumView.tsx`, after the imports, add:

```tsx
const CATEGORY_COLOR: Record<string, string> = {
  // Cardiovascular / cardiac
  cardiovascular: "star-blue",
  cardíaco: "star-blue",
  "antiarrítmico": "star-blue",
  // Critical / emergency / anaphylaxis
  crítico: "samur-red",
  emergencia: "samur-red",
  anafilaxia: "samur-red",
  vasoactivo: "samur-red",
  // Analgesia / sedation
  analgesia: "ia-violet",
  sedación: "ia-violet",
  "analgésico": "ia-violet",
  // Bronchodilator / respiratory
  broncodilatador: "tech-cyan",
  respiratorio: "tech-cyan",
  // Anticonvulsant / neurological
  anticonvulsivante: "operative-orange",
  neurológico: "operative-orange",
}

function getDrugColor(drug: { categoria?: string; grupo?: string }): string {
  const key = (drug.categoria ?? drug.grupo ?? "").toLowerCase()
  for (const [k, color] of Object.entries(CATEGORY_COLOR)) {
    if (key.includes(k)) return color
  }
  return "progress-green"
}
```

- [ ] **Find the individual drug card render block**

In `VademecumView.tsx`, search for the JSX that renders a single drug entry — it will contain classes like `rounded-xl border border-border/60`. Identify the component or map callback that renders it. It typically looks like:

```tsx
{drugs.map((drug) => (
  <div key={drug.id} className="rounded-xl border border-border/60 overflow-hidden ...">
    ...
  </div>
))}
```

- [ ] **Replace the card markup**

Replace the inner card div for each drug with:

```tsx
{drugs.map((drug) => {
  const color = getDrugColor(drug)
  return (
    <div
      key={drug.id}
      className={`relative rounded-xl border border-${color}/40 bg-${color}/5 p-4 overflow-hidden transition-all duration-200 hover:border-${color}/60 cursor-pointer`}
      onClick={() => setSelectedDrug(drug)}  // keep existing click handler
    >
      {/* Accent bar */}
      <div className={`absolute top-0 left-4 right-4 h-px bg-${color} opacity-50`} />

      {/* Header row */}
      <div className="flex items-start justify-between gap-3 mt-1">
        <span className={`font-mono text-[10px] uppercase tracking-widest text-${color}/70`}>
          {drug.categoria ?? drug.grupo ?? "Fármaco"}
        </span>
        {drug.via && (
          <span className={`font-mono text-[9px] border border-${color}/40 rounded px-1.5 py-0.5 text-${color}/70 uppercase tracking-wide flex-shrink-0`}>
            {drug.via}
          </span>
        )}
      </div>

      {/* Name */}
      <h3 className="font-serif text-lg text-text-primary mt-2 leading-tight">
        {drug.nombre ?? drug.name}
      </h3>

      {/* Description / indication */}
      {(drug.indicacion ?? drug.descripcion) && (
        <p className="font-mono text-xs text-text-secondary mt-1 leading-relaxed line-clamp-2">
          {drug.indicacion ?? drug.descripcion}
        </p>
      )}
    </div>
  )
})}
```

> **Note:** Adjust property names (`drug.nombre`, `drug.indicacion`, etc.) to match the actual shape of `vademecum.json`. Open `content/data/vademecum.json` and check the field names for a single entry before applying.

- [ ] **Verify build passes**

```bash
npm run build
```
Expected: 0 TypeScript errors.

- [ ] **Visual check**

```bash
npm run dev
```
Navigate to `/vademecum`. Cards should now show colored accent bars and tinted backgrounds. Hover state adds a slightly brighter border.

- [ ] **Commit**

```bash
git add components/vademecum/VademecumView.tsx
git commit -m "design: redesign Vademécum cards with design system color pattern"
```

---

## Task 5: Section Headers — Manual Page

**Files:**
- Modify: `app/manual/page.tsx` (or `components/manual/ManualHomeClient.tsx` if the heading lives there)

- [ ] **Locate the heading in the Manual home**

Open `app/manual/page.tsx`. If it delegates to `ManualHomeClient`, open that instead. Find the main page heading — it will be an `<h1>` or `<h2>` like `"Manual SAMUR"`.

- [ ] **Wrap it with the section header pattern**

Replace the standalone heading with:

```tsx
<div className="flex flex-col gap-1 mb-6">
  <span className="font-mono text-xs text-text-secondary uppercase tracking-widest">
    {'// procedimientos · referencia operativa'}
  </span>
  <h1 className="font-serif text-3xl md:text-4xl text-text-primary leading-tight">
    Manual SAMUR
  </h1>
</div>
```

- [ ] **Verify build passes and visual check**

```bash
npm run build && npm run dev
```
Navigate to `/manual`. The heading should now have a small mono prefix line above it.

- [ ] **Commit**

```bash
git add app/manual/page.tsx
git commit -m "design: add section header pattern to Manual page"
```

---

## Task 6: Section Headers — Vademécum and Códigos Pages

**Files:**
- Modify: `app/vademecum/page.tsx`
- Modify: `app/codigos/page.tsx`

- [ ] **Vademécum page heading**

Open `app/vademecum/page.tsx`. Find the main heading. Wrap with:

```tsx
<div className="flex flex-col gap-1 mb-6">
  <span className="font-mono text-xs text-text-secondary uppercase tracking-widest">
    {'// vademécum · referencia farmacológica'}
  </span>
  <h1 className="font-serif text-3xl md:text-4xl text-text-primary leading-tight">
    Vademécum
  </h1>
</div>
```

- [ ] **Códigos page heading**

Open `app/codigos/page.tsx`. Find the main heading. Wrap with:

```tsx
<div className="flex flex-col gap-1 mb-6">
  <span className="font-mono text-xs text-text-secondary uppercase tracking-widest">
    {'// códigos · indicativos operativos'}
  </span>
  <h1 className="font-serif text-3xl md:text-4xl text-text-primary leading-tight">
    Códigos
  </h1>
</div>
```

- [ ] **Verify build passes and visual check**

```bash
npm run build && npm run dev
```
Navigate to `/vademecum` and `/codigos`. Both pages should show the mono prefix above the heading.

- [ ] **Commit**

```bash
git add app/vademecum/page.tsx app/codigos/page.tsx
git commit -m "design: add section header pattern to Vademécum and Códigos pages"
```

---

## Final Verification

- [ ] `npm run build` — 0 errors, 0 TypeScript warnings
- [ ] `npm run lint` — 0 ESLint errors
- [ ] Manual check: Instrument Serif renders in procedure headings (not the previous thicker Fraunces)
- [ ] Manual check: grain texture visible on NavBar (subtle noise, not distracting)
- [ ] Manual check: Vademécum cards show colored accent bars matching drug category
- [ ] Manual check: `/manual`, `/vademecum`, `/codigos` all show mono `//` prefix above main heading
- [ ] Light mode and dark mode both work correctly on all changed pages

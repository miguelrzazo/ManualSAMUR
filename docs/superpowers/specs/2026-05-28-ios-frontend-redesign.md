# iOS Frontend Redesign — Minimal Clinical

**Date:** 2026-05-28  
**Scope:** All 6 UX areas — microinteractions, typography, design system, navigation, empty/loading states, Códigos/Vademécum UX  
**Approach:** View-by-view, highest impact first (Manual → Códigos/Vademécum → shared components)

---

## Context

The current iOS app uses glass morphism cards, scattered magic-number spacing, inconsistent shadow levels, and haptic feedback in only one place. It runs fine but lacks the coherence of a professional medical tool. The goal is a Minimal Clinical redesign: information density over decoration, adaptive light/dark, and tactile polish throughout — without losing the brand identity (Instrument Sans, samurPrimary indigo, section color system).

Primary use context: both emergency lookup (speed, gloves) and study/reference. Design decisions favor fast scanning and large touch targets.

---

## 1. Design System Foundation

**New file: `Views/Shared/DesignSystem.swift`**

```swift
enum Spacing {
    static let xs: CGFloat = 4
    static let sm: CGFloat = 8
    static let md: CGFloat = 12
    static let lg: CGFloat = 16
    static let xl: CGFloat = 24
}

enum Radius {
    static let sm: CGFloat = 8
    static let md: CGFloat = 10   // standard card/list group
    static let lg: CGFloat = 14   // sheets, large surfaces
}

extension View {
    func cardShadow() -> some View {
        self
            .shadow(color: .black.opacity(0.06), radius: 2, y: 1)
            .shadow(color: .black.opacity(0.04), radius: 8, y: 3)
    }
}
```

**Typography addition to `TypographyExtension.swift`:**
- `.samurLabel` — 10pt, weight 700, uppercase, letter-spacing 0.5pt — standard section header style

**Shared `ColorBar` view:**
- 3pt wide, full row height, section color — used in all list rows throughout the app

**Glass cards:** `.samurGlassCard()` stays in `ColorExtension.swift` for the iOS 26 path but is no longer applied to standard list rows. Standard rows use `.background(.background, in: RoundedRectangle(cornerRadius: Radius.md))` + `.cardShadow()`.

**Shared `ProcedureListRow` component** (`Views/Shared/ProcedureListRow.swift`):
```
[ColorBar 3pt] [Title .samurHeadline] [subtitle .samurFootnote secondary]  [trailing: chevron | star]
```
Minimum 44pt height. Used in Recientes, Favoritos, Secciones, search results, historial.

**Shared `SectionGroup` component** (`Views/Shared/SectionGroup.swift`):
- Header: `.samurLabel` style, `.secondary` foreground
- Wraps rows in grouped rounded card with `.cardShadow()`

---

## 2. ManualView Redesign

**File:** `Views/Manual/ManualView.swift`

Rebuilt as `ScrollView { LazyVStack(spacing: Spacing.xl) }`. All glass pills and horizontal scroll carousels removed.

### Scroll order

1. **`BreakingNewsRibbon`** — conditional on `unseenCount > 0`
2. **`SectionGroup("Recientes")`** — `ProcedureListRow` per recent item
3. **`SectionGroup("Favoritos")`** — `ProcedureListRow` per favourite, star trailing
4. **`SectionGroup("Secciones")`** — `ProcedureListRow` per section, procedure count as subtitle
5. **`HistorialButton`** — always present at bottom

### BreakingNewsRibbon

**File:** `Views/Manual/BreakingNewsRibbon.swift`

- Solid `#DC2626` background — no diagonal stripe Canvas drawing, no gradient
- `TimelineView(.animation)` drives a `CGFloat` offset for the marquee effect
- Ticker text: procedure names joined by ` · ` separators, looping
- Tap → calls `markAllSeen()` on `DataStore` → ribbon removes with `.transition(.move(edge: .top).combined(with: .opacity))`, `animation(.spring(response: 0.3))`
- Haptic: `HapticFeedback.warning()` fires once on appear when `unseenCount > 0`

### HistorialButton

- Same height as `ProcedureListRow` (44pt min)
- Clock SF Symbol, "Historial de actualizaciones" label, last-update date trailing
- Red badge showing `unseenCount` when > 0 (clears same moment ribbon clears)
- Tap → presents `HistorialSheet` as `.sheet`

---

## 3. Historial Timeline Sheet

**File:** `Views/Manual/HistorialSheet.swift`  
Replaces existing `HistorialView.swift` (currently a modal).

- Presentation: `.sheet` with `.presentationDetents([.large])` and `.presentationDragIndicator(.visible)`
- Content: `List` with `.listStyle(.insetGrouped)`

### Date grouping

Events grouped by calendar day. Section header: full date string ("5 Mayo 2026"), red + "NUEVO" badge if any entry in the group is unseen.

### Per-entry row

```
[•  unseen dot, red if new / grey if read]
[Procedure number · Name]          [date if different month]
[Inline disclosure: "Ver diff ▼" / "Cerrar ▲"]
```

Tapping the disclosure toggles a diff block below the row (no navigation push):

```
┌─────────────────────────────┐
│ − old line                  │  red tint background, monospace
│ + new line                  │  green tint background, monospace
└─────────────────────────────┘
```

Diff block animates in/out with `.transition(.opacity.combined(with: .move(edge: .top)))`.

Haptic: `HapticFeedback.light()` on diff toggle.

---

## 4. Códigos & Vademécum — Underline Tab Picker

**Files:** `Views/Codigos/CodigosView.swift`, `Views/Vademecum/VademecumView.swift`

Replaces the current matched-geometry-effect pill picker in both views.

**New shared `UnderlineTabPicker` component** (`Views/Shared/UnderlineTabPicker.swift`):

```swift
struct UnderlineTabPicker<T: Hashable>: View {
    let tabs: [(label: String, value: T)]
    @Binding var selection: T
}
```

- `ScrollView(.horizontal, showsIndicators: false)` containing an `HStack`
- Each tab: label text, `.samurSubheadline` weight, `.samurPrimary` color when selected / `.secondary` when not
- Selected tab has a 2pt underline in `.samurPrimary`, animated with `matchedGeometryEffect` on the underline only (not the whole tab)
- Full-width separator line in `.quaternary` runs behind all tabs
- Haptic: `HapticFeedback.selection()` on tab change (extends existing behavior from CodigosView)

**CodigosView list content** below the picker:
- All 12 types → `ProcedureListRow` style rows (code badge monospace left, name, chevron)
- Hospitales/Bases special types → same row style with address as subtitle
- Removes the current grid layout for codes — replaced with plain list for consistency and scannability

**VademecumView** uses `UnderlineTabPicker` for the 4 tabs (Fármacos / Perfusiones / Fluidos / Comerciales). List content unchanged structurally, adopts `ProcedureListRow` style.

---

## 5. Microinteractions & Haptics

**Principle:** every meaningful state change gets a haptic. Every interactive element gets a press scale.

### Haptic map

| Interaction | Feedback |
|---|---|
| Tab picker change (Códigos, Vademécum) | `.selection()` ← already exists |
| Breaking news ribbon appear (unseenCount > 0) | `.warning()` |
| Mark all as seen (tap ribbon or "Revisar") | `.success()` |
| Diff toggle open | `.light()` |
| Favourite toggle on | `.medium()` |
| Favourite toggle off | `.light()` |
| Procedure navigation (push) | `.light()` |
| Scroll-to-top FAB tap | `.rigid()` |
| Search result tap | `.light()` |

### Press scale

`.pressScale()` modifier (already in `ColorExtension.swift`, scales to 0.97) applied to:
- All `ProcedureListRow` instances
- `HistorialButton`
- `BreakingNewsRibbon`
- All card-style tappable containers in Códigos and Vademécum

### Favourite star animation

`star.fill` symbol with `.symbolEffect(.bounce, value: isFavourite)` on toggle. Replaces silent toggle.

---

## 6. Empty & Loading States

**Loading:** `LoadingView.swift` unchanged — already adequate.

**Empty search:** `ContentUnavailableView.search(text:)` already used — no change needed.

**Empty Recientes / Favoritos sections:** sections are hidden entirely when empty (no placeholder rows). Reduces visual noise when the user is new or has cleared history.

**Empty Códigos type:** if a code type has no entries, show `ContentUnavailableView` with SF Symbol matching the type category and a short label ("No hay códigos para este tipo").

**Empty Vademécum search:** `ContentUnavailableView` with `pills.fill` symbol and "No se encontraron fármacos".

---

## 7. Navigation & Transitions

**Tab switching:** no change to `TabView` — system animation is correct.

**Push transitions:** `.navigationTransition(.slide)` added to the root `NavigationStack` in `RootView`. Currently uses default (fade-slide is implicit but `.slide` makes it explicit and consistent).

**Sheet presentations:** all sheets use `.presentationDragIndicator(.visible)` and `.presentationCornerRadius(Radius.lg)` (iOS 16.4+). `HistorialSheet` uses `.large` only. `CodeDetailView` and `DrugDetailView` keep `[.medium, .large]`.

**Scroll-to-top FAB:** existing `arrow.up.circle.fill` button in `ProcedureDetailView` stays. Gains `.pressScale()` and `HapticFeedback.rigid()` on tap.

**Procedure prev/next:** existing bottom nav bar in `ProcedureDetailView` stays. Gains `HapticFeedback.light()` on each navigation step.

---

## Implementation Order

1. `DesignSystem.swift` + `ColorBar` + `ProcedureListRow` + `SectionGroup`
2. `ManualView.swift` — full rebuild
3. `BreakingNewsRibbon.swift` — new component
4. `HistorialSheet.swift` — replaces `HistorialView.swift`
5. `UnderlineTabPicker.swift` — new shared picker
6. `CodigosView.swift` — adopt picker + list rows
7. `VademecumView.swift` — adopt picker + list rows
8. Haptics pass — add to all interactions per map above
9. Empty states — add per-view
10. Navigation polish — transitions, sheet options, FAB haptic

---

## Verification

- Build and run on iPhone 15 simulator (light mode) — check Manual home scroll, ribbon appear/dismiss, historial sheet
- Toggle to dark mode — verify all sections adapt correctly (no hardcoded colors)
- Códigos: cycle through all 12 types via underline picker, verify haptic fires each time
- Vademécum: switch all 4 tabs, open a drug detail sheet
- Favourite a procedure — verify star bounce + haptic
- Open a diff in HistorialSheet — verify animation and monospace diff block
- Search for a procedure, drug, and code — verify `ProcedureListRow` style in results
- Reduce Motion enabled — verify press scale disabled, transitions simplified

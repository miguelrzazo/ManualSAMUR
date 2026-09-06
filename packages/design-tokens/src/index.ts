/**
 * Single source of truth for the mobile app's visual language.
 *
 * Before this file owned the palette there were three of them: the flat `colors`
 * map here, `adaptivePalette` in `apps/mobile/src/accessibility.ts`, and a
 * `DynamicColorIOS` `nativeTheme` inside `App.tsx` — all three claiming the same
 * roles with different hexes. The contrast-tuned adaptive pair won, because it is
 * the only one with a dark variant and the only one whose values were checked
 * against `contrastRatio`.
 *
 * Reach for the palette through `useTheme()`. There is deliberately no flat
 * `colors` export any more: it was a light-only snapshot, and the one consumer
 * that took it (`App.tsx`'s module-level `styles`) is gone.
 */

/**
 * Text colors deliberately stay dark enough on both the light and dark surfaces.
 *
 * `primary*` is the app's identity and interaction colour; `danger*` is reserved
 * for genuine alerts, errors and destructive states. They were one role (`red*`)
 * until the owner asked for a blue identity — collapsing them again would leave
 * an error notice indistinguishable from a code badge.
 *
 * Every text pair below was checked against `contrastRatio` (see
 * `apps/mobile/src/accessibility.ts`) and clears 4.5:1 in both schemes;
 * `lineStrong` clears 3:1 on every surface it borders (WCAG 1.4.11).
 */
export const adaptivePalette = {
  light: {
    paper: "#F1F3F7",
    surface: "#FFFFFF",
    surfaceMuted: "#E7EBF1",
    ink: "#13233D",
    inkMuted: "#52627A",
    /** Decorative hairline separators only. */
    line: "#C9D2DE",
    /** Boundaries that identify a control: inputs, outlined buttons, unselected chips. */
    lineStrong: "#75849B",
    primary: "#1B4FA8",
    primaryDark: "#133A7D",
    primaryAction: "#1B4FA8",
    primaryWash: "#E7EEFA",
    danger: "#B51F2A",
    dangerDark: "#8E1720",
    dangerWash: "#FBEAEC",
    amber: "#8A5200",
    amberWash: "#FFF1D6",
    green: "#12633F",
    greenWash: "#E4F3EB",
    white: "#FFFFFF",
    black: "#000000",
  },
  dark: {
    paper: "#0E1626",
    surface: "#182233",
    surfaceMuted: "#232F44",
    ink: "#F5F7FB",
    inkMuted: "#C1CCDC",
    line: "#46556B",
    lineStrong: "#7E90A8",
    primary: "#8FB6F5",
    primaryDark: "#B8D0FA",
    /**
     * Stays dark because `primary` is a *text* blue here and cannot carry white
     * button text; this is the fill that can.
     */
    primaryAction: "#1A4A9C",
    primaryWash: "#1B2C4A",
    danger: "#FF8A91",
    dangerDark: "#FFB4B8",
    dangerWash: "#45202A",
    amber: "#FFD18A",
    amberWash: "#43371E",
    green: "#7BE2B0",
    greenWash: "#1B3B2E",
    white: "#FFFFFF",
    black: "#000000",
  },
} as const;

export type AdaptivePalette = (typeof adaptivePalette)[keyof typeof adaptivePalette];
export type ColorToken = keyof AdaptivePalette;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radii = {
  sm: 8,
  md: 14,
  lg: 20,
  pill: 999,
} as const;

/**
 * The type scale. Replaces eighteen ad-hoc `fontSize` values and weights ranging
 * 600–900 across the app — three different sizes (31/27/26) were in use for the
 * same page title. Sizes track the iOS text styles they are named after so that
 * `fontScale` behaves predictably; weights stay below 800 because the previous
 * "everything is 800/900" made every screen shout.
 */
export const typography = {
  largeTitle: { fontSize: 34, lineHeight: 41, fontWeight: "700", letterSpacing: 0.37 },
  title1: { fontSize: 28, lineHeight: 34, fontWeight: "700", letterSpacing: 0.36 },
  title2: { fontSize: 22, lineHeight: 28, fontWeight: "700", letterSpacing: -0.26 },
  title3: { fontSize: 20, lineHeight: 25, fontWeight: "600", letterSpacing: -0.45 },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: "600", letterSpacing: -0.43 },
  body: { fontSize: 17, lineHeight: 22, fontWeight: "400", letterSpacing: -0.43 },
  callout: { fontSize: 16, lineHeight: 21, fontWeight: "400", letterSpacing: -0.31 },
  subheadline: { fontSize: 15, lineHeight: 20, fontWeight: "400", letterSpacing: -0.23 },
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: "400", letterSpacing: -0.08 },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: "400", letterSpacing: 0 },
  caption2: { fontSize: 11, lineHeight: 13, fontWeight: "400", letterSpacing: 0.07 },
} as const;

export type TypographyToken = keyof typeof typography;

/**
 * Elevation. Borders that exist only to fake depth become shadows; borders that
 * carry structure (separators, selected states) stay borders.
 */
export const shadows = {
  card: {
    shadowColor: "#0B1728",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  floating: {
    shadowColor: "#0B1728",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 16,
    elevation: 8,
  },
} as const;

/**
 * Motion. Every consumer must still gate on `useReduceMotion()`; these are the
 * durations to use when motion is allowed, not permission to animate.
 */
export const motion = {
  instant: 120,
  fast: 180,
  base: 240,
  slow: 320,
  pressScale: 0.96,
} as const;

/**
 * Vertical space the floating glass tab pill occupies, measured from the bottom
 * safe-area inset. Every scrollable surface must reserve it or its last row ends
 * up behind translucent glass — which is exactly what happened when six screens
 * each hardcoded their own guess (116 / 140 / 140 / 140 / 132 / 100).
 */
export const TAB_BAR_INSET = 112;

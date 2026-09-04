export const colors = {
  ink: "#13233D",
  inkMuted: "#607089",
  paper: "#F7F8FA",
  surface: "#FFFFFF",
  surfaceMuted: "#EEF1F5",
  red: "#D92732",
  redDark: "#AC1C27",
  redWash: "#FCEBED",
  amber: "#C77916",
  amberWash: "#FFF4DF",
  green: "#197A55",
  greenWash: "#E8F6EF",
  line: "#DCE2EA",
  white: "#FFFFFF",
  black: "#000000",
} as const;

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

export type ColorToken = keyof typeof colors;

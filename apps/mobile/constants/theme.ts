import { Appearance, StyleSheet } from "react-native";

const lightPalette = {
  blue: "#0B3A6E",
  blueSoft: "#EAF2FB",
  red: "#D62D2D",
  yellow: "#F5B700",
  ink: "#132238",
  muted: "#64748B",
  border: "#D9E2EE",
  canvas: "#F7FAFC",
  white: "#FFFFFF",
};

const darkPalette: typeof lightPalette = {
  ...lightPalette,
  blueSoft: "#163456",
  ink: "#F4F8FC",
  muted: "#B5C2D2",
  border: "#314158",
  canvas: "#101827",
  white: "#172235",
};

// Match the system appearance at application startup; the Expo Router navigation theme uses the same setting.
export const palette = Appearance.getColorScheme() === "dark" ? darkPalette : lightPalette;

export const commonStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.canvas },
  content: { padding: 16, gap: 12, paddingBottom: 36 },
  card: { backgroundColor: palette.white, borderRadius: 16, borderWidth: 1, borderColor: palette.border, padding: 14, gap: 6 },
  title: { color: palette.ink, fontSize: 20, lineHeight: 26, fontWeight: "700" },
  subtitle: { color: palette.muted, fontSize: 14, lineHeight: 20 },
  label: { color: palette.blue, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: .5 },
});

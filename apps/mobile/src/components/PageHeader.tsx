import React from "react";
import { StyleProp, StyleSheet, Text, TextStyle, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { spacing, typography, type AdaptivePalette } from "@manual-samur/design-tokens";
import { useTheme } from "../theme.tsx";
import { displayTitle } from "../title-case.ts";

/**
 * The tab-screen header.
 *
 * Five copies existed at three different sizes for the same thing (31 / 27 / 26),
 * and CodigosScreen carried it twice in one file, verbatim, once per branch.
 *
 * Two things changed beyond deduplication:
 *
 *  - The red ALL-CAPS letterspaced kicker is gone. "MANUALSAMUR · REFERENCIA",
 *    "MADRID · OFFLINE + ONLINE", "RADIO · CONSULTA LOCAL" and
 *    "FÁRMACOS · PERFUSIONES · FLUIDOS · COMERCIALES" told the user nothing they
 *    could act on; the last one merely listed the tabs rendered directly below
 *    it, and on Vademécum it was clipped by the settings button.
 *  - `trailing` is a fixed-width slot rather than an absolutely positioned
 *    overlay, which is why the settings gear used to land on top of the title on
 *    Inicio and on top of the subtitle on Vademécum.
 */
export function PageHeader({ title, trailing, leading, titleStyle }: {
  title: string;
  trailing?: React.ReactNode;
  leading?: React.ReactNode;
  titleStyle?: StyleProp<TextStyle>;
}) {
  const palette = useTheme();
  const styles = useStyles(palette);
  // With no status bar above it (an iPhone in landscape, or an iPhone Duo pose whose
  // status bar moves to a vertical bar at the side) the top inset is 0 and the title
  // sat 8pt from the display edge, where the rounded corner clipped its first letters.
  const topClearance = useTopClearance(spacing.sm);
  return (
    <View style={[styles.header, topClearance]}>
      {leading}
      <Text style={[styles.title, titleStyle]} numberOfLines={2} accessibilityRole="header">{displayTitle(title)}</Text>
      <View style={styles.trailing}>{trailing}</View>
    </View>
  );
}

const MIN_TOP_CLEARANCE = 20;

/** Extra top padding for a header whose screen has (almost) no top safe-area inset. */
export function useTopClearance(basePadding: number): { paddingTop: number } | undefined {
  const { top } = useSafeAreaInsets();
  return top < MIN_TOP_CLEARANCE ? { paddingTop: MIN_TOP_CLEARANCE - top + basePadding } : undefined;
}

function useStyles(palette: AdaptivePalette) {
  return React.useMemo(() => StyleSheet.create({
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      paddingBottom: spacing.md,
    },
    title: { ...typography.largeTitle, color: palette.ink, flex: 1 },
    trailing: { minWidth: 44, alignItems: "flex-end", justifyContent: "center" },
  }), [palette]);
}

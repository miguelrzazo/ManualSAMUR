import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { spacing, typography, type AdaptivePalette } from "@manual-samur/design-tokens";
import { useTheme } from "../theme.tsx";

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
export function PageHeader({ title, trailing, leading }: {
  title: string;
  trailing?: React.ReactNode;
  leading?: React.ReactNode;
}) {
  const palette = useTheme();
  const styles = useStyles(palette);
  return (
    <View style={styles.header}>
      {leading}
      <Text style={styles.title} numberOfLines={1} accessibilityRole="header">{title}</Text>
      <View style={styles.trailing}>{trailing}</View>
    </View>
  );
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

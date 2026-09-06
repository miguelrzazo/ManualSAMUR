import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { radii, spacing, typography, type AdaptivePalette } from "@manual-samur/design-tokens";
import { animateNextLayout, useReduceMotion } from "../hooks/motion.ts";
import { useTheme } from "../theme.tsx";
import { Press } from "./Press.tsx";

/**
 * Progressive disclosure for copy that must stay in the app verbatim but should
 * not dominate the screen.
 *
 * This exists for the clinical and legal text specifically: the dose
 * calculator's audit trail, the Status 4 transmission note, the source
 * disclaimers. Nothing is deleted and nothing is reworded — the words are one
 * tap away instead of occupying half a screen the user has to scroll past every
 * time. Collapsed content stays in the tree so VoiceOver can still reach it via
 * the expanded state rather than being unmounted.
 */
export function Disclosure({ label, children, tone = "neutral", initiallyOpen = false }: {
  label: string;
  children: React.ReactNode;
  tone?: "neutral" | "caution";
  initiallyOpen?: boolean;
}) {
  const palette = useTheme();
  const styles = useStyles(palette);
  const reduceMotion = useReduceMotion();
  const [open, setOpen] = useState(initiallyOpen);

  return (
    <View style={[styles.container, tone === "caution" && styles.caution]}>
      <Press
        onPress={() => {
          animateNextLayout(reduceMotion);
          setOpen((value) => !value);
        }}
        style={styles.header}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ expanded: open }}
        accessibilityHint={open ? "Oculta el detalle." : "Muestra el detalle completo."}
      >
        {tone === "caution" ? (
          <MaterialCommunityIcons name="alert-circle-outline" size={18} color={palette.amber} />
        ) : null}
        <Text style={[styles.label, tone === "caution" && { color: palette.amber }]}>{label}</Text>
        <MaterialCommunityIcons name={open ? "chevron-up" : "chevron-down"} size={20} color={palette.inkMuted} />
      </Press>
      {open ? <View style={styles.body}>{children}</View> : null}
    </View>
  );
}

function useStyles(palette: AdaptivePalette) {
  return React.useMemo(() => StyleSheet.create({
    container: { borderRadius: radii.md, backgroundColor: palette.surfaceMuted, overflow: "hidden" },
    caution: { backgroundColor: palette.amberWash },
    header: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md, minHeight: 44 },
    label: { ...typography.footnote, fontWeight: "600", color: palette.ink, flex: 1 },
    body: { paddingHorizontal: spacing.md, paddingBottom: spacing.md, gap: spacing.sm },
  }), [palette]);
}

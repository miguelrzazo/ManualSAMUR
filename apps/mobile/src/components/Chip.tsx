import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { radii, spacing, typography, type AdaptivePalette } from "@manual-samur/design-tokens";
import { accessibilityHints } from "../accessibility.ts";
import { selectionTick } from "../hooks/haptics.ts";
import { useTheme } from "../theme.tsx";
import { Press } from "./Press.tsx";

/**
 * One chip, replacing seven style sets that were all `radii.pill` +
 * `surfaceMuted` turning into `ink` when selected: `filterChip`, `categoryChip`,
 * `jumpChip`, `alphabetChip`, `otrosTab`, `secondaryChip` and `districtBaseChip`.
 *
 * `count` renders with tabular figures so a row of chips does not reflow as
 * filtering changes the numbers.
 *
 * `accent` is the tinted variant the Códigos jump row needs: the chip carries its
 * group's identity colour instead of the neutral fill. It is deliberately the only
 * way to get a coloured chip, because the previous alternative — every caller
 * hand-rolling `{ backgroundColor: `${color}22` }` — is how the screen ended up
 * with a coloured pill row and an uncoloured one saying nearly the same words.
 */
export function Chip({ label, selected = false, onPress, icon, count, dotColor, accent, role = "button", accessibilityLabel, accessibilityHint }: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  icon?: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
  count?: number;
  /** Category colour shown as a leading dot, e.g. the manual's section colours. */
  dotColor?: string;
  /** Identity colour applied to the whole chip: tinted fill plus matching label. */
  accent?: string;
  role?: "button" | "tab";
  accessibilityLabel?: string;
  accessibilityHint?: string;
}) {
  const palette = useTheme();
  const styles = useStyles(palette);
  // `paper`, not `white`: in dark mode the selected fill is `ink` (near-white), and a
  // white glyph on it disappears. `labelSelected` already used `paper`; the icon did not.
  const tint = selected ? palette.paper : accent ?? palette.inkMuted;

  return (
    <Press
      onPress={() => {
        selectionTick();
        onPress();
      }}
      style={[
        styles.chip,
        accent && !selected ? { backgroundColor: withAlpha(accent) } : undefined,
        selected && styles.chipSelected,
      ]}
      accessibilityRole={role}
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel ?? (count === undefined ? label : `${label}, ${count}`)}
      accessibilityHint={accessibilityHint ?? (selected ? undefined : accessibilityHints.switchTab)}
    >
      {dotColor ? <View style={[styles.dot, { backgroundColor: dotColor }]} /> : null}
      {icon ? <MaterialCommunityIcons name={icon} size={15} color={tint} /> : null}
      <Text style={[styles.label, accent && !selected ? { color: accent } : undefined, selected && styles.labelSelected]} numberOfLines={1}>{label}</Text>
      {count === undefined ? null : (
        <Text style={[styles.count, accent && !selected ? { color: accent } : undefined, selected && styles.labelSelected]}>{count}</Text>
      )}
    </Press>
  );
}

/** 13% of the accent, the tint the Códigos group chips have always used. */
function withAlpha(color: string): string {
  return `${color}22`;
}

function useStyles(palette: AdaptivePalette) {
  return React.useMemo(() => StyleSheet.create({
    chip: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.xs + 2,
      minHeight: 34,
      paddingHorizontal: spacing.md,
      borderRadius: radii.pill,
      backgroundColor: palette.surfaceMuted,
    },
    chipSelected: { backgroundColor: palette.ink },
    dot: { width: 7, height: 7, borderRadius: 4 },
    label: { ...typography.footnote, fontWeight: "500", color: palette.inkMuted },
    labelSelected: { color: palette.paper },
    count: { ...typography.caption2, color: palette.inkMuted, fontVariant: ["tabular-nums"] },
  }), [palette]);
}

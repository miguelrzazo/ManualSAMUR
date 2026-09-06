import { MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { spacing, typography, type AdaptivePalette } from "@manual-samur/design-tokens";
import { accessibilityTargetStyle } from "../accessibility.ts";
import { useTheme } from "../theme.tsx";
import { displayTitle } from "../title-case.ts";
import { Press } from "./Press.tsx";

/**
 * What `PageHeader` collapses *into* on a downward scroll.
 *
 * The first version of the collapse simply removed the whole header block, and
 * the list then ran straight into the status bar: no title, no boundary, nothing
 * to say which destination you were in. That is not what a collapsing header
 * does on either platform — iOS shrinks a large title into the standard 44pt
 * navigation bar and Material collapses a large top app bar into a small one.
 * The bar stays; only the large type, the search field and the filter rows go.
 *
 * The magnifier is the way back: it restores the full header in place, without
 * scrolling, so the search field is one tap away rather than a scroll away.
 * That is also what keeps the collapsed state from ever locking the reader out
 * of search or the tab switcher.
 */
export function CompactHeader({ title, onExpand, expandLabel = "Mostrar la búsqueda y los filtros" }: {
  title: string;
  onExpand: () => void;
  expandLabel?: string;
}) {
  const palette = useTheme();
  const styles = useStyles(palette);
  return (
    <View style={styles.bar}>
      <Text style={styles.title} numberOfLines={1} accessibilityRole="header">{displayTitle(title)}</Text>
      <Press
        onPress={onExpand}
        style={[styles.action, accessibilityTargetStyle()]}
        accessibilityRole="button"
        accessibilityLabel={expandLabel}
      >
        <MaterialCommunityIcons name="magnify" size={20} color={palette.ink} />
      </Press>
    </View>
  );
}

function useStyles(palette: AdaptivePalette) {
  return React.useMemo(() => StyleSheet.create({
    bar: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      minHeight: 44,
      paddingLeft: spacing.lg,
      paddingRight: spacing.sm,
      backgroundColor: palette.paper,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: palette.line,
    },
    title: { ...typography.headline, color: palette.ink, flex: 1 },
    action: { alignItems: "center", justifyContent: "center" },
  }), [palette]);
}

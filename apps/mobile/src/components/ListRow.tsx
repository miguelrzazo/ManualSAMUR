import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Swipeable } from "react-native-gesture-handler";
import { radii, spacing, typography, type AdaptivePalette } from "@manual-samur/design-tokens";
import { accessibilityHints } from "../accessibility.ts";
import { lightImpact } from "../hooks/haptics.ts";
import { useTheme } from "../theme.tsx";
import { displayTitle } from "../title-case.ts";
import { FavoriteToggle } from "./FavoriteToggle.tsx";
import { Press } from "./Press.tsx";

/**
 * The one list row.
 *
 * Seven near-identical implementations existed across App.tsx, InicioScreen,
 * CodigosScreen, VademecumScreen and MapaScreen, with `minHeight` variously 44,
 * 56, 60, 66 and 70 for rows that read the same. They also all used
 * `borderBottomWidth: 1` on the row itself, which draws a separator under the
 * *last* row of every list — the hanging line visible at the bottom of every
 * screenshot. Separators are now the list's job via `rowSeparator`.
 *
 * Anatomy: [leading badge or icon] [title + meta] [favourite] [chevron].
 */
export type ListRowProps = {
  title: string;
  meta?: string;
  /** Short code shown in a tinted badge, e.g. a procedure id. */
  code?: string;
  icon?: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
  /** Colour of the leading accent bar; omitted means no bar. */
  accent?: string;
  onPress: () => void;
  favorite?: boolean;
  onToggleFavorite?: () => void;
  /** Suppresses the trailing chevron for rows that are not navigational. */
  chevron?: boolean;
  accessibilityLabel?: string;
  trailing?: React.ReactNode;
  numberOfLines?: number;
};

export function ListRow({
  title: rawTitle, meta, code, icon, accent, onPress, favorite, onToggleFavorite,
  chevron = true, accessibilityLabel, trailing, numberOfLines = 2,
}: ListRowProps) {
  const palette = useTheme();
  const styles = useStyles(palette);
  // The corpus shouts: "PARADA CARDIORRESPIRATORIA" sits next to "Cuidados postparada"
  // in the same list. Normalising here rather than at each call site is why the two
  // screens that remembered to call `displayTitle` no longer differ from the four that
  // did not. `displayTitle` is a no-op on anything already deliberately cased.
  const title = displayTitle(rawTitle);

  const row = (
    <View style={styles.row}>
      {accent ? <View style={[styles.accent, { backgroundColor: accent }]} /> : null}
      {code ? (
        <View style={styles.badge}><Text style={styles.badgeText} numberOfLines={1}>{code}</Text></View>
      ) : icon ? (
        <MaterialCommunityIcons name={icon} size={22} color={accent ?? palette.primary} style={styles.icon} />
      ) : null}

      <Press
        onPress={onPress}
        style={styles.main}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? (meta ? `${title}. ${meta}` : title)}
        accessibilityHint={accessibilityHints.openDetail}
      >
        <Text style={styles.title} numberOfLines={numberOfLines}>{title}</Text>
        {meta ? <Text style={styles.meta} numberOfLines={1}>{meta}</Text> : null}
      </Press>

      {trailing}
      {onToggleFavorite ? (
        <FavoriteToggle favorite={Boolean(favorite)} onToggle={onToggleFavorite} title={title} />
      ) : null}
      {chevron ? (
        <MaterialCommunityIcons name="chevron-right" size={20} color={palette.inkMuted} accessibilityElementsHidden importantForAccessibility="no" />
      ) : null}
    </View>
  );

  // The star stays visible on the row; the swipe is an accelerator for people
  // who already know it is there, never the only way to reach the action.
  if (!onToggleFavorite) return row;
  return (
    <Swipeable
      friction={2}
      rightThreshold={40}
      overshootRight={false}
      renderRightActions={() => (
        <View style={[styles.swipeAction, { backgroundColor: favorite ? palette.surfaceMuted : palette.amberWash }]}>
          <MaterialCommunityIcons name={favorite ? "star-off-outline" : "star"} size={24} color={palette.amber} />
        </View>
      )}
      onSwipeableOpen={(direction, swipeable) => {
        if (direction !== "right") return;
        lightImpact();
        onToggleFavorite();
        swipeable.close();
      }}
    >
      {row}
    </Swipeable>
  );
}

/**
 * Hairline separator, inset past the leading badge so it reads as a list rather
 * than a stack of boxes. Pass as `ItemSeparatorComponent`.
 */
export function RowSeparator({ inset = true }: { inset?: boolean }) {
  const palette = useTheme();
  return (
    <View
      style={{
        height: StyleSheet.hairlineWidth,
        backgroundColor: palette.line,
        marginLeft: inset ? spacing.lg + 44 : 0,
      }}
    />
  );
}

function useStyles(palette: AdaptivePalette) {
  return React.useMemo(() => StyleSheet.create({
    row: {
      flexDirection: "row",
      // Centred, which is what fixes the favourite stars sitting above the
      // row's text baseline on every expanded tree row.
      alignItems: "center",
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      minHeight: 60,
      backgroundColor: palette.surface,
    },
    accent: { width: 3, alignSelf: "stretch", marginVertical: spacing.sm, borderRadius: 2 },
    badge: { minWidth: 44, paddingHorizontal: spacing.sm, paddingVertical: 5, borderRadius: radii.sm, backgroundColor: palette.primaryWash, alignItems: "center" },
    badgeText: { ...typography.footnote, fontWeight: "600", color: palette.primary, fontVariant: ["tabular-nums"] },
    icon: { width: 24, textAlign: "center" },
    main: { flex: 1, paddingVertical: spacing.md, justifyContent: "center" },
    title: { ...typography.callout, fontWeight: "500", color: palette.ink },
    meta: { ...typography.footnote, color: palette.inkMuted, marginTop: 2 },
    swipeAction: { width: 76, alignItems: "center", justifyContent: "center" },
  }), [palette]);
}

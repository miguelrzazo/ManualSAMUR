import { MaterialCommunityIcons } from "@expo/vector-icons";
import { radii, spacing, typography, type AdaptivePalette } from "@manual-samur/design-tokens";
import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { ManualUpdateEvent } from "../manual-tree-logic.ts";
import { buildProcedureHistoryModel, type ProcedureHistoryItem } from "../procedure-history-logic.ts";
import { useTheme } from "../theme.tsx";
import { UpdateDiff } from "./UpdateDiff.tsx";

export interface ProcedureHistorySectionProps {
  procedureId?: string;
  predicate?: (event: ManualUpdateEvent) => boolean;
  updates: unknown | readonly ManualUpdateEvent[];
}

/**
 * Procedure-local history derived from the package-wide event stream.
 * The section is intentionally always present so an empty history is an
 * explicit content state rather than an apparently missing feature.
 */
export function ProcedureHistorySection({ procedureId, predicate, updates }: ProcedureHistorySectionProps) {
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const model = useMemo(
    () => buildProcedureHistoryModel(updates, predicate ?? procedureId ?? (() => false)),
    [predicate, procedureId, updates],
  );

  return (
    <View style={styles.section} accessibilityLabel={model.title}>
      <Text style={styles.title} accessibilityRole="header">{model.title}</Text>
      {model.items.length === 0 ? (
        <View style={styles.emptyCard}>
          <MaterialCommunityIcons name="history" size={21} color={palette.inkMuted} />
          <Text style={styles.emptyText}>{model.emptyMessage}</Text>
        </View>
      ) : (
        <View style={styles.list} accessibilityLiveRegion="polite">
          {model.items.map((item) => (
            <ProcedureHistoryRow key={item.event.eventId} item={item} palette={palette} styles={styles} />
          ))}
        </View>
      )}
    </View>
  );
}

function ProcedureHistoryRow({
  item,
  palette,
  styles,
}: {
  item: ProcedureHistoryItem;
  palette: AdaptivePalette;
  styles: ReturnType<typeof createStyles>;
}) {
  const badge = badgeColors(item.event.changeKind, palette);

  return (
    <View style={styles.row}>
      <View style={styles.metadata}>
        <Text style={[styles.badge, { color: badge.foreground, backgroundColor: badge.background }]}>
          {item.changeLabel}
        </Text>
        <Text style={styles.date}>{item.date}</Text>
      </View>
      <Text style={styles.summary}>{item.event.summary}</Text>
      {item.diff ? <UpdateDiff diff={item.diff} palette={palette} compact /> : null}
    </View>
  );
}

function badgeColors(changeKind: string, palette: AdaptivePalette) {
  switch (changeKind.toLocaleLowerCase("es")) {
    case "nuevo":
      return { foreground: palette.green, background: palette.greenWash };
    case "revisado":
      return { foreground: palette.amber, background: palette.amberWash };
    case "eliminado":
      return { foreground: palette.danger, background: palette.dangerWash };
    default:
      return { foreground: palette.primary, background: palette.primaryWash };
  }
}

function createStyles(palette: AdaptivePalette) {
  return StyleSheet.create({
    section: { marginBottom: spacing.xl },
    title: { ...typography.caption2, color: palette.primary, fontWeight: "700", letterSpacing: 1.4, marginBottom: spacing.sm, textTransform: "uppercase" },
    list: { backgroundColor: palette.surface, borderRadius: radii.md, borderWidth: 1, borderColor: palette.line, overflow: "hidden" },
    row: { padding: spacing.md, gap: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.line },
    metadata: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
    badge: { ...typography.caption, fontWeight: "700", overflow: "hidden", borderRadius: radii.pill, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
    date: { ...typography.caption, color: palette.inkMuted },
    summary: { ...typography.body, color: palette.ink },
    diffButton: { minHeight: 44, flexDirection: "row", alignItems: "center", alignSelf: "stretch", justifyContent: "space-between" },
    diffButtonText: { ...typography.footnote, color: palette.primary, fontWeight: "600" },
    diff: { ...typography.footnote, color: palette.ink, backgroundColor: palette.surfaceMuted, borderRadius: radii.sm, padding: spacing.md },
    emptyCard: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: palette.surface, borderRadius: radii.md, borderWidth: 1, borderColor: palette.line, paddingHorizontal: spacing.md },
    emptyText: { ...typography.body, color: palette.inkMuted, flex: 1 },
  });
}

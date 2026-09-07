import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { radii, spacing, typography } from "@manual-samur/design-tokens";
import { Press } from "../components/Press.tsx";
import { UpdateDiff } from "../components/UpdateDiff.tsx";
import { applyManualRecencyWindow, asManualUpdateEvents, groupManualEventsByDate, manualNovedades, sortManualHistorial, type ManualUpdateEvent } from "../manual-tree-logic.ts";
import { useContent } from "../content.tsx";
import { usePreferences } from "../preferences.tsx";
import { useTheme, useThemedStyles } from "../theme.tsx";
import type { RootStackParamList } from "../navigation-types.ts";

type Props = NativeStackScreenProps<RootStackParamList, "Historial">;
type HistoryTab = "novedades" | "historial";

export function HistorialScreen({ navigation }: Props) {
  const palette = useTheme();
  const styles = useThemedStyles(createStyles);
  const { content } = useContent();
  const { seenEventIds, markEventSeen } = usePreferences();
  const [tab, setTab] = useState<HistoryTab>("novedades");
  const events = useMemo(() => asManualUpdateEvents(content.updates), [content.updates]);
  const recentEvents = useMemo(() => manualNovedades(applyManualRecencyWindow(events)), [events]);
  const historyEvents = useMemo(() => sortManualHistorial(events), [events]);
  const groups = useMemo(() => groupManualEventsByDate(recentEvents), [recentEvents]);
  const seen = useMemo(() => new Set(seenEventIds), [seenEventIds]);
  const unreadCount = recentEvents.filter((event) => !seen.has(event.eventId)).length;

  const openEvent = (event: ManualUpdateEvent) => {
    markEventSeen(event.eventId);
    if (event.category === "codigo" && event.routeKey) navigation.push("Code", { routeKey: event.routeKey });
    else if (event.procedureIds[0]) navigation.push("Procedure", { id: event.procedureIds[0] });
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic">
      <View style={styles.headingRow}>
        <View style={styles.headingCopy}>
          <Text style={styles.eyebrow}>ACTUALIZACIONES</Text>
          <Text style={styles.title}>Historial de actualizaciones</Text>
          <Text style={styles.subtitle}>Cambios relevantes del manual y sus códigos.</Text>
        </View>
        <View style={styles.inboxCount}><Text style={styles.inboxNumber}>{unreadCount}</Text><Text style={styles.inboxLabel}>sin leer</Text></View>
      </View>
      <View style={styles.tabs} accessibilityRole="tablist">
        <Press onPress={() => setTab("novedades")} style={[styles.tab, tab === "novedades" && styles.tabActive]} accessibilityRole="tab" accessibilityState={{ selected: tab === "novedades" }}><Text style={[styles.tabText, tab === "novedades" && styles.tabTextActive]}>Novedades · {recentEvents.length}</Text></Press>
        <Press onPress={() => setTab("historial")} style={[styles.tab, tab === "historial" && styles.tabActive]} accessibilityRole="tab" accessibilityState={{ selected: tab === "historial" }}><Text style={[styles.tabText, tab === "historial" && styles.tabTextActive]}>Historial · {historyEvents.length}</Text></Press>
      </View>
      {tab === "novedades" ? groups.map((group) => <View key={group.date} style={styles.group}><Text style={styles.date}>{group.date}</Text>{group.events.map((event) => <HistoryEvent key={event.eventId} event={event} unread={!seen.has(event.eventId)} onOpen={() => openEvent(event)} palette={palette} styles={styles} />)}</View>) : historyEvents.map((event) => <HistoryEvent key={event.eventId} event={event} unread={!seen.has(event.eventId)} onOpen={() => openEvent(event)} palette={palette} styles={styles} showDate />)}
      {((tab === "novedades" && groups.length === 0) || (tab === "historial" && historyEvents.length === 0)) && <Text style={styles.empty}>No hay cambios relevantes para mostrar.</Text>}
    </ScrollView>
  );
}

function HistoryEvent({ event, unread, onOpen, palette, styles, showDate = false }: { event: ManualUpdateEvent; unread: boolean; onOpen: () => void; palette: ReturnType<typeof useTheme>; styles: ReturnType<typeof createStyles>; showDate?: boolean }) {
  const kindColor = event.changeKind === "nuevo" ? palette.green : event.changeKind === "eliminado" ? palette.danger : palette.primary;
  const body = <><View style={[styles.kindDot, { backgroundColor: kindColor }]} /><View style={styles.eventCopy}><View style={styles.eventHeader}><Text style={[styles.kind, { color: kindColor }]}>{event.category === "codigo" ? "Código" : event.changeKind}</Text>{showDate && <Text style={styles.eventDate}>{(event.approvedAt ?? event.effectiveDate).slice(0, 10)}</Text>}</View><Text style={styles.summary}>{event.summary}</Text>{event.diff ? <UpdateDiff diff={event.diff} palette={palette} compact /> : null}</View></>;
  return <Press onPress={onOpen} style={[styles.event, unread && styles.eventUnread]} accessibilityRole="button" accessibilityLabel={`${event.summary}${unread ? ", sin leer" : ""}`}>
    {body}
  </Press>;
}

function createStyles(palette: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: palette.paper },
    content: { padding: spacing.lg, paddingBottom: 120, gap: spacing.md },
    headingRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
    headingCopy: { flex: 1 },
    eyebrow: { color: palette.primary, fontSize: 11, fontWeight: "900", letterSpacing: 1.2 },
    title: { ...typography.title1, color: palette.ink, marginTop: spacing.sm },
    subtitle: { ...typography.subheadline, color: palette.inkMuted, marginTop: spacing.xs },
    inboxCount: { alignItems: "flex-end" },
    inboxNumber: { color: palette.danger, fontSize: 30, lineHeight: 32, fontWeight: "900" },
    inboxLabel: { color: palette.inkMuted, fontSize: 11, fontWeight: "800" },
    tabs: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: palette.line },
    tab: { flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", borderBottomWidth: 2, borderBottomColor: "transparent" },
    tabActive: { borderBottomColor: palette.primary },
    tabText: { color: palette.inkMuted, fontSize: 12, fontWeight: "700" },
    tabTextActive: { color: palette.primary },
    group: { gap: spacing.sm },
    date: { color: palette.inkMuted, fontSize: 12, fontWeight: "800" },
    event: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line, borderRadius: radii.md, padding: spacing.md },
    eventUnread: { borderColor: palette.danger, backgroundColor: palette.dangerWash },
    kindDot: { width: 9, height: 9, borderRadius: 5, marginTop: 5 },
    eventCopy: { flex: 1, gap: spacing.xs },
    eventHeader: { flexDirection: "row", justifyContent: "space-between", gap: spacing.sm },
    kind: { fontSize: 10, fontWeight: "900", letterSpacing: 0.7, textTransform: "uppercase" },
    eventDate: { color: palette.inkMuted, fontSize: 11 },
    summary: { color: palette.ink, fontSize: 14, lineHeight: 19 },
    empty: { color: palette.inkMuted, fontSize: 14, paddingVertical: spacing.lg },
  });
}

import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { TAB_BAR_INSET, radii, spacing } from "@manual-samur/design-tokens";
import { Press } from "../components/Press.tsx";
import { Badge } from "../components/Badge.tsx";
import { UpdateDiff } from "../components/UpdateDiff.tsx";
import { applyManualRecencyWindow, asManualUpdateEvents, groupManualEventsByDate, manualNovedades, sortManualHistorial, type ManualUpdateEvent } from "../manual-tree-logic.ts";
import { useContentData } from "../content.tsx";
import { usePreferences } from "../preferences.tsx";
import { useTheme, useThemedStyles } from "../theme.tsx";
import type { RootStackParamList } from "../navigation-types.ts";

type Props = NativeStackScreenProps<RootStackParamList, "Historial">;
type HistoryTab = "novedades" | "historial";

export function HistorialScreen({ navigation }: Props) {
  const palette = useTheme();
  const styles = useThemedStyles(createStyles);
  const { content } = useContentData();
  const { seenEventIds, markEventSeen } = usePreferences();
  const [tab, setTab] = useState<HistoryTab>("novedades");
  const events = useMemo(() => asManualUpdateEvents(content.updates), [content.updates]);
  const recentEvents = useMemo(() => manualNovedades(applyManualRecencyWindow(events)), [events]);
  const historyEvents = useMemo(() => sortManualHistorial(events), [events]);
  // Las dos pestañas se agrupan por fecha. «Historial» era una lista plana en la
  // que cada fila repetía su fecha, así que la misma fecha salía escrita veinte
  // veces seguidas en lugar de una vez encima de su grupo.
  const groups = useMemo(() => groupManualEventsByDate(recentEvents), [recentEvents]);
  const historyGroups = useMemo(() => groupManualEventsByDate(historyEvents), [historyEvents]);
  const seen = useMemo(() => new Set(seenEventIds), [seenEventIds]);

  const openEvent = (event: ManualUpdateEvent) => {
    markEventSeen(event.eventId);
    if (event.category === "codigo" && event.routeKey) navigation.push("Code", { routeKey: event.routeKey });
    else if (event.procedureIds[0]) navigation.push("Procedure", { id: event.procedureIds[0] });
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic">
      <View style={styles.tabs} accessibilityRole="tablist">
        <Press onPress={() => setTab("novedades")} style={[styles.tab, tab === "novedades" && styles.tabActive]} accessibilityRole="tab" accessibilityState={{ selected: tab === "novedades" }}><Text style={[styles.tabText, tab === "novedades" && styles.tabTextActive]}>Novedades · {recentEvents.length}</Text></Press>
        <Press onPress={() => setTab("historial")} style={[styles.tab, tab === "historial" && styles.tabActive]} accessibilityRole="tab" accessibilityState={{ selected: tab === "historial" }}><Text style={[styles.tabText, tab === "historial" && styles.tabTextActive]}>Historial · {historyEvents.length}</Text></Press>
      </View>
      {(tab === "novedades" ? groups : historyGroups).map((group) => (
        <View key={group.date} style={styles.group}>
          <Text style={styles.date}>{formatDate(group.date)}</Text>
          {group.events.map((event) => (
            <HistoryEvent key={event.eventId} event={event} unread={!seen.has(event.eventId)} onOpen={() => openEvent(event)} palette={palette} styles={styles} />
          ))}
        </View>
      ))}
      {((tab === "novedades" && groups.length === 0) || (tab === "historial" && historyGroups.length === 0)) && <Text style={styles.empty}>No hay cambios relevantes para mostrar.</Text>}
    </ScrollView>
  );
}

function HistoryEvent({ event, unread, onOpen, palette, styles }: { event: ManualUpdateEvent; unread: boolean; onOpen: () => void; palette: ReturnType<typeof useTheme>; styles: ReturnType<typeof createStyles> }) {
  const kindColor = event.changeKind === "nuevo" ? palette.green : event.changeKind === "eliminado" ? palette.danger : palette.primary;
  const kindLabel = event.category === "codigo" ? "Código" : displayChangeKind(event.changeKind);
  const affectedTitle = event.summary.includes(":") ? event.summary.slice(event.summary.indexOf(":") + 1).trim() : event.summary;
  const body = <View style={styles.eventCopy}>
    <View style={styles.eventHeader}>
      <Badge label={kindLabel} tone="accent" color={kindColor} background={event.changeKind === "nuevo" ? palette.greenWash : event.changeKind === "eliminado" ? palette.dangerWash : palette.primaryWash} />
    </View>
    <Text style={styles.summary}>{affectedTitle}</Text>
    {event.diff ? <UpdateDiff diff={event.diff} palette={palette} compact /> : null}
  </View>;
  return <Press onPress={onOpen} style={[styles.event, unread && styles.eventUnread]} accessibilityRole="button" accessibilityLabel={`${event.summary}${unread ? ", sin leer" : ""}`}>
    {body}
  </Press>;
}

function formatDate(value: string): string {
  const dateValue = value.slice(0, 10);
  const parsed = new Date(`${dateValue}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? dateValue : parsed.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
}

function displayChangeKind(value: string): string {
  return value ? `${value[0].toLocaleUpperCase("es")}${value.slice(1)}` : "Cambio";
}

function createStyles(palette: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: palette.paper },
    content: { padding: spacing.lg, paddingBottom: TAB_BAR_INSET, gap: spacing.lg },
    tabs: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: palette.line },
    tab: { flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", borderBottomWidth: 2, borderBottomColor: "transparent" },
    tabActive: { borderBottomColor: palette.primary },
    tabText: { color: palette.inkMuted, fontSize: 12, fontWeight: "700" },
    tabTextActive: { color: palette.primary },
    group: { gap: spacing.sm },
    date: { color: palette.ink, fontSize: 17, lineHeight: 22, fontWeight: "900", letterSpacing: -0.2, marginTop: spacing.sm },
    event: { backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line, borderRadius: radii.md, padding: spacing.md },
    // «Sin leer» va en el color de identidad, no en el de error. Con danger, una
    // ficha que solo estaba sin abrir se leia como un cambio problematico.
    eventUnread: { borderColor: palette.primary, backgroundColor: palette.primaryWash },
    eventCopy: { gap: spacing.sm },
    eventHeader: { flexDirection: "row", justifyContent: "space-between", gap: spacing.sm },
    summary: { color: palette.ink, fontSize: 17, lineHeight: 23, fontWeight: "800", letterSpacing: -0.2 },
    empty: { color: palette.inkMuted, fontSize: 14, paddingVertical: spacing.lg },
  });
}

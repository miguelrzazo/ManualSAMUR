import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { TAB_BAR_INSET, radii, spacing } from "@manual-samur/design-tokens";
import { Press } from "../components/Press.tsx";
import { Badge } from "../components/Badge.tsx";
import { UpdateDiff } from "../components/UpdateDiff.tsx";
import { applyManualRecencyWindow, asManualUpdateEvents, groupManualEventsByDate, manualNovedades, manualUpdateDestination, manualUpdateView, sortManualHistorial, type ManualUpdateEvent } from "../manual-tree-logic.ts";
import { useContentData } from "../content.tsx";
import { usePreferences } from "../preferences.tsx";
import { useTheme, useThemedStyles } from "../theme.tsx";
import type { RootStackParamList } from "../navigation-types.ts";
import { loadRemoteHistoryPage } from "../remote-history-logic.ts";

type Props = NativeStackScreenProps<RootStackParamList, "Historial">;
type HistoryTab = "novedades" | "historial";

export function HistorialScreen({ navigation }: Props) {
  const palette = useTheme();
  const styles = useThemedStyles(createStyles);
  const { content } = useContentData();
  const { seenEventIds, markEventSeen, markAllEventsSeen } = usePreferences();
  const [tab, setTab] = useState<HistoryTab>("novedades");
  const [remoteHistory, setRemoteHistory] = useState<ManualUpdateEvent[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historyAttempted, setHistoryAttempted] = useState(false);
  const [historyPage, setHistoryPage] = useState(-1);
  const [historyTotalPages, setHistoryTotalPages] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string>();
  const events = useMemo(() => asManualUpdateEvents(content.updates), [content.updates]);
  const recentEvents = useMemo(() => manualNovedades(applyManualRecencyWindow(events)), [events]);
  const historyEvents = useMemo(() => sortManualHistorial(historyLoaded ? remoteHistory : events), [events, historyLoaded, remoteHistory]);
  // Las dos pestañas se agrupan por fecha. «Historial» era una lista plana en la
  // que cada fila repetía su fecha, así que la misma fecha salía escrita veinte
  // veces seguidas en lugar de una vez encima de su grupo.
  const groups = useMemo(() => groupManualEventsByDate(recentEvents), [recentEvents]);
  const historyGroups = useMemo(() => groupManualEventsByDate(historyEvents), [historyEvents]);
  const seen = useMemo(() => new Set(seenEventIds), [seenEventIds]);
  const unreadRecentEvents = useMemo(() => recentEvents.filter((event) => !seen.has(event.eventId)), [recentEvents, seen]);

  const loadHistoryPage = useCallback(async (page: number) => {
    if (historyLoading) return;
    const extra = Constants.expoConfig?.extra as Record<string, unknown> | undefined;
    const origin = typeof process.env.EXPO_PUBLIC_CONTENT_ORIGIN === "string"
      ? process.env.EXPO_PUBLIC_CONTENT_ORIGIN
      : typeof extra?.contentOrigin === "string" ? extra.contentOrigin : "";
    setHistoryAttempted(true);
    setHistoryLoading(true);
    setHistoryError(undefined);
    try {
      const result = await loadRemoteHistoryPage({ origin, page, storage: AsyncStorage });
      setRemoteHistory((current) => {
        const byId = new Map(current.map((event) => [event.eventId, event]));
        for (const event of asManualUpdateEvents(result.page.events)) byId.set(event.eventId, event);
        return [...byId.values()];
      });
      setHistoryPage(page);
      setHistoryTotalPages(result.index.totalPages);
      setHistoryLoaded(true);
      if (result.fromCache) setHistoryError("Sin conexión: mostrando las páginas de historial guardadas en este dispositivo.");
    } catch {
      setHistoryError("No se pudo cargar el historial completo; se muestran los cambios locales disponibles.");
    } finally {
      setHistoryLoading(false);
    }
  }, [historyLoading]);

  useEffect(() => {
    if (tab !== "historial" || historyAttempted || historyLoading) return;
    const timer = setTimeout(() => { void loadHistoryPage(0); }, 0);
    return () => clearTimeout(timer);
  }, [historyAttempted, historyLoading, loadHistoryPage, tab]);

  const openEvent = (event: ManualUpdateEvent) => {
    markEventSeen(event.eventId);
    const destination = manualUpdateDestination(event);
    if (destination?.category === "codigo" && destination.routeKey) navigation.push("Code", { routeKey: destination.routeKey });
    else if (destination?.category === "vademecum" && destination.routeKey) {
      const drugPrefix = "vademecum:drug:";
      if (destination.routeKey.startsWith(drugPrefix)) navigation.push("Drug", { id: destination.routeKey.slice(drugPrefix.length) });
      else navigation.push("Vademecum", { routeKey: destination.routeKey });
    } else if (destination?.procedureId) navigation.push("Procedure", { id: destination.procedureId });
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic">
      <View style={styles.tabs} accessibilityRole="tablist">
        <Press testID="novedades-tab" onPress={() => setTab("novedades")} style={[styles.tab, tab === "novedades" && styles.tabActive]} accessibilityRole="tab" accessibilityState={{ selected: tab === "novedades" }}><Text style={[styles.tabText, tab === "novedades" && styles.tabTextActive]}>Novedades · {recentEvents.length}</Text></Press>
        <Press testID="historial-tab" onPress={() => setTab("historial")} style={[styles.tab, tab === "historial" && styles.tabActive]} accessibilityRole="tab" accessibilityState={{ selected: tab === "historial" }}><Text style={[styles.tabText, tab === "historial" && styles.tabTextActive]}>Cambios anteriores · {historyEvents.length}{historyTotalPages > 1 ? "+" : ""}</Text></Press>
      </View>
      {tab === "novedades" && unreadRecentEvents.length > 0 && (
        <Press
          testID="mark-all-novedades-read"
          onPress={() => markAllEventsSeen(unreadRecentEvents.map((event) => event.eventId))}
          style={styles.markAll}
          accessibilityRole="button"
          accessibilityLabel="Marcar todas las novedades como leídas"
        >
          <Text style={styles.markAllText}>Marcar todo como leído</Text>
        </Press>
      )}
      {(tab === "novedades" ? groups : historyGroups).map((group) => (
        <View key={group.date} style={styles.group}>
          <Text style={styles.date}>{formatDate(group.date)}</Text>
          {group.events.map((event) => (
            <HistoryEvent key={event.eventId} event={event} unread={!seen.has(event.eventId)} onOpen={() => openEvent(event)} palette={palette} styles={styles} />
          ))}
        </View>
      ))}
      {tab === "historial" && historyError && <Text style={styles.historyStatus}>{historyError}</Text>}
      {tab === "historial" && historyLoading && <Text style={styles.historyStatus}>Cargando historial…</Text>}
      {tab === "historial" && historyLoaded && historyPage + 1 < historyTotalPages && !historyLoading && (
        <Press onPress={() => void loadHistoryPage(historyPage + 1)} style={styles.loadMore} accessibilityRole="button">
          <Text style={styles.loadMoreText}>Cargar más historial</Text>
        </Press>
      )}
      {((tab === "novedades" && groups.length === 0) || (tab === "historial" && historyGroups.length === 0)) && <Text style={styles.empty}>No hay cambios relevantes para mostrar.</Text>}
    </ScrollView>
  );
}

function HistoryEvent({ event, unread, onOpen, palette, styles }: { event: ManualUpdateEvent; unread: boolean; onOpen: () => void; palette: ReturnType<typeof useTheme>; styles: ReturnType<typeof createStyles> }) {
  const view = manualUpdateView(event);
  const kindColor = event.changeKind === "nuevo" ? palette.green : event.changeKind === "eliminado" ? palette.danger : palette.primary;
  const kindLabel = view.changeLabel;
  const affectedTitle = view.title;
  const body = <View style={styles.eventCopy}>
    <View style={styles.eventHeader}>
      <View style={styles.badges}>
        <Badge label={kindLabel} tone="accent" color={kindColor} background={event.changeKind === "nuevo" ? palette.greenWash : event.changeKind === "eliminado" ? palette.dangerWash : palette.primaryWash} />
        <Badge label={view.categoryLabel} />
      </View>
      <Text style={unread ? styles.unreadLabel : styles.readLabel}>{unread ? "Sin leer" : "Leído"}</Text>
    </View>
    <Text style={styles.summary}>{affectedTitle}</Text>
    {(event.diff || view.scope === "procedimiento") ? <UpdateDiff event={event} diff={event.diff} palette={palette} compact /> : null}
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

function createStyles(palette: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: palette.paper },
    content: { padding: spacing.lg, paddingBottom: TAB_BAR_INSET, gap: spacing.lg },
    tabs: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: palette.line },
    tab: { flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", borderBottomWidth: 2, borderBottomColor: "transparent" },
    tabActive: { borderBottomColor: palette.primary },
    tabText: { color: palette.inkMuted, fontSize: 12, fontWeight: "700" },
    tabTextActive: { color: palette.primary },
    markAll: { alignSelf: "flex-end", minHeight: 40, justifyContent: "center", paddingHorizontal: spacing.md, borderRadius: radii.pill, backgroundColor: palette.primaryWash },
    markAllText: { color: palette.primary, fontSize: 12, fontWeight: "800" },
    group: { gap: spacing.sm },
    date: { color: palette.ink, fontSize: 17, lineHeight: 22, fontWeight: "900", letterSpacing: -0.2, marginTop: spacing.sm },
    event: { backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line, borderRadius: radii.md, padding: spacing.md },
    // «Sin leer» va en el color de identidad, no en el de error. Con danger, una
    // ficha que solo estaba sin abrir se leia como un cambio problematico.
    eventUnread: { borderColor: palette.primary, backgroundColor: palette.primaryWash },
    eventCopy: { gap: spacing.sm },
    eventHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.sm },
    badges: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, flex: 1 },
    unreadLabel: { color: palette.primary, fontSize: 11, fontWeight: "800" },
    readLabel: { color: palette.inkMuted, fontSize: 11, fontWeight: "700" },
    summary: { color: palette.ink, fontSize: 17, lineHeight: 23, fontWeight: "800", letterSpacing: -0.2 },
    historyStatus: { color: palette.inkMuted, fontSize: 12, lineHeight: 18 },
    loadMore: { minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: radii.pill, backgroundColor: palette.primaryWash },
    loadMoreText: { color: palette.primary, fontSize: 13, fontWeight: "800" },
    empty: { color: palette.inkMuted, fontSize: 14, paddingVertical: spacing.lg },
  });
}

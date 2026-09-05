/**
 * Inicio — the manual itself, full screen.
 *
 * The previous Inicio opened with a marketing hero ("La referencia que te
 * acompaña", a repeated app icon directly under the header's own icon) and a
 * doubled "ACCESOS RÁPIDOS · Consulta por recurso" heading above three
 * shortcut cards that only duplicated the tab bar. For a reference consulted
 * mid-shift that hero spent the most valuable screen space on nothing, so
 * this screen replaces all of it with the actual procedure tree — mirroring
 * `components/manual/ManualHomeClient.tsx` and `ProcedureSidebar.tsx`'s
 * section → group → subgroup organisation (`manual-tree-logic.ts`) — plus,
 * hanging off the same screen, favoritos, recientes and the offline update
 * history. `SavedScreen` (the old, unrouted Guardados screen) is gone from
 * App.tsx; its favorites/recents rendering moved here.
 *
 * Extracted into its own module for the same reason T5c extracted
 * CodigosScreen: App.tsx was already ~1000 lines and a full tree explorer
 * would have made it worse. The thin `HomeScreen` wrapper that remains in
 * App.tsx only owns the brand header and the settings modal, both of which
 * depend on App.tsx's module-scoped theme/logo/StyleSheet.
 */
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import React, { useMemo, useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  Text,
  View,
  useColorScheme,
  type ListRenderItemInfo,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { radii, spacing } from "@manual-samur/design-tokens";
import { accessibilityHints, accessibilityTargetStyle, resolveAdaptivePalette, type AdaptivePalette } from "../accessibility";
import { useContent } from "../content";
import { usePreferences } from "../preferences";
import { procedureRouteKey } from "../procedure-logic";
import {
  selectSavedReferences,
  savedReferenceIcon,
  type ResolvedSavedReference,
  type SavedReference,
} from "../saved-logic";
import {
  applyManualRecencyWindow,
  asManualUpdateEvents,
  buildManualTree,
  flattenManualTree,
  groupManualEventsByDate,
  manualNovedades,
  manualSectionColor,
  sortManualHistorial,
  sortManualSections,
  type ManualTreeRow,
  type ManualUpdateEvent,
} from "../manual-tree-logic";
import type { RootStackParamList, TabsParamList } from "../navigation-types";

const HISTORY_PAGE_SIZE = 50;

function useActivePalette(): AdaptivePalette {
  const scheme = useColorScheme();
  const { appearance } = usePreferences();
  return resolveAdaptivePalette(appearance === "system" ? scheme : appearance);
}

type InicioNavigation = BottomTabScreenProps<TabsParamList, "Inicio">["navigation"];

function openSavedReference(navigation: InicioNavigation, item: SavedReference) {
  const parent = navigation.getParent<NativeStackNavigationProp<RootStackParamList>>();
  if (item.kind === "procedure") parent?.navigate("Procedure", { id: item.id });
  else if (item.kind === "drug") parent?.navigate("Drug", { id: item.id });
  else if (item.kind === "code") parent?.navigate("Code", { routeKey: item.routeKey });
  else if (item.kind === "hospital" || item.kind === "base") parent?.navigate("Location", { routeKey: item.routeKey });
  else parent?.navigate("Vademecum", { routeKey: item.routeKey });
}

const KIND_BADGE_COLOR: Record<string, string> = {
  nuevo: "green",
  actualizado: "ink",
  revisado: "amber",
  eliminado: "red",
};

export function InicioScreen({ navigation }: { navigation: InicioNavigation }) {
  const { content, favorites, recents, toggleFavorite } = useContent();
  const palette = useActivePalette();
  const styles = useMemo(() => createStyles(palette), [palette]);

  const [openKeys, setOpenKeys] = useState<Set<string>>(new Set());
  const toggleKey = (key: string) => setOpenKeys((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const sections = useMemo(
    () => sortManualSections(buildManualTree(content.procedures)),
    [content.procedures],
  );
  const rows = useMemo(() => flattenManualTree(sections, openKeys), [sections, openKeys]);

  const updateEvents = useMemo(
    () => applyManualRecencyWindow(asManualUpdateEvents(content.updates)),
    [content.updates],
  );
  const novedades = useMemo(() => manualNovedades(updateEvents), [updateEvents]);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyTab, setHistoryTab] = useState<"novedades" | "historial">("novedades");
  const [historyPage, setHistoryPage] = useState(1);
  const novedadesGroups = useMemo(() => groupManualEventsByDate(novedades), [novedades]);
  const historialEvents = useMemo(() => sortManualHistorial(updateEvents), [updateEvents]);

  const favoriteItems = useMemo(() => selectSavedReferences(content, favorites).slice(0, 8), [content, favorites]);
  const recentItems = useMemo(() => selectSavedReferences(content, recents).slice(0, 8), [content, recents]);

  const openHistory = () => { setHistoryPage(1); setHistoryOpen(true); };

  const openProcedure = (id: string) => navigation.getParent<NativeStackNavigationProp<RootStackParamList>>()?.navigate("Procedure", { id });

  const renderRow = ({ item }: ListRenderItemInfo<ManualTreeRow>) => {
    if (item.kind === "procedure" && item.procedure) {
      const procedure = item.procedure;
      const routeKey = procedureRouteKey(procedure.id);
      const favorite = favorites.includes(routeKey);
      return (
        <View style={[styles.procedureRow, { paddingLeft: spacing.lg + item.depth * spacing.lg }]}>
          <Pressable
            onPress={() => openProcedure(procedure.id)}
            style={({ pressed }) => [styles.procedureRowMain, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={`${procedure.id}, ${procedure.title}`}
            accessibilityHint={accessibilityHints.openDetail}
          >
            <Text style={styles.procedureId}>{procedure.id}</Text>
            <Text style={styles.procedureTitle} numberOfLines={2}>{procedure.title}</Text>
          </Pressable>
          <Pressable
            onPress={() => toggleFavorite(routeKey)}
            hitSlop={12}
            style={styles.minimumTarget}
            accessibilityRole="button"
            accessibilityLabel={favorite ? `Quitar ${procedure.title} de favoritos` : `Guardar ${procedure.title} en favoritos`}
            accessibilityHint={accessibilityHints.toggleFavorite}
            accessibilityState={{ selected: favorite }}
          >
            <MaterialCommunityIcons name={favorite ? "star" : "star-outline"} size={19} color={favorite ? palette.amber : palette.inkMuted} />
          </Pressable>
        </View>
      );
    }

    const isSection = item.kind === "section";
    const color = manualSectionColor(item.section);
    return (
      <Pressable
        onPress={() => toggleKey(item.rowKey)}
        style={({ pressed }) => [
          isSection ? styles.sectionHeaderRow : item.kind === "group" ? styles.groupHeaderRow : styles.subgroupHeaderRow,
          { paddingLeft: spacing.lg + item.depth * spacing.lg },
          pressed && styles.pressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel={`${item.label}, ${item.count} procedimiento${item.count === 1 ? "" : "s"}`}
        accessibilityHint={item.expanded ? "Contrae este grupo del manual." : "Expande este grupo del manual."}
        accessibilityState={{ expanded: item.expanded }}
      >
        {isSection && <View style={[styles.sectionDot, { backgroundColor: color }]} />}
        <Text style={isSection ? styles.sectionHeaderLabel : item.kind === "group" ? styles.groupHeaderLabel : styles.subgroupHeaderLabel} numberOfLines={1}>
          {item.label}
        </Text>
        <Text style={styles.headerCount}>{item.count}</Text>
        <MaterialCommunityIcons name={item.expanded ? "chevron-down" : "chevron-right"} size={isSection ? 20 : 16} color={palette.inkMuted} />
      </Pressable>
    );
  };

  return (
    <View style={styles.screen}>
      <FlatList
        data={rows}
        keyExtractor={(item) => item.rowKey}
        contentContainerStyle={styles.listContent}
        renderItem={renderRow}
        ListHeaderComponent={
          <>
            <Pressable
              onPress={() => navigation.getParent<NativeStackNavigationProp<RootStackParamList>>()?.navigate("Search")}
              style={styles.searchBar}
              accessibilityRole="button"
              accessibilityLabel="Buscar en el manual"
              accessibilityHint="Abre la búsqueda de procedimientos, fármacos y códigos."
            >
              <MaterialCommunityIcons name="magnify" size={20} color={palette.inkMuted} />
              <Text style={styles.searchPlaceholder}>Buscar procedimientos, fármacos o códigos</Text>
            </Pressable>

            <View style={styles.secondaryRow}>
              <Pressable
                onPress={openHistory}
                style={[styles.secondaryChip, novedades.length > 0 && styles.secondaryChipHighlight]}
                accessibilityRole="button"
                accessibilityLabel={novedades.length > 0 ? `Historial de actualizaciones, ${novedades.length} novedad${novedades.length === 1 ? "" : "es"}` : "Historial de actualizaciones"}
                accessibilityHint={accessibilityHints.openDetail}
              >
                <MaterialCommunityIcons name="clock-outline" size={16} color={novedades.length > 0 ? palette.red : palette.inkMuted} />
                <Text style={[styles.secondaryChipText, novedades.length > 0 && styles.secondaryChipTextHighlight]}>
                  {novedades.length > 0 ? `${novedades.length} novedad${novedades.length === 1 ? "" : "es"}` : "Historial"}
                </Text>
              </Pressable>
            </View>

            {favoriteItems.length > 0 && (
              <CollectionSection
                title="Favoritos"
                icon="star"
                items={favoriteItems}
                favorites={favorites}
                onToggleFavorite={toggleFavorite}
                onPress={(item) => openSavedReference(navigation, item)}
                palette={palette}
                styles={styles}
              />
            )}

            {recentItems.length > 0 && (
              <CollectionSection
                title="Recientes"
                icon="history"
                items={recentItems}
                favorites={favorites}
                onToggleFavorite={toggleFavorite}
                onPress={(item) => openSavedReference(navigation, item)}
                palette={palette}
                styles={styles}
              />
            )}

            <View style={styles.treeHeading}>
              <Text style={styles.treeHeadingText}>MANUAL DE PROCEDIMIENTOS</Text>
              <Text style={styles.treeHeadingCount}>{content.procedures.length} fichas · {sections.length} secciones</Text>
            </View>
          </>
        }
      />

      <HistoryModal
        visible={historyOpen}
        onClose={() => setHistoryOpen(false)}
        tab={historyTab}
        onChangeTab={setHistoryTab}
        novedadesGroups={novedadesGroups}
        historialEvents={historialEvents}
        historyPage={historyPage}
        onLoadMore={() => setHistoryPage((page) => page + 1)}
        onOpenProcedure={(id) => { setHistoryOpen(false); openProcedure(id); }}
        palette={palette}
        styles={styles}
      />
    </View>
  );
}

function CollectionSection({
  title,
  icon,
  items,
  favorites,
  onToggleFavorite,
  onPress,
  palette,
  styles,
}: {
  title: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  items: ResolvedSavedReference[];
  favorites: string[];
  onToggleFavorite: (routeKey: string) => void;
  onPress: (item: SavedReference) => void;
  palette: AdaptivePalette;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.collectionSection}>
      <View style={styles.collectionHeader}>
        <MaterialCommunityIcons name={icon} size={15} color={palette.amber} />
        <Text style={styles.collectionTitle}>{title}</Text>
        <Text style={styles.headerCount}>{items.length}</Text>
      </View>
      {items.map((item) => {
        const stale = item.kind === "stale";
        const favorite = !stale && favorites.includes(item.routeKey);
        return (
          <View key={item.routeKey} style={styles.collectionRow} accessible={false}>
            {stale ? (
              <View style={styles.collectionRowMain}>
                <MaterialCommunityIcons name="alert-circle-outline" size={17} color={palette.red} />
                <View style={styles.resourceCopy}>
                  <Text style={styles.procedureTitle} numberOfLines={1}>{item.title}</Text>
                  <Text style={styles.staleText}>{item.subtitle}</Text>
                </View>
              </View>
            ) : (
              <Pressable
                onPress={() => onPress(item)}
                style={({ pressed }) => [styles.collectionRowMain, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={`${item.title}. ${item.subtitle}`}
                accessibilityHint={accessibilityHints.openDetail}
              >
                <MaterialCommunityIcons name={savedReferenceIcon(item.kind)} size={17} color={palette.ink} />
                <View style={styles.resourceCopy}>
                  <Text style={styles.procedureTitle} numberOfLines={1}>{item.title}</Text>
                  <Text style={styles.collectionSubtitle} numberOfLines={1}>{item.subtitle}</Text>
                </View>
              </Pressable>
            )}
            {!stale && (
              <Pressable
                onPress={() => onToggleFavorite(item.routeKey)}
                hitSlop={12}
                style={styles.minimumTarget}
                accessibilityRole="button"
                accessibilityLabel={favorite ? `Quitar ${item.title} de favoritos` : `Guardar ${item.title} en favoritos`}
                accessibilityHint={accessibilityHints.toggleFavorite}
                accessibilityState={{ selected: favorite }}
              >
                <MaterialCommunityIcons name={favorite ? "star" : "star-outline"} size={18} color={favorite ? palette.amber : palette.inkMuted} />
              </Pressable>
            )}
          </View>
        );
      })}
    </View>
  );
}

function HistoryModal({
  visible,
  onClose,
  tab,
  onChangeTab,
  novedadesGroups,
  historialEvents,
  historyPage,
  onLoadMore,
  onOpenProcedure,
  palette,
  styles,
}: {
  visible: boolean;
  onClose: () => void;
  tab: "novedades" | "historial";
  onChangeTab: (tab: "novedades" | "historial") => void;
  novedadesGroups: ReturnType<typeof groupManualEventsByDate>;
  historialEvents: ManualUpdateEvent[];
  historyPage: number;
  onLoadMore: () => void;
  onOpenProcedure: (id: string) => void;
  palette: AdaptivePalette;
  styles: ReturnType<typeof createStyles>;
}) {
  const visibleHistorial = historialEvents.slice(0, historyPage * HISTORY_PAGE_SIZE);
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.historyModalSafeArea} edges={["top", "bottom"]} accessibilityViewIsModal>
        <View style={styles.historyHeader} accessibilityRole="header">
          <Text style={styles.historyTitle}>Historial de actualizaciones</Text>
          <Pressable onPress={onClose} style={styles.minimumTarget} accessibilityRole="button" accessibilityLabel="Cerrar historial de actualizaciones" accessibilityHint={accessibilityHints.dismiss}>
            <MaterialCommunityIcons name="close" size={22} color={palette.ink} />
          </Pressable>
        </View>
        <View style={styles.historyTabs} accessibilityRole="tablist">
          {([["novedades", `Novedades (${novedadesGroups.reduce((total, g) => total + g.events.length, 0)})`], ["historial", `Historial completo (${historialEvents.length})`]] as const).map(([key, label]) => (
            <Pressable
              key={key}
              onPress={() => onChangeTab(key)}
              style={[styles.historyTab, tab === key && styles.historyTabActive]}
              accessibilityRole="tab"
              accessibilityLabel={label}
              accessibilityState={{ selected: tab === key }}
            >
              <Text style={[styles.historyTabText, tab === key && styles.historyTabTextActive]}>{label}</Text>
            </Pressable>
          ))}
        </View>
        {tab === "novedades" ? (
          <FlatList
            data={novedadesGroups}
            keyExtractor={(group) => group.date}
            contentContainerStyle={styles.historyContent}
            ListEmptyComponent={<Text style={styles.historyEmpty}>No hay novedades en los últimos 30 días. Consulta el historial completo.</Text>}
            renderItem={({ item: group }) => (
              <View style={styles.historyDateGroup}>
                <Text style={styles.historyDateLabel}>{group.date}</Text>
                {group.events.map((event) => <HistoryEventRow key={event.eventId} event={event} onOpenProcedure={onOpenProcedure} palette={palette} styles={styles} />)}
              </View>
            )}
          />
        ) : (
          <FlatList
            data={visibleHistorial}
            keyExtractor={(event) => event.eventId}
            contentContainerStyle={styles.historyContent}
            onEndReachedThreshold={0.4}
            onEndReached={() => { if (visibleHistorial.length < historialEvents.length) onLoadMore(); }}
            renderItem={({ item: event }) => <HistoryEventRow event={event} onOpenProcedure={onOpenProcedure} palette={palette} styles={styles} showDate />}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

function HistoryEventRow({
  event,
  onOpenProcedure,
  palette,
  styles,
  showDate = false,
}: {
  event: ManualUpdateEvent;
  onOpenProcedure: (id: string) => void;
  palette: AdaptivePalette;
  styles: ReturnType<typeof createStyles>;
  showDate?: boolean;
}) {
  const procedureId = event.procedureIds[0];
  const badgeColorKey = KIND_BADGE_COLOR[event.changeKind] ?? "ink";
  const badgeColor = badgeColorKey === "green" ? palette.green : badgeColorKey === "amber" ? palette.amber : badgeColorKey === "red" ? palette.red : palette.ink;
  const body = (
    <>
      <Text style={[styles.historyBadge, { color: badgeColor }]}>{event.changeKind.toUpperCase()}</Text>
      <View style={styles.resourceCopy}>
        <Text style={styles.historySummary}>{event.summary}</Text>
        {showDate && <Text style={styles.historyDate}>{(event.approvedAt ?? event.effectiveDate).slice(0, 10)}</Text>}
      </View>
    </>
  );
  return procedureId ? (
    <Pressable
      onPress={() => onOpenProcedure(procedureId)}
      style={({ pressed }) => [styles.historyRow, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${event.changeKind}: ${event.summary}`}
      accessibilityHint={accessibilityHints.openDetail}
    >
      {body}
    </Pressable>
  ) : (
    <View style={styles.historyRow}>{body}</View>
  );
}

function createStyles(palette: AdaptivePalette) {
  return {
    screen: { flex: 1, backgroundColor: palette.paper },
    listContent: { padding: spacing.lg, paddingBottom: 140, gap: 2 },
    minimumTarget: accessibilityTargetStyle(),
    pressed: { opacity: 0.6 },

    searchBar: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: spacing.sm,
      backgroundColor: palette.surface,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: palette.line,
      paddingHorizontal: spacing.md,
      minHeight: 44,
      marginBottom: spacing.md,
    },
    searchPlaceholder: { flex: 1, color: palette.inkMuted, fontSize: 14 },

    secondaryRow: { flexDirection: "row" as const, gap: spacing.sm, marginBottom: spacing.md },
    secondaryChip: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 6,
      minHeight: 36,
      paddingHorizontal: spacing.md,
      borderRadius: radii.pill,
      backgroundColor: palette.surfaceMuted,
    },
    secondaryChipHighlight: { backgroundColor: palette.redWash },
    secondaryChipText: { fontSize: 12, fontWeight: "700" as const, color: palette.inkMuted },
    secondaryChipTextHighlight: { color: palette.red },

    collectionSection: {
      backgroundColor: palette.surface,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: palette.line,
      padding: spacing.sm,
      marginBottom: spacing.md,
      gap: 2,
    },
    collectionHeader: { flexDirection: "row" as const, alignItems: "center" as const, gap: 6, paddingHorizontal: spacing.xs, paddingBottom: spacing.xs },
    collectionTitle: { fontSize: 11, fontWeight: "800" as const, color: palette.inkMuted, textTransform: "uppercase" as const, letterSpacing: 0.4 },
    collectionRow: { flexDirection: "row" as const, alignItems: "center" as const, gap: spacing.sm, minHeight: 40 },
    collectionRowMain: { flex: 1, flexDirection: "row" as const, alignItems: "center" as const, gap: spacing.sm, paddingVertical: 4 },
    collectionSubtitle: { fontSize: 11, color: palette.inkMuted, marginTop: 1 },
    staleText: { fontSize: 11, color: palette.red, marginTop: 1 },
    resourceCopy: { flex: 1, minWidth: 0 },

    treeHeading: { marginBottom: spacing.xs, marginTop: spacing.xs },
    treeHeadingText: { fontSize: 11, fontWeight: "800" as const, color: palette.inkMuted, letterSpacing: 0.5 },
    treeHeadingCount: { fontSize: 11, color: palette.inkMuted, marginTop: 2 },

    sectionHeaderRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: spacing.sm,
      minHeight: 48,
      paddingRight: spacing.md,
      backgroundColor: palette.surface,
      borderWidth: 1,
      borderColor: palette.line,
      borderRadius: radii.md,
      marginTop: spacing.xs,
    },
    sectionDot: { width: 8, height: 8, borderRadius: 4 },
    sectionHeaderLabel: { flex: 1, fontSize: 13, fontWeight: "800" as const, color: palette.ink, textTransform: "uppercase" as const, letterSpacing: 0.4 },

    groupHeaderRow: { flexDirection: "row" as const, alignItems: "center" as const, gap: spacing.sm, minHeight: 44, paddingRight: spacing.md },
    groupHeaderLabel: { flex: 1, fontSize: 13, fontWeight: "700" as const, color: palette.ink },

    subgroupHeaderRow: { flexDirection: "row" as const, alignItems: "center" as const, gap: spacing.sm, minHeight: 40, paddingRight: spacing.md },
    subgroupHeaderLabel: { flex: 1, fontSize: 12, fontWeight: "600" as const, color: palette.inkMuted, textTransform: "uppercase" as const },

    headerCount: { fontSize: 11, color: palette.inkMuted, fontVariant: ["tabular-nums" as const] },

    procedureRow: { flexDirection: "row" as const, alignItems: "center" as const, gap: spacing.sm, minHeight: 44, paddingRight: spacing.md },
    procedureRowMain: { flex: 1, flexDirection: "row" as const, alignItems: "center" as const, gap: spacing.sm, paddingVertical: spacing.xs },
    procedureId: { minWidth: 40, color: palette.inkMuted, fontSize: 12, fontWeight: "700" as const, fontVariant: ["tabular-nums" as const] },
    procedureTitle: { flex: 1, fontSize: 13, color: palette.ink },

    historyModalSafeArea: { flex: 1, backgroundColor: palette.paper },
    historyHeader: { flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "space-between" as const, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
    historyTitle: { fontSize: 16, fontWeight: "800" as const, color: palette.ink },
    historyTabs: { flexDirection: "row" as const, borderBottomWidth: 1, borderBottomColor: palette.line, paddingHorizontal: spacing.lg },
    historyTab: { minHeight: 40, paddingHorizontal: spacing.md, justifyContent: "center" as const, borderBottomWidth: 2, borderBottomColor: "transparent" },
    historyTabActive: { borderBottomColor: palette.ink },
    historyTabText: { fontSize: 12, fontWeight: "700" as const, color: palette.inkMuted },
    historyTabTextActive: { color: palette.ink },
    historyContent: { padding: spacing.lg, gap: spacing.sm },
    historyEmpty: { textAlign: "center" as const, color: palette.inkMuted, fontSize: 13, paddingVertical: spacing.xl },
    historyDateGroup: { marginBottom: spacing.md },
    historyDateLabel: { fontSize: 11, fontWeight: "800" as const, color: palette.inkMuted, marginBottom: spacing.xs },
    historyRow: {
      flexDirection: "row" as const,
      alignItems: "flex-start" as const,
      gap: spacing.sm,
      minHeight: 44,
      paddingVertical: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: palette.line,
    },
    historyBadge: { fontSize: 10, fontWeight: "800" as const, minWidth: 76 },
    historySummary: { fontSize: 13, color: palette.ink, lineHeight: 18 },
    historyDate: { fontSize: 11, color: palette.inkMuted, marginTop: 2 },
  };
}

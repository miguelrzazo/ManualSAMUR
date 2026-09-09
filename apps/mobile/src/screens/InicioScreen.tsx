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
  Pressable,
  StyleSheet,
  Text,
  View,
  type ListRenderItemInfo,
} from "react-native";
import { circle, radii, spacing, TAB_BAR_INSET, typography } from "@manual-samur/design-tokens";
import { accessibilityHints, accessibilityTargetStyle, type AdaptivePalette } from "../accessibility";
import { useTheme } from "../theme";
import { displayTitle } from "../title-case";
import { FavoriteToggle } from "../components";
import { animateNextLayout, useReduceMotion } from "../hooks/motion";
import { lightImpact } from "../hooks/haptics";
import { useContentData, useContentPreferences } from "../content";
import { usePreferences } from "../preferences.tsx";
import { procedureRouteKey } from "../procedure-logic";
import {
  selectProcedureReferences,
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
  manualNovedades,
  manualSectionColor,
  manualTreeRowCorners,
  sortManualSections,
  type ManualTreeRow,
} from "../manual-tree-logic";
import type { RootStackParamList, TabsParamList } from "../navigation-types";

type InicioNavigation = BottomTabScreenProps<TabsParamList, "Inicio">["navigation"];

function openSavedReference(navigation: InicioNavigation, item: SavedReference) {
  const parent = navigation.getParent<NativeStackNavigationProp<RootStackParamList>>();
  if (item.kind === "procedure") parent?.navigate("Procedure", { id: item.id });
  else if (item.kind === "drug") parent?.navigate("Drug", { id: item.id });
  else if (item.kind === "code") parent?.navigate("Code", { routeKey: item.routeKey });
  else if (item.kind === "hospital" || item.kind === "base") parent?.navigate("Location", { routeKey: item.routeKey });
  else parent?.navigate("Vademecum", { routeKey: item.routeKey });
}

export function InicioScreen({ navigation }: { navigation: InicioNavigation }) {
  const { content } = useContentData();
  const { favorites, recents, toggleFavorite } = useContentPreferences();
  const { seenEventIds } = usePreferences();
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);

  const [openKeys, setOpenKeys] = useState<Set<string>>(new Set());
  const reduceMotion = useReduceMotion();
  // Expanding a section used to swap the whole list contents between two frames:
  // sixty rows appeared with no transition, so it read as a screen change rather
  // than a section opening. `animateNextLayout` is a no-op under Reduce Motion,
  // and the haptic is an accompaniment to the chevron flip, never a replacement.
  const toggleKey = (key: string) => {
    animateNextLayout(reduceMotion);
    lightImpact();
    setOpenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

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
  const seen = useMemo(() => new Set(seenEventIds), [seenEventIds]);
  const unreadNovedades = useMemo(() => novedades.filter((event) => !seen.has(event.eventId)), [novedades, seen]);


  const favoriteItems = useMemo(() => selectSavedReferences(content, favorites).slice(0, 8), [content, favorites]);
  const recentItems = useMemo(() => selectProcedureReferences(content, recents).slice(0, 8), [content, recents]);

  const openHistory = () => navigation.getParent<NativeStackNavigationProp<RootStackParamList>>()?.navigate("Historial");

  const openProcedure = (id: string) => navigation.getParent<NativeStackNavigationProp<RootStackParamList>>()?.navigate("Procedure", { id });

  const renderRow = ({ item, index }: ListRenderItemInfo<ManualTreeRow>) => {
    // Las esquinas de la tarjeta de cada seccion. Ver `manualTreeRowCorners`: el
    // arbol es una lista plana, asi que el radio lo lleva la primera y la ultima
    // fila de cada seccion en vez de un contenedor que no existe.
    const corners = manualTreeRowCorners(rows, index);
    const cornerStyle = [
      corners.first && styles.cardTop,
      corners.last ? styles.cardBottom : styles.rowDivider,
    ];
    if (item.kind === "procedure" && item.procedure) {
      const procedure = item.procedure;
      const routeKey = procedureRouteKey(procedure.id);
      const favorite = favorites.includes(routeKey);
      return (
        <View style={[styles.procedureRow, cornerStyle, { paddingLeft: spacing.lg + item.depth * spacing.lg }]}>
          <Pressable
            onPress={() => openProcedure(procedure.id)}
            style={({ pressed }) => [styles.procedureRowMain, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={`${procedure.id}, ${displayTitle(procedure.title)}`}
            accessibilityHint={accessibilityHints.openDetail}
          >
            <Text style={styles.procedureId}>{procedure.id}</Text>
            <Text style={styles.procedureTitle} numberOfLines={2}>{displayTitle(procedure.title)}</Text>
          </Pressable>
          <FavoriteToggle
            favorite={favorite}
            onToggle={() => toggleFavorite(routeKey)}
            title={displayTitle(procedure.title)}
            size={19}
          />
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
          cornerStyle,
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
        // Sin `ItemSeparatorComponent`: cada fila lleva su propia linea inferior, y la
        // ultima de cada seccion la cambia por el hueco entre tarjetas. El separador
        // como componente aparte tendria que mirar cual es la fila siguiente para saber
        // si esta a caballo entre dos secciones, y `leadingItem` no trae su indice: la
        // unica forma seria un `indexOf` sobre las 900 filas del arbol, por separador y
        // en cada fotograma de scroll.
        ListHeaderComponent={
          <>
            <View style={styles.secondaryRow}>
              <Pressable
                onPress={openHistory}
                style={[styles.secondaryChip, unreadNovedades.length > 0 && styles.secondaryChipAlert]}
                accessibilityRole="button"
                accessibilityLabel={unreadNovedades.length > 0 ? `Novedades sin leer, ${unreadNovedades.length}` : "Sin novedades"}
                accessibilityHint={accessibilityHints.openDetail}
              >
                <MaterialCommunityIcons name="clock-outline" size={16} color={unreadNovedades.length > 0 ? palette.danger : palette.inkMuted} />
                <Text style={[styles.secondaryChipText, unreadNovedades.length > 0 && styles.secondaryChipTextAlert]}>
                  {unreadNovedades.length > 0 ? `Novedades · ${unreadNovedades.length}` : "Sin novedades"}
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
              <Text style={styles.treeHeadingText}>Manual</Text>
              <Text style={styles.treeHeadingCount}>{content.procedures.length} fichas</Text>
            </View>
          </>
        }
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
                <MaterialCommunityIcons name="alert-circle-outline" size={20} color={palette.danger} />
                <View style={styles.resourceCopy}>
                  <Text style={styles.collectionTitleText} numberOfLines={1}>{displayTitle(item.title)}</Text>
                  <Text style={styles.staleText}>{item.subtitle}</Text>
                </View>
              </View>
            ) : (
              <Pressable
                onPress={() => onPress(item)}
                style={({ pressed }) => [styles.collectionRowMain, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={`${displayTitle(item.title)}. ${item.subtitle}`}
                accessibilityHint={accessibilityHints.openDetail}
              >
                <MaterialCommunityIcons name={savedReferenceIcon(item.kind)} size={20} color={palette.ink} />
                <View style={styles.resourceCopy}>
                  <Text style={styles.collectionTitleText} numberOfLines={1}>{displayTitle(item.title)}</Text>
                  <Text style={styles.collectionSubtitle} numberOfLines={1}>{item.subtitle}</Text>
                </View>
              </Pressable>
            )}
            {!stale && (
              <FavoriteToggle
                favorite={favorite}
                onToggle={() => onToggleFavorite(item.routeKey)}
                title={displayTitle(item.title)}
                size={19}
              />
            )}
          </View>
        );
      })}
    </View>
  );
}


function createStyles(palette: AdaptivePalette) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: palette.paper },
    listContent: { padding: spacing.lg, paddingBottom: TAB_BAR_INSET },
    // Las esquinas de la tarjeta de seccion. `tree` —un estilo con `borderRadius`
    // que no se aplicaba a ninguna vista— vivio aqui sin efecto hasta que se noto
    // que el arbol salia cuadrado mientras Favoritos y Recientes eran tarjetas.
    cardTop: { borderTopLeftRadius: radii.md, borderTopRightRadius: radii.md },
    cardBottom: { borderBottomLeftRadius: radii.md, borderBottomRightRadius: radii.md, marginBottom: spacing.sm },
    // La linea entre filas de una misma seccion. Se sangra `spacing.lg` por la
    // izquierda para que no cruce toda la tarjeta de lado a lado.
    rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.line },
    // Y el hueco bajo la ultima fila de cada seccion, que es lo que separa una tarjeta
    // de la siguiente.
    minimumTarget: accessibilityTargetStyle(),
    pressed: { opacity: 0.6 },

    searchBar: {
      flexDirection: "row",
      alignItems: "center",
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

    secondaryRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
    secondaryChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      minHeight: 36,
      paddingHorizontal: spacing.md,
      borderRadius: radii.pill,
      backgroundColor: palette.surfaceMuted,
    },
    secondaryChipHighlight: { backgroundColor: palette.primaryWash },
    secondaryChipText: { fontSize: 12, fontWeight: "700", color: palette.inkMuted },
    secondaryChipTextHighlight: { color: palette.primary },
    secondaryChipAlert: { backgroundColor: palette.dangerWash },
    secondaryChipTextAlert: { color: palette.dangerDark },

    collectionSection: {
      backgroundColor: palette.surface,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: palette.line,
      padding: spacing.md,
      marginBottom: spacing.md,
      gap: 2,
    },
    collectionHeader: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: spacing.xs, paddingBottom: spacing.xs },
    collectionTitle: { fontSize: 13, fontWeight: "600", color: palette.inkMuted, letterSpacing: -0.08 },
    // 56, no 40. Favoritos y Recientes son los dos atajos de la pantalla —lo que se
    // abre sin buscar— y se dibujaban mas pequenos que cualquier fila del arbol que
    // tienen debajo, con el titulo a 13pt y el subtitulo a 11.
    collectionRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 56 },
    collectionRowMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 4 },
    collectionTitleText: { ...typography.callout, color: palette.ink },
    collectionSubtitle: { ...typography.footnote, color: palette.inkMuted, marginTop: 1 },
    staleText: { ...typography.footnote, color: palette.danger, marginTop: 1 },
    resourceCopy: { flex: 1, minWidth: 0 },

    treeHeading: { marginBottom: spacing.xs, marginTop: spacing.xs },
    treeHeadingText: { ...typography.footnote, fontWeight: "600", color: palette.inkMuted },
    treeHeadingCount: { fontSize: 11, color: palette.inkMuted, marginTop: 2 },

    sectionHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      minHeight: 48,
      paddingRight: spacing.md,
      backgroundColor: palette.surface,
    },
    sectionDot: circle(8),
    sectionHeaderLabel: { flex: 1, fontSize: 17, fontWeight: "600", color: palette.ink, letterSpacing: -0.43 },

    groupHeaderRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 44, paddingRight: spacing.md, backgroundColor: palette.surface },
    groupHeaderLabel: { flex: 1, fontSize: 13, fontWeight: "700", color: palette.ink },

    subgroupHeaderRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 40, paddingRight: spacing.md, backgroundColor: palette.surface },
    subgroupHeaderLabel: { flex: 1, fontSize: 15, fontWeight: "500", color: palette.inkMuted },

    headerCount: { fontSize: 13, color: palette.inkMuted, fontVariant: ["tabular-nums"] },

    procedureRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 44, paddingRight: spacing.md, backgroundColor: palette.surface },
    procedureRowMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xs },
    procedureId: { minWidth: 40, color: palette.inkMuted, fontSize: 12, fontWeight: "700", fontVariant: ["tabular-nums"] },
    procedureTitle: { flex: 1, fontSize: 13, color: palette.ink },

  });
}

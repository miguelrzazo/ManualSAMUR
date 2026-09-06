import React, { useMemo } from "react";
import { SectionList, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { spacing, typography, TAB_BAR_INSET, type AdaptivePalette } from "@manual-samur/design-tokens";
import { accessibilityHints } from "../accessibility.ts";
import { formatDistanceLabel, type LocationWithDistance } from "../mapa-logic.ts";
import { locationStaleNotice, type LocationSourcePolicy } from "../location-logic.ts";
import { Chip } from "./Chip.tsx";
import { EmptyState } from "./EmptyState.tsx";
import { Press } from "./Press.tsx";
import { SearchField } from "./SearchField.tsx";

/**
 * The hospitals and bases directory, shown as the Mapa tab's content whenever
 * the online basemap is not running.
 *
 * It replaces a decorative schematic that placed every point at a position
 * derived from its index in the list rather than its coordinates. This is the
 * same data the sheet's "Vista accesible" list already showed — it is simply the
 * primary view now instead of an equivalent hidden two taps away.
 *
 * Grouped by district when no location is known, and flat-but-nearest-first once
 * the user has granted location, because at that point distance is the only
 * ordering anybody wants.
 */
export function LocationDirectory({ locations, query, onQueryChange, filter, onFilterChange, policy, palette, onOpen, hasDistances }: {
  locations: LocationWithDistance[];
  query: string;
  onQueryChange: (value: string) => void;
  filter: "all" | "hospital" | "base";
  onFilterChange: (value: "all" | "hospital" | "base") => void;
  policy: LocationSourcePolicy;
  palette: AdaptivePalette;
  onOpen: (location: LocationWithDistance) => void;
  hasDistances: boolean;
}) {
  const styles = useStyles(palette);

  const sections = useMemo(() => {
    if (hasDistances) return [{ title: "Más cercanos", data: locations }];
    const byDistrict = new Map<string, LocationWithDistance[]>();
    for (const item of locations) {
      const key = item.district || "Sin distrito";
      const bucket = byDistrict.get(key);
      if (bucket) bucket.push(item);
      else byDistrict.set(key, [item]);
    }
    return [...byDistrict.entries()]
      .sort(([a], [b]) => a.localeCompare(b, "es"))
      .map(([title, data]) => ({ title, data }));
  }, [locations, hasDistances]);

  return (
    <View style={styles.fill}>
      <View style={styles.controls}>
        <SearchField value={query} onChangeText={onQueryChange} placeholder="Buscar hospital, base o dirección" />
        <View style={styles.filters}>
          {(["all", "hospital", "base"] as const).map((item) => (
            <Chip
              key={item}
              label={item === "all" ? "Todos" : item === "hospital" ? "Hospitales" : "Bases"}
              selected={filter === item}
              onPress={() => onFilterChange(item)}
              role="tab"
            />
          ))}
        </View>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item) => `${item.kind}-${item.id}`}
        stickySectionHeadersEnabled
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={<EmptyState title="Sin coincidencias" detail="Prueba con el nombre, el distrito o la dirección." icon="map-marker-off-outline" />}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <Text style={styles.sectionCount}>{section.data.length}</Text>
          </View>
        )}
        renderItem={({ item }) => {
          const stale = locationStaleNotice(item, new Date(), policy);
          const distance = formatDistanceLabel(item.distanceMeters);
          return (
            <Press
              onPress={() => onOpen(item)}
              style={styles.row}
              accessibilityRole="button"
              accessibilityLabel={`${item.kind === "hospital" ? "Hospital" : "Base"} ${item.name}. ${item.address}, ${item.district}${distance ? `. ${distance}` : ""}`}
              accessibilityHint={accessibilityHints.openDetail}
            >
              <View style={[styles.icon, item.kind === "base" && styles.iconBase]}>
                <MaterialCommunityIcons name={item.kind === "hospital" ? "hospital-building" : "ambulance"} size={18} color={item.kind === "hospital" ? palette.primaryDark : palette.ink} />
              </View>
              <View style={styles.copy}>
                <Text style={styles.title} numberOfLines={2}>{item.shortName}</Text>
                <Text style={styles.meta} numberOfLines={1}>{item.address}</Text>
                {stale ? <Text style={styles.stale}>{stale}</Text> : null}
              </View>
              {distance ? <Text style={styles.distance}>{distance}</Text> : null}
              <MaterialCommunityIcons name="chevron-right" size={20} color={palette.inkMuted} accessibilityElementsHidden importantForAccessibility="no" />
            </Press>
          );
        }}
      />
    </View>
  );
}

function useStyles(palette: AdaptivePalette) {
  return useMemo(() => StyleSheet.create({
    fill: { flex: 1, backgroundColor: palette.paper },
    controls: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: spacing.sm },
    filters: { flexDirection: "row", gap: spacing.sm },
    listContent: { paddingBottom: TAB_BAR_INSET },
    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      backgroundColor: palette.paper,
    },
    sectionTitle: { ...typography.footnote, fontWeight: "600", color: palette.inkMuted },
    sectionCount: { ...typography.footnote, color: palette.inkMuted, fontVariant: ["tabular-nums"] },
    row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: palette.surface },
    icon: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: palette.primaryWash },
    iconBase: { backgroundColor: palette.surfaceMuted },
    copy: { flex: 1 },
    title: { ...typography.callout, fontWeight: "500", color: palette.ink },
    meta: { ...typography.footnote, color: palette.inkMuted, marginTop: 1 },
    stale: { ...typography.caption2, color: palette.amber, marginTop: 2 },
    distance: { ...typography.footnote, color: palette.inkMuted, fontVariant: ["tabular-nums"] },
    separator: { height: StyleSheet.hairlineWidth, backgroundColor: palette.line, marginLeft: spacing.lg + 34 + spacing.md },
  }), [palette]);
}

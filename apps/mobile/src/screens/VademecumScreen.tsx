import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ListRenderItemInfo,
  type SectionListData,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { radii, spacing, TAB_BAR_INSET, typography } from "@manual-samur/design-tokens";
import { accessibilityHints, accessibilityTargetStyle, type AdaptivePalette } from "../accessibility";
import { useTheme } from "../theme";
import { displayTitle } from "../title-case";
import { animateNextLayout, useReduceMotion } from "../hooks/motion";
import { selectionTick } from "../hooks/haptics";
import { Chip, Press } from "../components";
import { useContent } from "../content";
import { buildVademecumReferences, searchMobileReferences, type MobileReferenceSearchResult } from "../reference-search-logic";
import {
  buildAlphabetSections,
  buildCategorySections,
  categoryAccent,
  categoryOf,
  filterByCategory,
  filterByTab,
  supportsAlphabetNav,
  uniqueCategories,
  VADEMECUM_TABS,
  type VademecumAlphabetSection,
  type VademecumCategorySection,
  type VademecumTabKey,
} from "../vademecum-logic";
import type { RootStackParamList, TabsParamList } from "../navigation-types";

/**
 * The Vademécum destination: four domains (fármacos, perfusiones, fluidos,
 * comerciales) organised and filterable the way `VademecumView.tsx` organises
 * them on the web — category chips and an A-Z index for fármacos/comerciales,
 * category chips alone for perfusiones/fluidos — expressed as a SectionList
 * with sticky headers rather than a DOM port, the same shape `CodigosScreen`
 * established for the Códigos tab.
 *
 * The dose calculator (`DoseUtilityCard` in App.tsx) lives inside the drug
 * detail screen (`DrugScreen`), which every fármaco row here opens: it is
 * reachable as part of this destination without any change to its maths or
 * its fail-closed eligibility check.
 */
export function VademecumScreen({ navigation }: BottomTabScreenProps<TabsParamList, "VademecumList">) {
  const { content } = useContent();
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);

  const [activeTab, setActiveTab] = useState<VademecumTabKey>("farmacos");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const sectionListRef = useRef<SectionList<MobileReferenceSearchResult, VademecumAlphabetSection | VademecumCategorySection>>(null);

  const references = useMemo(() => buildVademecumReferences(content), [content]);
  const tabCounts = useMemo(
    () => Object.fromEntries(VADEMECUM_TABS.map((tab) => [tab.key, filterByTab(references, tab.key).length])) as Record<VademecumTabKey, number>,
    [references],
  );

  const switchTab = useCallback((key: VademecumTabKey) => {
    setActiveTab(key);
    setActiveCategory(null);
    sectionListRef.current?.scrollToLocation?.({ sectionIndex: 0, itemIndex: 0, viewPosition: 0, animated: false });
  }, []);

  const parentNavigation = navigation.getParent<NativeStackNavigationProp<RootStackParamList>>();

  const openReference = useCallback(
    (reference: MobileReferenceSearchResult) => {
      if (reference.kind === "drug" && reference.targetId) {
        parentNavigation?.navigate("Drug", { id: reference.targetId });
        return;
      }
      parentNavigation?.navigate("Vademecum", { routeKey: reference.routeKey });
    },
    [parentNavigation],
  );

  const searching = query.trim().length > 0;
  const searchResults = useMemo(() => {
    if (!searching) return [];
    const inTab = filterByTab(references, activeTab);
    return searchMobileReferences(inTab, query, 500);
  }, [activeTab, query, references, searching]);

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.pageTitle}>Vademécum</Text>
        <SearchField value={query} onChangeText={setQuery} palette={palette} styles={styles} />
      </View>

      <View style={styles.topTabsRow} accessibilityRole="tablist" accessibilityLabel="Dominios del vademécum">
        <FlatList
          horizontal
          data={VADEMECUM_TABS}
          keyExtractor={(tab) => tab.key}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.topTabsContent}
          renderItem={({ item: tab }) => {
            const focused = activeTab === tab.key;
            return (
              <Pressable
                onPress={() => switchTab(tab.key)}
                style={[styles.topTab, focused && styles.topTabActive, accessibilityTargetStyle()]}
                accessibilityRole="tab"
                accessibilityState={{ selected: focused }}
                accessibilityLabel={`${tab.label}, ${tabCounts[tab.key]} referencias`}
                accessibilityHint={focused ? undefined : accessibilityHints.switchTab}
              >
                <MaterialCommunityIcons name={tab.icon} size={15} color={focused ? palette.primary : palette.inkMuted} />
                <Text style={[styles.topTabLabel, focused && { color: palette.primary }]}>{tab.label}</Text>
                <Text style={styles.topTabCount}>{tabCounts[tab.key]}</Text>
              </Pressable>
            );
          }}
        />
      </View>

      {searching ? (
        <FlatList
          data={searchResults}
          keyExtractor={(item) => item.routeKey}
          contentContainerStyle={styles.sectionListContent}
          ListEmptyComponent={
            <EmptyState title="Sin coincidencias" detail="Prueba con el nombre, un sinónimo o la categoría publicada." palette={palette} styles={styles} />
          }
          renderItem={({ item }) => <VademecumRow reference={item} palette={palette} styles={styles} onPress={() => openReference(item)} />}
        />
      ) : (
        <DomainContent
          tab={activeTab}
          references={filterByTab(references, activeTab)}
          activeCategory={activeCategory}
          onSelectCategory={setActiveCategory}
          onOpen={openReference}
          palette={palette}
          styles={styles}
          sectionListRef={sectionListRef}
        />
      )}
    </SafeAreaView>
  );
}

// ─── Domain content (category chips + A-Z index or category sections) ──────

function DomainContent({
  tab,
  references,
  activeCategory,
  onSelectCategory,
  onOpen,
  palette,
  styles,
  sectionListRef,
}: {
  tab: VademecumTabKey;
  references: MobileReferenceSearchResult[];
  activeCategory: string | null;
  onSelectCategory: (category: string | null) => void;
  onOpen: (reference: MobileReferenceSearchResult) => void;
  palette: AdaptivePalette;
  styles: ReturnType<typeof createStyles>;
  sectionListRef: React.RefObject<SectionList<MobileReferenceSearchResult, VademecumAlphabetSection | VademecumCategorySection> | null>;
}) {
  // Fármacos filters by category *and* shows an A-Z index (mirrors the web:
  // both controls are visible together for this domain only). Comerciales
  // shows the A-Z index alone; perfusiones/fluidos show category chips alone.
  const showCategoryChips = tab === "farmacos" || tab === "perfusiones" || tab === "fluidos";
  const reduceMotion = useReduceMotion();
  // Open when a filter is already applied, so a narrowed list never looks
  // unfiltered behind a collapsed control.
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const showAlphabetIndex = supportsAlphabetNav(tab);

  const categories = useMemo(() => uniqueCategories(references), [references]);
  const filtered = useMemo(() => filterByCategory(references, activeCategory), [references, activeCategory]);

  const sections = useMemo<(VademecumAlphabetSection | VademecumCategorySection)[]>(
    () => (showAlphabetIndex ? buildAlphabetSections(filtered) : buildCategorySections(filtered)),
    [filtered, showAlphabetIndex],
  );

  const scrollToSection = useCallback(
    (sectionIndex: number) => {
      sectionListRef.current?.scrollToLocation({ sectionIndex, itemIndex: 0, viewPosition: 0, animated: true });
    },
    [sectionListRef],
  );

  return (
    <View style={styles.flexFill}>
      {showCategoryChips && categories.length > 1 && (
        <View style={styles.categoryRow}>
          <Press
            onPress={() => { selectionTick(); animateNextLayout(reduceMotion); setCategoriesOpen((open) => !open); }}
            style={styles.categoryToggle}
            accessibilityRole="button"
            accessibilityLabel={activeCategory ? `Filtro: ${activeCategory}` : "Filtrar por categoría"}
            accessibilityState={{ expanded: categoriesOpen }}
          >
            <MaterialCommunityIcons name="tune-variant" size={15} color={activeCategory ? categoryAccent(activeCategory) : palette.inkMuted} />
            <Text style={[styles.categoryToggleText, activeCategory && { color: categoryAccent(activeCategory) }]} numberOfLines={1}>
              {activeCategory ?? "Todas las categorías"}
            </Text>
            <MaterialCommunityIcons name={categoriesOpen ? "chevron-up" : "chevron-down"} size={16} color={palette.inkMuted} />
          </Press>
          {activeCategory && (
            <Press onPress={() => { selectionTick(); onSelectCategory(null); }} style={styles.categoryClear} accessibilityRole="button" accessibilityLabel="Quitar el filtro de categoría">
              <MaterialCommunityIcons name="close-circle" size={17} color={palette.inkMuted} />
            </Press>
          )}
        </View>
      )}
      {showCategoryChips && categories.length > 1 && categoriesOpen && (
        <View style={styles.categoryListRow} accessibilityRole="tablist" accessibilityLabel="Filtrar por categoría">
          <FlatList
            horizontal
            data={[null, ...categories]}
            keyExtractor={(category) => category ?? "__all__"}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryContent}
            renderItem={({ item: category }) => (
              <Chip
                label={category ?? "Todas"}
                selected={activeCategory === category}
                onPress={() => onSelectCategory(category)}
                dotColor={category ? categoryAccent(category) : undefined}
              />
            )}
          />
        </View>
      )}

      {showAlphabetIndex && sections.length > 1 && (
        <View style={styles.alphabetRow} accessibilityRole="tablist" accessibilityLabel="Ir a una letra">
          <FlatList
            horizontal
            data={sections}
            keyExtractor={(section) => section.key}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.alphabetContent}
            renderItem={({ item: section, index }) => (
              <Pressable
                onPress={() => scrollToSection(index)}
                style={[styles.alphabetChip, accessibilityTargetStyle(32)]}
                accessibilityRole="button"
                accessibilityLabel={`Ir a la letra ${section.key}`}
              >
                <Text style={styles.alphabetChipText}>{section.key}</Text>
              </Pressable>
            )}
          />
        </View>
      )}

      <SectionList
        ref={sectionListRef}
        sections={sections}
        keyExtractor={(item) => item.routeKey}
        stickySectionHeadersEnabled
        contentContainerStyle={styles.sectionListContent}
        onScrollToIndexFailed={() => undefined}
        ListEmptyComponent={<EmptyState title="Sin resultados" detail="No hay referencias para este filtro." palette={palette} styles={styles} />}
        renderSectionHeader={({ section }: { section: SectionListData<MobileReferenceSearchResult, VademecumAlphabetSection | VademecumCategorySection> }) => (
          <View style={styles.sectionHeader} accessibilityRole="header">
            {!showAlphabetIndex && <View style={[styles.sectionHeaderDot, { backgroundColor: categoryAccent(section.key) }]} />}
            <Text style={styles.sectionHeaderLabel}>{section.key}</Text>
            <Text style={styles.sectionHeaderCount}>{section.data.length}</Text>
          </View>
        )}
        renderItem={({ item }: ListRenderItemInfo<MobileReferenceSearchResult>) => (
          <VademecumRow reference={item} palette={palette} styles={styles} onPress={() => onOpen(item)} />
        )}
      />
    </View>
  );
}

// ─── Row renderers ───────────────────────────────────────────────────────────

function stringDetail(reference: MobileReferenceSearchResult, ...keys: string[]): string {
  const detail = reference.detail ?? {};
  for (const key of keys) {
    const value = detail[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function arrayDetail(reference: MobileReferenceSearchResult, key: string): string[] {
  const value = reference.detail?.[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

/** One row for any of the four domains — content only, no internal identifiers. */
function VademecumRow({
  reference,
  palette,
  styles,
  onPress,
}: {
  reference: MobileReferenceSearchResult;
  palette: AdaptivePalette;
  styles: ReturnType<typeof createStyles>;
  onPress: () => void;
}) {
  const category = categoryOf(reference);
  const accent = reference.kind === "drug" || reference.kind === "perfusion" ? categoryAccent(category) : palette.amber;
  const icon =
    reference.kind === "drug" ? "pill" : reference.kind === "perfusion" ? "iv-bag" : reference.kind === "fluid" ? "water-outline" : "tag-multiple-outline";

  if (reference.kind === "fluid") {
    const stats: [string, string][] = [
      ["Osmolaridad", stringDetail(reference, "osmolarity")],
      ["Na", stringDetail(reference, "sodium")],
      ["Cl", stringDetail(reference, "chloride")],
      ["Glucosa", stringDetail(reference, "glucose")],
      ["K", stringDetail(reference, "potassium")],
      ["pH", stringDetail(reference, "ph")],
    ].filter(([, value]) => value.length > 0) as [string, string][];
    const contraindications = arrayDetail(reference, "contraindications");
    return (
      <Pressable
        onPress={onPress}
        style={[styles.fluidCard, accessibilityTargetStyle()]}
        accessibilityRole="button"
        accessibilityLabel={`${reference.title}, ${reference.subtitle}`}
        accessibilityHint={accessibilityHints.openDetail}
      >
        <View style={styles.fluidCardHeader}>
          <View style={styles.rowCopy}>
            <Text style={styles.rowTitle}>{displayTitle(reference.title)}</Text>
            <Text style={styles.rowMeta}>{stringDetail(reference, "presentation")}</Text>
          </View>
          <View style={styles.fluidTypeBadge}>
            <Text style={styles.fluidTypeBadgeText}>{category}</Text>
          </View>
        </View>
        <View style={styles.fluidStatsRow}>
          {stats.map(([label, value]) => (
            <View key={label} style={styles.fluidStat}>
              <Text style={styles.fluidStatLabel}>{label}</Text>
              <Text style={styles.fluidStatValue}>{value}</Text>
            </View>
          ))}
        </View>
        {contraindications.length > 0 && (
          <View style={styles.fluidChipsRow}>
            {contraindications.map((item) => (
              <View key={item} style={styles.fluidWarningChip}>
                <Text style={styles.fluidWarningChipText}>{item}</Text>
              </View>
            ))}
          </View>
        )}
      </Pressable>
    );
  }

  if (reference.kind === "commercialName") {
    const brandNames = arrayDetail(reference, "brandNames");
    return (
      <Pressable
        onPress={onPress}
        style={[styles.commercialCard, accessibilityTargetStyle()]}
        accessibilityRole="button"
        accessibilityLabel={`${reference.title}, nombres comerciales`}
        accessibilityHint={accessibilityHints.openDetail}
      >
        <Text style={styles.rowTitle}>{displayTitle(reference.title)}</Text>
        <Text style={styles.rowMeta}>{stringDetail(reference, "presentation")}</Text>
        <View style={styles.fluidChipsRow}>
          {brandNames.map((brand) => (
            <View key={brand} style={styles.brandChip}>
              <Text style={styles.brandChipText}>{brand}</Text>
            </View>
          ))}
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      style={[styles.resourceRow, accessibilityTargetStyle()]}
      accessibilityRole="button"
      accessibilityLabel={`${reference.title}. ${reference.subtitle}`}
      accessibilityHint={accessibilityHints.openDetail}
    >
      <View style={[styles.rowAccentBar, { backgroundColor: accent }]} />
      <MaterialCommunityIcons name={icon} size={18} color={palette.ink} style={styles.rowIcon} />
      <View style={styles.rowCopy}>
        <Text style={styles.rowTitle}>{displayTitle(reference.title)}</Text>
        <Text style={styles.rowMeta} numberOfLines={reference.kind === "perfusion" ? 1 : 2}>
          {reference.kind === "perfusion" ? stringDetail(reference, "recipe") || reference.subtitle : reference.subtitle}
        </Text>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={20} color={palette.inkMuted} accessibilityElementsHidden />
    </Pressable>
  );
}

// ─── Shared bits ─────────────────────────────────────────────────────────────

function SearchField({
  value,
  onChangeText,
  palette,
  styles,
}: {
  value: string;
  onChangeText: (value: string) => void;
  palette: AdaptivePalette;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.searchBar}>
      <MaterialCommunityIcons name="magnify" size={18} color={palette.inkMuted} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder="Buscar fármaco, perfusión o fluido"
        placeholderTextColor={palette.inkMuted}
        style={styles.searchInput}
        accessibilityLabel="Buscar en el vademécum"
        accessibilityHint={accessibilityHints.search}
        autoCorrect={false}
        returnKeyType="search"
      />
      {value.length > 0 && (
        <Pressable onPress={() => onChangeText("")} style={accessibilityTargetStyle(32)} accessibilityRole="button" accessibilityLabel="Borrar búsqueda">
          <MaterialCommunityIcons name="close-circle" size={18} color={palette.inkMuted} />
        </Pressable>
      )}
    </View>
  );
}

function EmptyState({
  title,
  detail,
  palette,
  styles,
}: {
  title: string;
  detail: string;
  palette: AdaptivePalette;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.emptyState}>
      <MaterialCommunityIcons name="text-search" size={26} color={palette.inkMuted} />
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyDetail}>{detail}</Text>
    </View>
  );
}

function createStyles(palette: AdaptivePalette) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: palette.paper },
    flexFill: { flex: 1 },
    header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
    pageTitle: { color: palette.ink, fontSize: typography.largeTitle.fontSize, lineHeight: typography.largeTitle.lineHeight, fontWeight: "700", letterSpacing: -0.8 },
    searchBar: {
      minHeight: 46,
      borderRadius: radii.md,
      backgroundColor: palette.surface,
      borderWidth: 1,
      borderColor: palette.line,
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: spacing.md,
      gap: spacing.sm,
      marginTop: spacing.md,
    },
    searchInput: { flex: 1, color: palette.ink, fontSize: 14, paddingVertical: 0 },
    topTabsRow: { borderBottomWidth: 1, borderBottomColor: palette.line },
    topTabsContent: { paddingHorizontal: spacing.lg, gap: spacing.xs },
    topTab: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderBottomWidth: 2,
      borderBottomColor: "transparent",
    },
    topTabActive: { borderBottomColor: palette.primary },
    topTabLabel: { color: palette.inkMuted, fontSize: 13, fontWeight: "700" },
    topTabCount: { color: palette.inkMuted, fontSize: 12, fontWeight: "500", fontVariant: ["tabular-nums"] },
    categoryToggle: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md, minHeight: 36, borderRadius: radii.pill, backgroundColor: palette.surfaceMuted, flexShrink: 1 },
    categoryToggleText: { flexShrink: 1, fontSize: 13, fontWeight: "500", color: palette.inkMuted },
    categoryClear: { alignItems: "center", justifyContent: "center" },
    categoryListRow: { paddingBottom: spacing.sm },
    categoryRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
    categoryContent: { paddingHorizontal: spacing.lg, gap: spacing.xs },
    categoryChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      minHeight: 36,
      paddingHorizontal: spacing.md,
      borderRadius: radii.pill,
      borderWidth: 1,
      borderColor: palette.line,
      backgroundColor: palette.surfaceMuted,
      justifyContent: "center",
    },
    categoryDot: { width: 7, height: 7, borderRadius: 4 },
    categoryChipText: { color: palette.inkMuted, fontSize: 12, fontWeight: "700" },
    alphabetRow: { paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: palette.line },
    alphabetContent: { paddingHorizontal: spacing.lg, gap: 4 },
    alphabetChip: {
      minWidth: 30,
      minHeight: 30,
      borderRadius: 15,
      backgroundColor: palette.surfaceMuted,
      alignItems: "center",
      justifyContent: "center",
    },
    alphabetChipText: { color: palette.ink, fontSize: 12, fontWeight: "700" },
    sectionListContent: { paddingBottom: TAB_BAR_INSET },
    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      backgroundColor: palette.paper,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: palette.line,
    },
    sectionHeaderDot: { width: 8, height: 8, borderRadius: 4 },
    sectionHeaderLabel: { flex: 1, color: palette.ink, fontSize: 13, fontWeight: "700" },
    sectionHeaderCount: { color: palette.inkMuted, fontSize: 11, fontWeight: "600" },
    resourceRow: {
      minHeight: 56,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: palette.line,
    },
    rowAccentBar: { width: 3, alignSelf: "stretch", borderRadius: 2 },
    rowIcon: { marginRight: -spacing.xs },
    rowCopy: { flex: 1 },
    rowTitle: { color: palette.ink, fontSize: 14, fontWeight: "700" },
    rowMeta: { color: palette.inkMuted, fontSize: 11, marginTop: 2, lineHeight: 15 },
    fluidCard: {
      marginHorizontal: spacing.lg,
      marginTop: spacing.md,
      padding: spacing.md,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: palette.line,
      backgroundColor: palette.surface,
      gap: spacing.sm,
    },
    fluidCardHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.sm },
    fluidTypeBadge: { backgroundColor: palette.surfaceMuted, borderRadius: radii.pill, paddingHorizontal: spacing.sm, paddingVertical: 4 },
    fluidTypeBadgeText: { color: palette.ink, fontSize: 12, fontWeight: "600" },
    fluidStatsRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    fluidStat: { minWidth: 74, borderRadius: radii.sm, borderWidth: 1, borderColor: palette.lineStrong, paddingHorizontal: spacing.sm, paddingVertical: 6 },
    fluidStatLabel: { color: palette.inkMuted, fontSize: 12, fontWeight: "500" },
    fluidStatValue: { color: palette.ink, fontSize: 12, fontWeight: "700", marginTop: 2 },
    fluidChipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
    fluidWarningChip: { backgroundColor: palette.dangerWash, borderRadius: radii.pill, paddingHorizontal: spacing.sm, paddingVertical: 4 },
    fluidWarningChipText: { color: palette.dangerDark, fontSize: 12, fontWeight: "600" },
    commercialCard: {
      marginHorizontal: spacing.lg,
      marginTop: spacing.md,
      padding: spacing.md,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: palette.line,
      backgroundColor: palette.surface,
      gap: spacing.sm,
    },
    brandChip: { backgroundColor: palette.amberWash, borderRadius: radii.pill, paddingHorizontal: spacing.sm, paddingVertical: 4 },
    brandChipText: { color: palette.amber, fontSize: 11, fontWeight: "700" },
    emptyState: { alignItems: "center", padding: spacing.xl, gap: spacing.sm },
    emptyTitle: { color: palette.ink, fontWeight: "800", fontSize: 15 },
    emptyDetail: { color: palette.inkMuted, textAlign: "center", fontSize: 12, lineHeight: 17 },
  });
}

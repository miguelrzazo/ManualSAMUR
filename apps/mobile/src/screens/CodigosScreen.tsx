import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Linking,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  View,
  type ListRenderItemInfo,
  type SectionListData,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { radii, spacing, TAB_BAR_INSET } from "@manual-samur/design-tokens";
import { accessibilityHints, accessibilityTargetStyle, type AdaptivePalette } from "../accessibility";
import { useTheme } from "../theme";
import {
  asCheatsheetSections,
  asCodigosBases,
  asCodigosCodes,
  asCodigosHospitals,
  asCodigosIndicativos,
  asSimpleCodes,
  asStatus4Entries,
  buildCodeSections,
  buildHospitalList,
  buildJumpTargets,
  COMUNICACIONES_SECTION_KEYS,
  filterIndicativos,
  getCheatsheetSection,
  groupByCategoryField,
  groupBasesByDistrict,
  groupIndicativos,
  hasNoReportCodes,
  hasTetraCodes,
  isCodeTab,
  OTROS_TABS,
  TOP_TABS,
  usesFamilyColor,
  type CodigosCode,
  type CodigosRow,
  type CodigosSection,
  type OtrosTabKey,
  type TopTabKey,
} from "../codigos-logic";
import { useContent } from "../content";
import { Chip, EmptyState, PageHeader, SearchField } from "../components";
import { codeRouteKey, searchCodes } from "../reference-search-logic";
import type { RootStackParamList, TabsParamList } from "../navigation-types";

export function CodigosScreen({ route, navigation }: BottomTabScreenProps<TabsParamList, "Codigos">) {
  const { content } = useContent();
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);

  const [activeTab, setActiveTab] = useState<TopTabKey>("incidente");
  const [activeOtrosTab, setActiveOtrosTab] = useState<OtrosTabKey>("icao");
  const [query, setQuery] = useState(route.params?.query ?? "");
  const sectionListRef = useRef<SectionList<CodigosRow, CodigosSection>>(null);
  const [showBackToTop, setShowBackToTop] = useState(false);

  const codeDataByTab = useMemo(
    () => ({
      incidente: asCodigosCodes(content.codes.incidente),
      sva: asCodigosCodes(content.codes.sva),
      svb: asCodigosCodes(content.codes.svb),
      upsi: asCodigosCodes(content.codes.upsi),
      upsq: asCodigosCodes(content.codes.upsq),
    }),
    [content.codes],
  );

  const searchResults = useMemo(() => (query.trim() ? searchCodes(content.codes, query, 500) : []), [content.codes, query]);

  const switchTab = useCallback((key: TopTabKey) => {
    setActiveTab(key);
  }, []);

  const openCode = useCallback(
    (routeKey: string) => {
      const parentNavigation = navigation.getParent<NativeStackNavigationProp<RootStackParamList>>();
      parentNavigation?.navigate("Code", { routeKey });
    },
    [navigation],
  );

  const openStatus4 = useCallback(() => {
    const parentNavigation = navigation.getParent<NativeStackNavigationProp<RootStackParamList>>();
    parentNavigation?.navigate("Status4");
  }, [navigation]);

  if (query.trim()) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        <PageHeader title="Códigos y claves" />
        <View style={styles.header}>
          <SearchField value={query} onChangeText={setQuery} placeholder="Buscar código, nombre o categoría" />
        </View>
        <FlatList
          data={searchResults}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.sectionListContent}
          ListEmptyComponent={
            <EmptyState
              title="Sin coincidencias"
              detail="Prueba con el código, nombre, categoría o descripción."
            />
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => openCode(item.routeKey)}
              style={[styles.codeRow, accessibilityTargetStyle()]}
              accessibilityRole="button"
              accessibilityLabel={`Abrir código ${item.badge ?? item.title}`}
              accessibilityHint={accessibilityHints.openDetail}
            >
              <Text style={styles.codeBadge}>{item.badge ?? "—"}</Text>
              <View style={styles.rowCopy}>
                <Text style={styles.rowTitle}>{item.title}</Text>
                <Text style={styles.rowMeta}>{item.subtitle}</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={20} color={palette.inkMuted} />
            </Pressable>
          )}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <PageHeader title="Códigos y claves" />
      <View style={styles.header}>
        <SearchField value={query} onChangeText={setQuery} placeholder="Buscar código, nombre o categoría" />
      </View>

      <View style={styles.topTabsRow} accessibilityRole="tablist" accessibilityLabel="Categorías de códigos">
        <FlatList
          horizontal
          data={TOP_TABS}
          keyExtractor={(tab) => tab.key}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.topTabsContent}
          renderItem={({ item: tab }) => {
            const focused = activeTab === tab.key;
            const count = isCodeTab(tab.key) ? codeDataByTab[tab.key as keyof typeof codeDataByTab].length : undefined;
            return (
              <Pressable
                onPress={() => switchTab(tab.key)}
                style={[styles.topTab, focused && styles.topTabActive, accessibilityTargetStyle()]}
                accessibilityRole="tab"
                accessibilityState={{ selected: focused }}
                accessibilityLabel={`${tab.label}${count ? `, ${count} códigos` : ""}`}
                accessibilityHint={focused ? undefined : accessibilityHints.switchTab}
              >
                <View style={[styles.topTabDot, { backgroundColor: tab.color }]} />
                <Text style={[styles.topTabLabel, focused && { color: tab.color }]}>{tab.label}</Text>
                {count !== undefined && <Text style={styles.topTabCount}>{count}</Text>}
              </Pressable>
            );
          }}
        />
      </View>

      {activeTab === "otros" && (
        <View style={styles.otrosRow} accessibilityRole="tablist" accessibilityLabel="Otros: subcategorías">
          <FlatList
            horizontal
            data={OTROS_TABS}
            keyExtractor={(tab) => tab.key}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.otrosContent}
            renderItem={({ item: tab }) => {
              const focused = activeOtrosTab === tab.key;
              return <Chip label={tab.label} selected={focused} onPress={() => setActiveOtrosTab(tab.key)} role="tab" />;
            }}
          />
        </View>
      )}

      {activeTab === "otros" ? (
        <OtrosContent
          tab={activeOtrosTab}
          content={content}
          palette={palette}
          styles={styles}
          onOpenCode={openCode}
          onOpenStatus4={openStatus4}
        />
      ) : (
        <CodeGroupList
          tabKey={activeTab}
          codes={codeDataByTab[activeTab]}
          onOpenCode={openCode}
          palette={palette}
          styles={styles}
          sectionListRef={sectionListRef}
          showBackToTop={showBackToTop}
          onShowBackToTopChange={setShowBackToTop}
        />
      )}
    </SafeAreaView>
  );
}

// ─── Grouped code list (Incidente / SVA / SVB / UPSI / UPSQ) ───────────────

function CodeGroupList({
  tabKey,
  codes,
  onOpenCode,
  palette,
  styles,
  sectionListRef,
  showBackToTop,
  onShowBackToTopChange,
}: {
  tabKey: TopTabKey;
  codes: CodigosCode[];
  onOpenCode: (routeKey: string) => void;
  palette: AdaptivePalette;
  styles: ReturnType<typeof createStyles>;
  sectionListRef: React.RefObject<SectionList<CodigosRow, CodigosSection> | null>;
  showBackToTop: boolean;
  onShowBackToTopChange: (visible: boolean) => void;
}) {
  const sections = useMemo(() => buildCodeSections(tabKey, codes), [tabKey, codes]);
  const jumpTargets = useMemo(() => buildJumpTargets(sections), [sections]);
  const showNoReportLegend = usesFamilyColor(tabKey) && hasNoReportCodes(codes);
  const showTetraLegend = tabKey === "incidente" && hasTetraCodes(codes);

  const scrollToSection = useCallback(
    (sectionIndex: number) => {
      sectionListRef.current?.scrollToLocation({ sectionIndex, itemIndex: 0, viewPosition: 0, animated: true });
    },
    [sectionListRef],
  );

  const scrollToTop = useCallback(() => {
    if (sections.length === 0) return;
    sectionListRef.current?.scrollToLocation({ sectionIndex: 0, itemIndex: 0, viewPosition: 0, animated: true });
  }, [sectionListRef, sections.length]);

  return (
    <View style={styles.flexFill}>
      {jumpTargets.length > 1 && (
        // The one pill row on this screen. It used to sit under a second, uncoloured row
        // built from `uniqueCategories`, whose labels were near-duplicates of these — two
        // treatments and two behaviours for what read as the same list.
        <View style={styles.jumpRow} accessibilityLabel="Ir a un grupo">
          <FlatList
            horizontal
            data={jumpTargets}
            keyExtractor={(target) => target.key}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.jumpContent}
            renderItem={({ item: target }) => (
              <Chip
                label={target.label}
                accent={target.accentColor}
                onPress={() => scrollToSection(sections.findIndex((section) => section.key === target.key))}
                accessibilityLabel={`Ir al grupo ${target.label}`}
                accessibilityHint="Desplaza la lista hasta este grupo."
              />
            )}
          />
        </View>
      )}

      {(showNoReportLegend || showTetraLegend) && (
        <View style={styles.legendBlock}>
          {showTetraLegend && (
            <View style={styles.legendRow}>
              <MaterialCommunityIcons name="radio-handheld" size={14} color={palette.primary} />
              <Text style={styles.legendText}>
                Transmitir por <Text style={styles.legendStrong}>TETRA y llamada de voz</Text>, salvo levedad
                contrastada
              </Text>
            </View>
          )}
          {showNoReportLegend && (
            <View style={styles.legendRow}>
              <MaterialCommunityIcons name="file-remove-outline" size={14} color={palette.inkMuted} />
              <Text style={styles.legendText}>
                Los códigos marcados con este icono <Text style={styles.legendStrong}>no generan informe asistencial</Text>
              </Text>
            </View>
          )}
        </View>
      )}

      <SectionList
        ref={sectionListRef}
        sections={sections}
        keyExtractor={(row) => row.id}
        stickySectionHeadersEnabled
        contentContainerStyle={styles.sectionListContent}
        onScroll={(event) => onShowBackToTopChange(event.nativeEvent.contentOffset.y > 400)}
        scrollEventThrottle={32}
        onScrollToIndexFailed={() => undefined}
        ListEmptyComponent={
          <EmptyState title="Sin resultados" detail="No hay códigos para este filtro." />
        }
        renderSectionHeader={({ section }: { section: SectionListData<CodigosRow, CodigosSection> }) => (
          <View style={styles.sectionHeader} accessibilityRole="header">
            <View
              style={[
                styles.sectionHeaderBadge,
                section.accentColor ? { backgroundColor: `${section.accentColor}22` } : undefined,
              ]}
            >
              <Text style={[styles.sectionHeaderBadgeText, section.accentColor ? { color: section.accentColor } : undefined]}>
                {section.key}
              </Text>
            </View>
            <Text style={styles.sectionHeaderLabel}>{section.label}</Text>
            <Text style={styles.sectionHeaderCount}>{section.count}</Text>
          </View>
        )}
        renderItem={({ item }: ListRenderItemInfo<CodigosRow>) => {
          if (item.type === "subgroup") {
            return (
              <Text style={styles.subgroupHeader} accessibilityRole="header">
                {item.title}
              </Text>
            );
          }
          const code = item.item!;
          return (
            <Pressable
              onPress={() => onOpenCode(`code:${tabKey}:${code.code}`)}
              style={[styles.codeRow, item.indented && styles.codeRowIndented, accessibilityTargetStyle()]}
              accessibilityRole="button"
              accessibilityLabel={`Código ${code.code}, ${code.name}`}
              accessibilityHint={accessibilityHints.openDetail}
            >
              <Text style={[styles.codeBadge, item.accentColor ? { color: item.accentColor } : undefined]}>{code.code}</Text>
              <View style={styles.rowCopy}>
                <View style={styles.rowTitleLine}>
                  {code.noReport && (
                    <MaterialCommunityIcons
                      name="file-remove-outline"
                      size={13}
                      color={palette.inkMuted}
                      accessibilityLabel="Sin informe asistencial"
                    />
                  )}
                  {code.tetra && (
                    <MaterialCommunityIcons
                      name="radio-handheld"
                      size={13}
                      color={palette.primary}
                      accessibilityLabel="Transmitir por TETRA y llamada de voz"
                    />
                  )}
                  <Text style={styles.rowTitle}>{code.name}</Text>
                </View>
              </View>
            </Pressable>
          );
        }}
      />

      {showBackToTop && (
        <Pressable
          onPress={scrollToTop}
          style={[styles.backToTop, accessibilityTargetStyle()]}
          accessibilityRole="button"
          accessibilityLabel="Volver arriba"
        >
          <MaterialCommunityIcons name="arrow-up" size={20} color={palette.white} />
        </Pressable>
      )}
    </View>
  );
}

// ─── Otros content ──────────────────────────────────────────────────────────

function OtrosContent({
  tab,
  content,
  palette,
  styles,
  onOpenCode,
  onOpenStatus4,
}: {
  tab: OtrosTabKey;
  content: { codes: Record<string, unknown[]>; hospitals: unknown[]; bases: unknown[]; status4: unknown[] };
  palette: AdaptivePalette;
  styles: ReturnType<typeof createStyles>;
  onOpenCode: (routeKey: string) => void;
  onOpenStatus4: () => void;
}) {
  const [showPrivate, setShowPrivate] = useState(false);

  const icao = useMemo(() => asSimpleCodes(content.codes.icao), [content.codes.icao]);
  const indicativos = useMemo(
    () => groupIndicativos(filterIndicativos(asCodigosIndicativos(content.codes.indicativos))),
    [content.codes.indicativos],
  );
  const claves = useMemo(() => asSimpleCodes(content.codes.claves), [content.codes.claves]);
  const lima = useMemo(() => groupByCategoryField(asSimpleCodes(content.codes.lima)), [content.codes.lima]);
  const bases = useMemo(() => asCodigosBases(content.bases), [content.bases]);
  const hospitals = useMemo(() => asCodigosHospitals(content.hospitals), [content.hospitals]);
  const status4 = useMemo(() => asStatus4Entries(content.status4), [content.status4]);
  const hospitalList = useMemo(() => buildHospitalList(hospitals, status4), [hospitals, status4]);
  const cheatsheet = useMemo(() => asCheatsheetSections(content.codes.cheatsheet ?? []), [content.codes.cheatsheet]);
  const districts = useMemo(() => groupBasesByDistrict(bases), [bases]);

  const filteredHospitals = useMemo(
    () => hospitalList.filter((h) => (showPrivate ? h.type === "private" : h.type === "public")),
    [hospitalList, showPrivate],
  );

  if (tab === "icao") {
    return (
      <FlatList
        data={icao}
        keyExtractor={(item, index) => `${item.code}-${index}`}
        contentContainerStyle={styles.sectionListContent}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => onOpenCode(codeRouteKey("icao", item.code))}
            style={[styles.simpleRow, accessibilityTargetStyle()]}
            accessibilityRole="button"
            accessibilityLabel={`Código ICAO ${item.code}, ${item.name}`}
            accessibilityHint={accessibilityHints.openDetail}
          >
            <Text style={styles.codeBadge}>{item.code}</Text>
            <Text style={styles.rowTitle}>{item.name}</Text>
          </Pressable>
        )}
      />
    );
  }

  if (tab === "indicativos") {
    return (
      <SectionList
        sections={indicativos.map((g) => ({ key: g.group, label: g.group, count: g.items.length, data: g.items }))}
        keyExtractor={(item, index) => `${item.code}-${index}`}
        stickySectionHeadersEnabled
        contentContainerStyle={styles.sectionListContent}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader} accessibilityRole="header">
            <Text style={styles.sectionHeaderLabel}>{section.label}</Text>
            <Text style={styles.sectionHeaderCount}>{section.count}</Text>
          </View>
        )}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => onOpenCode(codeRouteKey("indicativos", item.code))}
            style={[styles.simpleRow, accessibilityTargetStyle()]}
            accessibilityRole="button"
            accessibilityLabel={`Indicativo ${item.code}, ${item.name}`}
            accessibilityHint={accessibilityHints.openDetail}
          >
            <Text style={styles.indicativoCode}>{item.code}</Text>
            <Text style={styles.rowMeta}>{item.name}</Text>
          </Pressable>
        )}
      />
    );
  }

  if (tab === "claves") {
    return (
      <FlatList
        data={claves}
        keyExtractor={(item, index) => `${item.code}-${index}`}
        contentContainerStyle={styles.sectionListContent}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => onOpenCode(codeRouteKey("claves", item.code))}
            style={[styles.simpleRow, accessibilityTargetStyle()]}
            accessibilityRole="button"
            accessibilityLabel={`Clave ${item.code}, ${item.name}`}
            accessibilityHint={accessibilityHints.openDetail}
          >
            <Text style={styles.codeBadge}>{item.code}</Text>
            <Text style={styles.rowTitle}>{item.name}</Text>
          </Pressable>
        )}
      />
    );
  }

  if (tab === "bases") {
    return (
      <FlatList
        data={bases}
        keyExtractor={(base) => base.id}
        contentContainerStyle={styles.sectionListContent}
        renderItem={({ item: base }) => (
          <Pressable
            onPress={() => void Linking.openURL(`https://www.google.com/maps?q=${base.lat},${base.lng}`)}
            style={[styles.locationRow, accessibilityTargetStyle()]}
            accessibilityRole="link"
            accessibilityLabel={`Base ${base.number}, ${base.name}, ${base.district}`}
            accessibilityHint={accessibilityHints.openMap}
          >
            <Text style={styles.baseNumber}>{base.number}</Text>
            <View style={styles.rowCopy}>
              <Text style={styles.rowTitle}>{base.name}</Text>
              <Text style={styles.rowMeta}>
                {base.address} · {base.district}
              </Text>
            </View>
            <MaterialCommunityIcons name="map-marker-outline" size={18} color={palette.inkMuted} />
          </Pressable>
        )}
      />
    );
  }

  if (tab === "hospitales") {
    return (
      <View style={styles.flexFill}>
        <View style={styles.hospitalFilterRow}>
          <Chip label="Públicos" selected={!showPrivate} onPress={() => setShowPrivate(false)} role="tab" accessibilityLabel="Mostrar hospitales públicos" />
          <Chip label="Privados" selected={showPrivate} onPress={() => setShowPrivate(true)} role="tab" accessibilityLabel="Mostrar hospitales privados" />
          <Pressable
            onPress={onOpenStatus4}
            style={[styles.status4Button, accessibilityTargetStyle()]}
            accessibilityRole="button"
            accessibilityLabel="Abrir hoja de referencia Status 4"
            accessibilityHint={accessibilityHints.openDetail}
          >
            <MaterialCommunityIcons name="hospital-box-outline" size={16} color={palette.primary} />
            <Text style={styles.status4ButtonText}>Status 4</Text>
          </Pressable>
        </View>
        <FlatList
          data={filteredHospitals}
          keyExtractor={(h) => h.id}
          contentContainerStyle={styles.sectionListContent}
          ListEmptyComponent={
            <EmptyState title="Sin hospitales" detail="No hay hospitales para este filtro." />
          }
          renderItem={({ item: hospital }) => (
            <Pressable
              onPress={() =>
                hospital.lat && hospital.lng
                  ? void Linking.openURL(`https://www.google.com/maps?q=${hospital.lat},${hospital.lng}`)
                  : undefined
              }
              style={[styles.locationRow, accessibilityTargetStyle()]}
              accessibilityRole={hospital.lat ? "link" : "text"}
              accessibilityLabel={`${hospital.name}${hospital.status4 !== null ? `, status 4 más ${hospital.status4}` : ""}`}
              accessibilityHint={hospital.lat ? accessibilityHints.openMap : undefined}
            >
              <View style={styles.hospitalBadgeStack}>
                <Text style={styles.hospitalId}>{hospital.id}</Text>
                {hospital.status4 !== null && <Text style={styles.hospitalStatus4}>4+{hospital.status4}</Text>}
              </View>
              <View style={styles.rowCopy}>
                <Text style={styles.rowTitle}>{hospital.name}</Text>
                <Text style={styles.rowMeta}>{hospital.address}</Text>
              </View>
              {hospital.lat && <MaterialCommunityIcons name="map-marker-outline" size={18} color={palette.inkMuted} />}
            </Pressable>
          )}
        />
      </View>
    );
  }

  if (tab === "lima") {
    return (
      <SectionList
        sections={lima.map((g) => ({ key: g.category, label: g.category, count: g.items.length, data: g.items }))}
        keyExtractor={(item, index) => `${item.code}-${index}`}
        stickySectionHeadersEnabled
        contentContainerStyle={styles.sectionListContent}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader} accessibilityRole="header">
            <Text style={styles.sectionHeaderLabel}>{section.label}</Text>
            <Text style={styles.sectionHeaderCount}>{section.count}</Text>
          </View>
        )}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => onOpenCode(codeRouteKey("lima", item.code))}
            style={[styles.simpleRow, accessibilityTargetStyle()]}
            accessibilityRole="button"
            accessibilityLabel={`Código Lima ${item.code}, ${item.name}`}
            accessibilityHint={accessibilityHints.openDetail}
          >
            <Text style={styles.codeBadge}>{item.code}</Text>
            <Text style={styles.rowTitle}>{item.name}</Text>
          </Pressable>
        )}
      />
    );
  }

  if (tab === "distritos") {
    return (
      <FlatList
        data={districts}
        keyExtractor={(d) => String(d.num)}
        contentContainerStyle={styles.sectionListContent}
        renderItem={({ item: district }) => (
          <View style={styles.districtRow} accessible accessibilityLabel={`Distrito ${district.num}, ${district.name}`}>
            <Text style={styles.districtNum}>{district.num}</Text>
            <View style={styles.rowCopy}>
              <Text style={styles.rowTitle}>{district.name}</Text>
              {district.bases.length > 0 ? (
                <View style={styles.districtBaseChips}>
                  {district.bases.map((base) => (
                    <Chip
                      key={base.id}
                      label={`B${base.number} · ${base.name}`}
                      onPress={() => void Linking.openURL(`https://www.google.com/maps?q=${base.lat},${base.lng}`)}
                      accessibilityLabel={`Base ${base.number}, ${base.name}`}
                      accessibilityHint={accessibilityHints.openMap}
                    />
                  ))}
                </View>
              ) : (
                <Text style={styles.rowMeta}>Sin bases operativas</Text>
              )}
            </View>
          </View>
        )}
      />
    );
  }

  // tab === "comunicaciones": static radio-procedure content, shipped offline
  // under content.codes.cheatsheet — same order as the web's ComunicacionesContent
  // (Tetra, Frases típicas, Grupos de habla, Estatus).
  const comunicacionesSections = COMUNICACIONES_SECTION_KEYS.map((key) => getCheatsheetSection(cheatsheet, key)).filter(
    (s): s is NonNullable<typeof s> => Boolean(s),
  );

  return (
    <FlatList
      data={comunicacionesSections}
      keyExtractor={(section) => section.key}
      contentContainerStyle={styles.sectionListContent}
      ListEmptyComponent={
        <EmptyState
          title="Contenido no disponible"
          detail="No se encontró el contenido de comunicaciones en el paquete local."
        />
      }
      renderItem={({ item: section }) => (
        <View style={styles.comunicacionesSection}>
          <Text style={styles.comunicacionesSectionTitle} accessibilityRole="header">
            {section.title}
          </Text>
          {section.kind === "cards"
            ? section.items.map((card, index) => (
                <View key={index} style={styles.comunicacionesCard}>
                  <Text style={styles.comunicacionesCardTitle}>{String(card.title ?? "")}</Text>
                  {(Array.isArray(card.lines) ? card.lines : []).map((line, lineIndex) => (
                    <Text key={lineIndex} style={styles.comunicacionesCardLine}>
                      {line}
                    </Text>
                  ))}
                </View>
              ))
            : section.items.map((row, index) => (
                <View key={index} style={styles.comunicacionesTableRow}>
                  {(section.columns ?? []).map((column) => (
                    <Text key={column} style={styles.comunicacionesTableCell}>
                      {String(row[column] ?? "")}
                    </Text>
                  ))}
                </View>
              ))}
        </View>
      )}
    />
  );
}

// ─── Shared bits ─────────────────────────────────────────────────────────────

function createStyles(palette: AdaptivePalette) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: palette.paper },
    flexFill: { flex: 1 },
    header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
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
    topTabActive: { borderBottomColor: palette.ink },
    topTabDot: { width: 7, height: 7, borderRadius: 4 },
    topTabLabel: { color: palette.inkMuted, fontSize: 13, fontWeight: "700" },
    topTabCount: { color: palette.inkMuted, fontSize: 12, fontWeight: "500", fontVariant: ["tabular-nums"] },
    otrosRow: { backgroundColor: palette.surfaceMuted, borderBottomWidth: 1, borderBottomColor: palette.line },
    otrosContent: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, gap: spacing.xs },
    jumpRow: { paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: palette.line },
    jumpContent: { paddingHorizontal: spacing.lg, gap: spacing.xs },
    legendBlock: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, gap: 4, borderBottomWidth: 1, borderBottomColor: palette.line },
    legendRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    legendText: { flex: 1, color: palette.inkMuted, fontSize: 11, lineHeight: 15 },
    legendStrong: { fontWeight: "800", color: palette.ink },
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
    sectionHeaderBadge: { backgroundColor: palette.surfaceMuted, borderRadius: radii.sm, paddingHorizontal: 8, paddingVertical: 3 },
    sectionHeaderBadgeText: { fontSize: 11, fontWeight: "800", color: palette.ink },
    sectionHeaderLabel: { flex: 1, color: palette.ink, fontSize: 15, fontWeight: "600" },
    sectionHeaderCount: { color: palette.inkMuted, fontSize: 11, fontWeight: "600" },
    subgroupHeader: {
      backgroundColor: palette.paper,
      color: palette.inkMuted,
      fontSize: 13,
      fontWeight: "600",
      letterSpacing: -0.08,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      paddingBottom: 4,
    },
    codeRow: {
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: palette.line,
    },
    codeRowIndented: { paddingLeft: spacing.xxl },
    codeBadge: { minWidth: 56, textAlign: "center", color: palette.primary, fontSize: 13, fontWeight: "800", fontVariant: ["tabular-nums"] },
    rowCopy: { flex: 1 },
    rowTitleLine: { flexDirection: "row", alignItems: "center", gap: 6 },
    rowTitle: { color: palette.ink, fontSize: 14, fontWeight: "600", flexShrink: 1 },
    rowMeta: { color: palette.inkMuted, fontSize: 11, marginTop: 2 },
    simpleRow: {
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: palette.line,
    },
    indicativoCode: { minWidth: 96, color: palette.ink, fontSize: 12, fontWeight: "800" },
    locationRow: {
      minHeight: 60,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: palette.line,
    },
    baseNumber: {
      minWidth: 32,
      textAlign: "center",
      backgroundColor: palette.surfaceMuted,
      color: palette.ink,
      fontWeight: "800",
      fontSize: 13,
      borderRadius: radii.sm,
      paddingVertical: 4,
    },
    hospitalFilterRow: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, alignItems: "center" },
    hospitalBadgeStack: { alignItems: "center", gap: 3, minWidth: 46 },
    hospitalId: { fontSize: 11, fontWeight: "800", color: palette.ink, backgroundColor: palette.surfaceMuted, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
    hospitalStatus4: { fontSize: 10, fontWeight: "800", color: palette.ink, backgroundColor: palette.amberWash, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 },
    status4Button: { flexDirection: "row", alignItems: "center", gap: 4, marginLeft: "auto", paddingHorizontal: spacing.md, minHeight: 36, borderRadius: radii.pill, backgroundColor: palette.primaryWash },
    status4ButtonText: { color: palette.primary, fontSize: 12, fontWeight: "800" },
    districtRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: palette.line,
    },
    districtNum: {
      width: 28,
      height: 28,
      borderRadius: 14,
      textAlign: "center",
      lineHeight: 28,
      backgroundColor: palette.surfaceMuted,
      color: palette.inkMuted,
      fontWeight: "800",
      fontSize: 12,
    },
    districtBaseChips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: spacing.sm },
    comunicacionesSection: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
    comunicacionesSectionTitle: { color: palette.inkMuted, fontSize: 13, fontWeight: "600", letterSpacing: -0.08, marginBottom: spacing.sm },
    comunicacionesCard: { backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line, borderRadius: radii.md, padding: spacing.md, marginBottom: spacing.sm },
    comunicacionesCardTitle: { color: palette.ink, fontSize: 13, fontWeight: "800", marginBottom: 4 },
    comunicacionesCardLine: { color: palette.inkMuted, fontSize: 12, lineHeight: 17 },
    comunicacionesTableRow: { flexDirection: "row", gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: palette.line },
    comunicacionesTableCell: { flex: 1, color: palette.ink, fontSize: 12 },
    backToTop: {
      // Left, well above the bottom bar: the glass tab bar's floating search
      // capsule sits bottom-right (see nav-shell.tsx), and a first version of
      // this button placed bottom-right there landed exactly on top of it —
      // confirmed by manual testing where "Volver arriba" opened Search instead.
      position: "absolute",
      left: spacing.lg,
      bottom: TAB_BAR_INSET + spacing.sm,
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: palette.ink,
      alignItems: "center",
      justifyContent: "center",
    },
    emptyState: { alignItems: "center", padding: spacing.xl, gap: spacing.sm },
    emptyTitle: { color: palette.ink, fontWeight: "800", fontSize: 15 },
    emptyDetail: { color: palette.inkMuted, textAlign: "center", fontSize: 12, lineHeight: 17 },
  });
}

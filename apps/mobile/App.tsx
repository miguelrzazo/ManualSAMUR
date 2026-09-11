import { MaterialCommunityIcons } from "@expo/vector-icons";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator, type BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator, type NativeStackNavigationProp, type NativeStackScreenProps } from "@react-navigation/native-stack";
import Constants from "expo-constants";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { StatusBar } from "expo-status-bar";
import React, { forwardRef, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  FlatList,
  findNodeHandle,
  Linking,
  Modal,
  Platform,
  Pressable as NativePressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
  useWindowDimensions,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type PressableProps,
  type TextStyle,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { circle, motion, radii, spacing, TAB_BAR_INSET, typography, type AdaptivePalette } from "@manual-samur/design-tokens";
import { ContentProvider, findProcedure, useContentData, useContentPreferences } from "./src/content";
import { PreferencesProvider, usePreferences } from "./src/preferences";
import { ThemeProvider, useTheme, useThemedStyles } from "./src/theme";
import { animateNextLayout, useReduceMotion } from "./src/hooks/motion";
import { useScrollChrome } from "./src/hooks/use-scroll-chrome";
import { BackToTop, Badge, Chip, CompactHeader, FavoriteToggle, MarkdownTable, Menu, PageHeader, Press, ReaderNavBar, SearchField, Toast, type MenuAnchor } from "./src/components";
import type { MobileAttachment, MobileProcedure } from "../../packages/manual-content/src/index.ts";
import { displayTitle } from "./src/title-case";
import { APP_CHANGELOG } from "./src/app-changelog";
import { DRUG_DETAIL_FIELDS, DRUG_NOTE_FIELDS, DRUG_SAFETY_FIELDS, drugFieldText, parseDrugRoutes, parseMedicationDose, type MedicationDoseSection } from "./src/drug-detail-logic";
import { procedureRouteKey, readableMarkdownCell, readableMarkdownLine, readingPositions, searchProcedures } from "./src/procedure-logic";
import { buildProcedureShareHtml, buildProcedureShareUrl } from "./src/procedure-share.ts";
import { activeSectionKey } from "./src/vademecum-logic";
import { highlightSegments, snippetText, type SearchSnippet } from "./src/search-snippet-logic";
import { findProcedureMatches, formatMatchCounter, isFindableQuery, stepMatchIndex } from "./src/procedure-find-logic";
import { activeHeadingIdAtOffset, parseProcedureDocument, type MeasuredHeadingOffset, type ParsedProcedureDocument, type ParsedProcedureSection } from "./src/procedure-document.ts";
import { COLLAPSE_TRIGGER, READER_BACK_TO_TOP_PLACEMENT } from "./src/scroll-chrome-logic";
import { relatedProcedureIdsForDrug, resolveCodeReference, resolveVademecumReference, searchAbbreviations, searchCodes, searchVademecum, SEARCH_SCOPES, type MobileReferenceSearchResult, type SearchScope } from "./src/reference-search-logic";
import { isLocallyAvailable, type AttachmentRecord } from "./src/attachment-logic";
import { reconcileAttachmentRecord } from "./src/attachment-runtime";
import {
  locationRecords,
  locationDisplayName,
  locationRouteKey,
  locationSourcePolicy,
  locationStaleNotice,
  locationSubtitle,
  locationVisual,
  platformMapsUrl,
  resolveLocationRoute,
  type LocationRecord,
} from "./src/location-logic";
import { APPROVED_ONLINE_MAP_POLICY, mapPinsFromLocations } from "./src/online-map-logic";
import { mapCameraTargetFor } from "./src/mapa-logic";
import { OnlineMapView } from "./src/online-map-view";
import { canRecordRecent, savedReferenceIcon, selectSavedReferences, type ResolvedSavedReference, type SavedReference } from "./src/saved-logic";
import { accessibilityHints, accessibilityTargetStyle, adaptiveLayout, routeAccessibilityLabels, procedureTextAlign } from "./src/accessibility";
import { Image } from "expo-image";
import aptaBlueTutor from "./assets/apta-blue-tutor.png";
import manualIcon from "./assets/icon.png";
import { GlassTabBar, TAB_ICON_SIZE } from "./src/nav-shell";
import { AnexoScreen } from "./src/screens/AnexoScreen";
import { CodigosScreen } from "./src/screens/CodigosScreen";
import { InicioScreen } from "./src/screens/InicioScreen";
import { VademecumScreen } from "./src/screens/VademecumScreen";
import { MapaScreen } from "./src/screens/MapaScreen";
import { Status4Cheatsheet } from "./src/components/Status4Cheatsheet";
import { ProcedureHistorySection } from "./src/components/ProcedureHistorySection";
import { SettingsModal } from "./src/components/SettingsModal";
import { AcademyPromo } from "./src/components/AcademyPromo";
import { shouldShowAcademySplash } from "./src/academy-slot.ts";
import { academyBrand, academySlot } from "./src/academy-slot-config.ts";
import { asCodigosHospitals, asStatus4Entries, buildHospitalList } from "./src/codigos-logic";
import { HistorialScreen } from "./src/screens/HistorialScreen";
// `Guardados` intentionally stays out of TabsParamList and off the tab bar (see T5a).
// Its favorites/recents content now lives inside Inicio (src/screens/InicioScreen.tsx,
// T5b) rather than a separate, unrouted `SavedScreen`.
// Both param lists live in ./src/navigation-types so screen modules under src/screens/
// (e.g. CodigosScreen, InicioScreen) can type their own navigation/route props against
// the same lists.
import type { TabsParamList, RootStackParamList } from "./src/navigation-types";

const Tabs = createBottomTabNavigator<TabsParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * Origen del sitio web canónico, para construir el enlace y el pie del PDF de
 * "compartir procedimiento". `procedure-share.ts` se mantiene puro (sin
 * `expo-constants`), así que este es el único sitio donde se lee — el mismo
 * valor que ya usa la descarga de anexos en `attachment-runtime.ts`.
 */
const CONTENT_ORIGIN = (() => {
  const extra = Constants.expoConfig?.extra as Record<string, unknown> | undefined;
  return typeof extra?.contentOrigin === "string" ? extra.contentOrigin : "https://manual-proced-spc.vercel.app";
})();

/**
 * App.tsx's stylesheet, per theme. This replaces a module-level `let styles`
 * reassigned during `AppGate`'s render: components read it as a plain global and
 * had no way to re-render when it changed, which is why the navigator had to be
 * remounted on every appearance change.
 */
function useAppStyles() {
  return useThemedStyles(createStyles);
}



/** Keep every action reachable at the platform minimum, including icon-only controls. */
const Pressable = forwardRef<View, PressableProps>(function AccessiblePressable({ style, ...props }, ref) {
  const styles = useAppStyles();
  return <NativePressable ref={ref} {...props} style={(state) => [typeof style === "function" ? style(state) : style, styles.minimumTarget]} />;
});

function LogoMark({ small = false }: { small?: boolean }) {
  const styles = useAppStyles();
  return <Image source={manualIcon} style={[styles.logoMark, small && styles.logoMarkSmall]} contentFit="contain" alt="Icono de Manual SAMUR" accessibilityLabel="Icono de Manual SAMUR" />;
}

function restoreAccessibilityFocus(ref: React.RefObject<View | null>) {
  const node = findNodeHandle(ref.current);
  if (node === null) return;
  setTimeout(() => AccessibilityInfo.setAccessibilityFocus(node), 120);
}

/**
 * La cabecera de Inicio.
 *
 * Ya no lleva el icono de la app. Un logo en la cabecera de la propia app dice algo
 * que el usuario acaba de ver en la pantalla de inicio del teléfono y en la pantalla
 * de carga, y lo dice ocupando el sitio del título: con el lockup dentro, el nombre
 * quedaba en dos líneas de `title3` para que cupiera al lado. Sin él, es el mismo
 * título grande que llevan Códigos, Vademécum, Mapa y Buscar (`PageHeader`), y la
 * pestaña deja de ser la única con una cabecera propia.
 *
 * `LogoMark` sigue existiendo: lo muestran la pantalla de carga y el aviso de primer
 * uso, que son los dos sitios donde la app todavía no se ha presentado.
 */
function BrandHeader({ onSettings, settingsRef }: { onSettings?: () => void; settingsRef?: React.RefObject<View | null> }) {
  const palette = useTheme();
  const styles = useAppStyles();
  return (
    <PageHeader
      title="Manual"
      trailing={onSettings ? (
        <Pressable ref={settingsRef} testID="settings-button" onPress={onSettings} style={styles.iconButton} accessibilityRole="button" accessibilityLabel={routeAccessibilityLabels.Ajustes} accessibilityHint="Abre las preferencias, privacidad y estado del contenido.">
          <MaterialCommunityIcons name="tune-variant" size={21} color={palette.ink} />
        </Pressable>
      ) : undefined}
    />
  );
}

/**
 * Installs the platform header on a pushed detail screen.
 *
 * Every one of these screens used to render `[←][CENTERED CAPS LABEL][☆]` by hand
 * and then repeat that same caps label as a red line under it — "VADEMÉCUM ·
 * FÁRMACO" appeared twice, forty points apart, on the drug screen. The native
 * header owns the back button, the title and the favourite now; the body starts
 * with content.
 */
/**
 * Field labels for reference detail objects.
 *
 * These used to be raw object keys pushed through `key.replace(/([A-Z])/g, " $1")`,
 * so the Vademécum and Códigos detail screens showed things like "active
 * Ingredient" and "presentation Notes" — English identifiers, lower-cased, in a
 * Spanish UI. Anything unmapped still falls back to the split-and-capitalise
 * behaviour rather than rendering a bare key.
 */
const FIELD_LABELS: Record<string, string> = {
  activeIngredient: "Principio activo",
  brandNames: "Nombres comerciales",
  presentation: "Presentación",
  presentationNotes: "Notas de presentación",
  dose: "Dosis",
  doseNotes: "Notas de dosis",
  route: "Vía",
  routes: "Vías",
  indication: "Indicación",
  indications: "Indicaciones",
  contraindications: "Contraindicaciones",
  category: "Categoría",
  subcategory: "Subcategoría",
  description: "Descripción",
  notes: "Notas",
  concentration: "Concentración",
  dilution: "Dilución",
  // Perfusiones. Las claves ya están en español, pero el fallback de `fieldLabel`
  // solo capitaliza —daría "Dilucion", sin tilde—, así que se mapean igual.
  dilucion: "Dilución",
  dilucionAlt: "Dilución alternativa",
  preparacion: "Preparación",
  rate: "Ritmo de perfusión",
  osmolarity: "Osmolaridad",
  composition: "Composición",
  group: "Grupo",
  channel: "Canal",
  meaning: "Significado",
};

function fieldLabel(key: string): string {
  const mapped = FIELD_LABELS[key];
  if (mapped) return mapped;
  const spaced = key.replace(/([A-Z])/g, " $1").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function useDetailHeader({ navigation, title, favorite, onToggleFavorite, largeTitle = true, headerTitle, trailing }: {
  navigation: { setOptions: (options: Record<string, unknown>) => void };
  title: string;
  favorite?: boolean;
  onToggleFavorite?: () => void;
  /** Off for a screen whose body already carries the same name as its own heading. */
  largeTitle?: boolean;
  /**
   * Renders the title instead of letting the platform draw the `title` string.
   * Used by the procedure reader, whose header title fades in only once the
   * body's own heading has scrolled away. The string is still set, because it is
   * what the back button on the *next* screen and VoiceOver both read.
   */
  headerTitle?: () => React.ReactNode;
  /**
   * An extra control beside the favourite star (e.g. the procedure reader's
   * share trigger, which has no favourite star of its own — see the comment
   * above `ProcedureScreen`'s `useDetailHeader` call).
   */
  trailing?: () => React.ReactNode;
}) {
  useLayoutEffect(() => {
    navigation.setOptions({
      // Titles here come from the corpus (a drug name, a location's short name), which
      // mixes shouted and sentence-cased entries — `displayTitle` levels them.
      title: displayTitle(title),
      headerLargeTitle: largeTitle,
      headerTitle,
      headerRight: onToggleFavorite || trailing
        ? () => (
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
              {trailing?.()}
              {onToggleFavorite && <FavoriteToggle favorite={Boolean(favorite)} onToggle={onToggleFavorite} size={24} />}
            </View>
          )
        : undefined,
    });
  }, [navigation, title, favorite, onToggleFavorite, largeTitle, headerTitle, trailing]);
}

function SectionHeading({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  const styles = useAppStyles();
  return (
    <View style={styles.sectionHeading}>
      <View>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {action && <Pressable onPress={onAction} style={styles.minimumTarget} accessibilityRole="button" accessibilityLabel={action} accessibilityHint={accessibilityHints.openDetail}><Text style={styles.sectionAction}>{action}</Text></Pressable>}
    </View>
  );
}

function ProcedureRow({ procedure, onPress, showFavorite = false, snippet }: { procedure: MobileProcedure; onPress: () => void; showFavorite?: boolean; snippet?: SearchSnippet }) {
  const palette = useTheme();
  const styles = useAppStyles();
  const { favorites, toggleFavorite } = useContentPreferences();
  const routeKey = procedureRouteKey(procedure);
  const favorite = favorites.includes(routeKey);
  return (
    <View style={styles.resourceRow}>
      <Pressable testID={`procedure-row-${procedure.id}`} onPress={onPress} style={({ pressed }) => [styles.resourceRowMain, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={`${procedure.id}, ${displayTitle(procedure.title)}${snippet ? `. Coincidencia: ${snippetText(snippet)}` : ""}`} accessibilityHint={accessibilityHints.openDetail}>
        {/* A kind icon, not the id. The id was set in a 42pt tile at weight 900,
            which gave "304_02" the same visual weight as the name and still broke
            across two lines as "304_0 / 2" — an identifier rendered as a word
            hyphenated in the wrong place. It reads perfectly well on the meta line,
            and the tile now answers the question a mixed result list actually
            raises: is this a procedure, a drug or a code? */}
        <View style={styles.resourceCode}><MaterialCommunityIcons name="clipboard-text-outline" size={17} color={palette.primary} /></View>
        <View style={styles.resourceCopy}>
          <Text style={styles.resourceTitle}>{displayTitle(procedure.title)}</Text>
          <Text style={styles.resourceMeta}>{procedure.id} · {procedure.attachments.length ? `${procedure.section} · ${procedure.attachments.length} anexos` : procedure.section}</Text>
          {/* Why this result is here, when the title does not say so. */}
          {snippet && (
            <Text style={styles.resourceSnippet} numberOfLines={2}>
              {snippet.segments.map((segment, index) => (
                <Text key={index} style={segment.match ? styles.resourceSnippetMatch : undefined}>{segment.text}</Text>
              ))}
            </Text>
          )}
        </View>
      </Pressable>
      {showFavorite && <FavoriteToggle favorite={favorite} onToggle={() => toggleFavorite(routeKey)} title={displayTitle(procedure.title)} />}
      <MaterialCommunityIcons name="chevron-right" size={20} color={palette.inkMuted} accessibilityElementsHidden />
    </View>
  );
}

// Inicio's actual content (the manual tree, favoritos, recientes and the
// update history) lives in its own module — see src/screens/InicioScreen.tsx
// for why. This wrapper only keeps the brand header and the settings modal,
// both of which depend on App.tsx's own logo and stylesheet and would have been
// awkward to duplicate or thread through as props.
//
// The old hero ("La referencia que te acompaña", a repeated app icon right
// below the header's own icon) and the doubled "ACCESOS RÁPIDOS · Consulta
// por recurso" heading over three shortcut cards are gone: they spent the
// most valuable screen space in the app on marketing copy and on shortcuts
// the tab bar already provides, for a reference meant to be consulted
// full-screen during a shift.
function HomeScreen({ navigation }: BottomTabScreenProps<TabsParamList, "Inicio">) {
  const styles = useAppStyles();
  const reduceMotion = useReduceMotion();
  const settingsTriggerRef = useRef<View>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <BrandHeader settingsRef={settingsTriggerRef} onSettings={() => setSettingsOpen(true)} />
      <InicioScreen navigation={navigation} />
      <SettingsModal visible={settingsOpen} onClose={() => { setSettingsOpen(false); restoreAccessibilityFocus(settingsTriggerRef); }} onOpenAbbreviations={() => { setSettingsOpen(false); navigation.getParent()?.navigate("Abbreviations"); }} onOpenChangelog={() => { setSettingsOpen(false); navigation.getParent()?.navigate("Changelog"); }} contentOrigin={CONTENT_ORIGIN} reduceMotion={reduceMotion} appVersion={Constants.expoConfig?.version ?? "1.0.0"} />
    </SafeAreaView>
  );
}


/**
 * Buscar. A destination, not a modal.
 *
 * It used to be a `formSheet` opened from a detached capsule beside the tab pill, which
 * meant it had no place in the tab bar, no back stack of its own, and nothing at all to
 * show until the user typed — it opened onto a keyboard and an empty list.
 *
 * Now it is the fifth tab, and before a query is entered it shows what it actually knows:
 * the scope chips (so the user can see what is searchable at a glance) and the last
 * queries and references they opened.
 */
function BuscarScreen({ navigation }: BottomTabScreenProps<TabsParamList, "Buscar">) {
  const styles = useAppStyles();
  const { content } = useContentData();
  const { recents, recentQueries, rememberQuery, forgetQuery } = useContentPreferences();
  const stack = navigation.getParent<NativeStackNavigationProp<RootStackParamList>>();
  const recentReferences = useMemo(() => selectSavedReferences(content, recents).slice(0, 6), [content, recents]);
  const openProcedure = (id: string) => stack?.navigate("Procedure", { id });
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<SearchScope>("Todo");
  const chrome = useScrollChrome();
  const procedureResults = useMemo(() => searchProcedures(content.procedures, query), [content.procedures, query]);
  const vademecumResults = useMemo(() => searchVademecum(content, query), [content, query]);
  const codeResults = useMemo(() => searchCodes(content.codes, query), [content.codes, query]);
  const visibleProcedures = filter === "Vademécum" || filter === "Códigos" ? [] : procedureResults;
  const visibleVademecum = filter === "Todo" || filter === "Vademécum" ? vademecumResults : [];
  const visibleCodes = filter === "Todo" || filter === "Códigos" ? codeResults : [];
  const rows = [
    ...visibleProcedures.map((result) => ({ kind: "procedure" as const, item: result.procedure, snippet: result.snippet })),
    ...visibleVademecum.map((item) => ({ kind: "reference" as const, item, snippet: undefined })),
    ...visibleCodes.map((item) => ({ kind: "reference" as const, item, snippet: undefined })),
  ];
  const resultsRef = useRef<FlatList<(typeof rows)[number]>>(null);

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      {/* Title, field and scope chips give way to the results on a downward
          scroll, collapsing into the compact bar — see `useScrollChrome`. */}
      {chrome.collapsed && <CompactHeader title="Buscar" onExpand={chrome.expand} />}
      {!chrome.collapsed && (
      <>
      <PageHeader title="Buscar" />
      {/* No `autoFocus`: a tab that raises the keyboard every time it is selected cannot
          be used to glance at recent searches, which is most of what this screen is for. */}
      <View style={styles.searchPadding}><SearchField testID="manual-search-input" value={query} onChangeText={setQuery} onSubmitEditing={() => rememberQuery(query)} placeholder="Buscar procedimientos, fármacos o códigos" /></View>
      {/* The scope chips wrapped onto three lines on a phone. A horizontal
          scroller keeps them on one row and keeps the results above the fold. */}
      <FlatList
        horizontal
        data={SEARCH_SCOPES}
        keyExtractor={(item) => item}
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroller}
        contentContainerStyle={styles.filterScrollerContent}
        accessibilityRole="tablist"
        renderItem={({ item }) => <Chip label={item} selected={filter === item} onPress={() => setFilter(item)} role="tab" />}
      />
      {/* No second chip row here. Choosing "Vademécum" above used to open
          "Todos · Fármacos · Comerciales · Perfusiones · Fluidos" underneath it —
          the same taxonomy the Vademécum tab already puts on screen as its domain
          switcher, stacked as a second row of pills on the one screen whose job is
          to search across all of them. Narrowing to a single domain is what that
          tab is for; global search stays global. */}
      </>
      )}
      {query.trim() ? (
        <FlatList
          ref={resultsRef}
          data={rows}
          keyExtractor={(item, index) => `${item.kind}-${item.item.id}-${index}`}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          onScroll={chrome.onScroll}
          scrollEventThrottle={chrome.scrollEventThrottle}
          onScrollBeginDrag={() => rememberQuery(query)}
          ListEmptyComponent={<EmptyState title="Sin coincidencias" detail="Prueba con un código, un nombre, un sinónimo o una palabra del contenido." />}
          renderItem={({ item }) => item.kind === "procedure" ? <ProcedureRow procedure={item.item} showFavorite snippet={item.snippet} onPress={() => { rememberQuery(query); openProcedure(item.item.id); }} /> : <ReferenceRow reference={item.item} onCode={(routeKey) => { rememberQuery(query); stack?.navigate("Code", { routeKey }); }} onVademecum={(routeKey) => { rememberQuery(query); stack?.navigate("Vademecum", { routeKey }); }} onDrug={(id) => { rememberQuery(query); stack?.navigate("Drug", { id }); }} />}
        />
      ) : (
        <SearchStartingPoints
          recentQueries={recentQueries}
          onPickQuery={setQuery}
          onForgetQuery={forgetQuery}
          recents={recentReferences}
          onOpen={(item) => openSavedReference(stack, item)}
        />
      )}
      <BackToTop
        visible={chrome.showBackToTop}
        onPress={() => {
          resultsRef.current?.scrollToOffset({ offset: 0, animated: true });
          chrome.reset();
        }}
      />
    </SafeAreaView>
  );
}

/**
 * What Buscar shows before a query. Two lists, both of them things the user themselves
 * put there — no suggestions, no promoted content, no explanation of the app.
 */
function SearchStartingPoints({ recentQueries, onPickQuery, onForgetQuery, recents, onOpen }: {
  recentQueries: string[];
  onPickQuery: (query: string) => void;
  onForgetQuery: (query: string) => void;
  recents: ResolvedSavedReference[];
  onOpen: (item: SavedReference) => void;
}) {
  const palette = useTheme();
  const styles = useAppStyles();
  if (recentQueries.length === 0 && recents.length === 0) {
    return <EmptyState title="Busca en todo el manual" detail="Procedimientos, fármacos, nombres comerciales, perfusiones, fluidos y códigos." />;
  }
  return (
    <ScrollView contentContainerStyle={styles.listContent} keyboardShouldPersistTaps="handled">
      {recentQueries.length > 0 && <>
        <SectionHeading title="Búsquedas recientes" />
        <View style={styles.cardList}>
          {recentQueries.map((item) => (
            <View key={item} style={styles.resourceRow}>
              <Press onPress={() => onPickQuery(item)} style={styles.resourceRowMain} accessibilityRole="button" accessibilityLabel={`Repetir la búsqueda ${item}`} accessibilityHint={accessibilityHints.search}>
                <MaterialCommunityIcons name="history" size={19} color={palette.inkMuted} />
                <Text style={styles.resourceTitle} numberOfLines={1}>{item}</Text>
              </Press>
              <Press onPress={() => onForgetQuery(item)} accessibilityRole="button" accessibilityLabel={`Quitar ${item} de las búsquedas recientes`}>
                <MaterialCommunityIcons name="close" size={18} color={palette.inkMuted} />
              </Press>
            </View>
          ))}
        </View>
      </>}
      {recents.length > 0 && <>
        <SectionHeading title="Consultado recientemente" />
        <View style={styles.cardList}>
          {recents.map((item) => item.kind === "stale" ? null : (
            <View key={item.routeKey} style={styles.resourceRow}>
              <Press onPress={() => onOpen(item)} style={styles.resourceRowMain} accessibilityRole="button" accessibilityLabel={`${displayTitle(item.title)}. ${item.subtitle}`} accessibilityHint={accessibilityHints.openDetail}>
                <MaterialCommunityIcons name={savedReferenceIcon(item.kind)} size={19} color={palette.ink} />
                <View style={styles.resourceCopy}>
                  <Text style={styles.resourceTitle} numberOfLines={1}>{displayTitle(item.title)}</Text>
                  <Text style={styles.resourceMeta} numberOfLines={1}>{item.subtitle}</Text>
                </View>
              </Press>
            </View>
          ))}
        </View>
      </>}
    </ScrollView>
  );
}

/** Mirrors `openSavedReference` in InicioScreen: one route per saved kind. */
function openSavedReference(stack: NativeStackNavigationProp<RootStackParamList> | undefined, item: SavedReference) {
  if (item.kind === "procedure") stack?.navigate("Procedure", { id: item.id });
  else if (item.kind === "drug") stack?.navigate("Drug", { id: item.id });
  else if (item.kind === "code") stack?.navigate("Code", { routeKey: item.routeKey });
  else if (item.kind === "hospital" || item.kind === "base") stack?.navigate("Location", { routeKey: item.routeKey });
  else stack?.navigate("Vademecum", { routeKey: item.routeKey });
}

function ReferenceRow({ reference, onCode, onVademecum, onDrug }: { reference: MobileReferenceSearchResult; onCode: (routeKey: string) => void; onVademecum: (routeKey: string) => void; onDrug: (id: string) => void }) {
  const palette = useTheme();
  const styles = useAppStyles();
  const { favorites, toggleFavorite } = useContentPreferences();
  const icon = reference.kind === "code" ? "radio-handheld" : reference.kind === "abbreviation" ? "format-letter-case" : "pill";
  const targetId = reference.targetId;
  const onPress = reference.kind === "code" ? () => onCode(reference.routeKey) : reference.kind === "drug" && targetId ? () => onDrug(targetId) : () => onVademecum(reference.routeKey);
  const favorite = favorites.includes(reference.routeKey);
  const supportsFavorites = reference.kind !== "abbreviation";
  return <View style={styles.resourceRow}>
    <Pressable onPress={onPress} style={({ pressed }) => [styles.resourceRowMain, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={`${reference.title}. ${reference.subtitle}`} accessibilityHint={accessibilityHints.openDetail}>
    <View style={[styles.resourceCode, reference.kind === "code" ? styles.codeResultCode : reference.kind === "abbreviation" ? styles.abbreviationResultCode : styles.drugCode]}><MaterialCommunityIcons name={icon} size={17} color={palette.ink} /></View>
    {/* A code's number is half of its name — "11" and "Accidente de tráfico" are
        the two things you look one up by — so it belongs on the title line rather
        than greyed out at 11pt in the meta. Every other kind keeps its badge in
        the meta, where "PERF" or "MARCA" is a classification, not an identifier. */}
    <View style={styles.resourceCopy}>
      <Text style={styles.resourceTitle}>
        {reference.kind === "code" && reference.badge ? <Text style={styles.resourceInlineCode}>{reference.badge}  </Text> : null}
        {reference.title}
      </Text>
      <Text style={styles.resourceMeta}>{reference.kind !== "code" && reference.badge ? `${reference.badge} · ` : ""}{reference.subtitle}</Text>
    </View>
    </Pressable>
    {supportsFavorites && <FavoriteToggle favorite={favorite} onToggle={() => toggleFavorite(reference.routeKey)} title={reference.title} />}
    <MaterialCommunityIcons name="chevron-right" size={20} color={palette.inkMuted} accessibilityElementsHidden />
  </View>;
}

// Favorites/recents rendering (SavedRow, openSavedReference) and the standalone
// Guardados screen moved into src/screens/InicioScreen.tsx — Inicio absorbs them
// now that Guardados is no longer a destination (see T5a/T5b).

function LocationDetailScreen({ route, navigation }: NativeStackScreenProps<RootStackParamList, "Location">) {
  const palette = useTheme();
  const styles = useAppStyles();
  const { content } = useContentData();
  const { favorites, toggleFavorite, remember } = useContentPreferences();
  const policy = locationSourcePolicy;
  const locations = useMemo(() => locationRecords(content, policy), [content, policy]);
  const location = resolveLocationRoute(locations, route.params.routeKey);
  const favorite = favorites.includes(route.params.routeKey);
  useEffect(() => {
    if (location && canRecordRecent(content, route.params.routeKey)) remember(route.params.routeKey);
  }, [content, location, remember, route.params.routeKey]);
  const onToggleFavorite = useCallback(() => toggleFavorite(route.params.routeKey), [toggleFavorite, route.params.routeKey]);
  // `locationDisplayName`/`locationSubtitle`, no `shortName`. Una base se llama "Base 1"
  // y su barrio ("El Espinillo") es el subtítulo: es como la nombra la radio y como ya la
  // dibuja el directorio (`LocationDirectory`). Esta pantalla las llamaba por el barrio,
  // así que la misma base tenía dos nombres distintos a un toque de distancia.
  useDetailHeader({ navigation, title: location ? locationDisplayName(location) : "Ubicación", favorite, onToggleFavorite });
  if (!location) return <MissingResource title="Punto no disponible" detail="La ruta de ubicación no coincide con el paquete local actual. Vuelve al directorio para consultar otro punto." onRecover={() => navigation.goBack()} />;
  const visual = locationVisual(location, palette);
  const openMaps = () => { void Linking.openURL(platformMapsUrl(location, Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : "web")); };
  // Order matters here. The address is what a responder reads out, types into a
  // navigator or gives over the radio; the coordinates are a fallback nobody dictates
  // to five decimal places. They used to be the only block on the screen with a label
  // and a heading, above nothing, while the address was a grey meta line.
  return <SafeAreaView style={styles.screen} edges={[]}><ScrollView contentContainerStyle={styles.detailContent} contentInsetAdjustmentBehavior="automatic">
    <LocationMapPreview location={location} label={visual.label + " " + locationDisplayName(location)} />
    <View style={[styles.locationTypeBadge, { backgroundColor: visual.wash }]} accessibilityLabel={visual.label}>
      <MaterialCommunityIcons name={visual.icon} size={18} color={visual.color} />
      <Text style={[styles.locationTypeBadgeText, { color: visual.color }]}>{visual.label}</Text>
    </View>
    <Text style={styles.detailMeta}>{locationSubtitle(location)}</Text>
    {locationStaleNotice(location, new Date(), policy) && <View style={styles.locationFallback} accessibilityLiveRegion="polite"><MaterialCommunityIcons name="alert-outline" size={19} color={palette.amber} /><Text style={styles.locationFallbackText}>{locationStaleNotice(location, new Date(), policy)}</Text></View>}
    <View style={styles.infoBlock}><Text style={styles.infoLabel}>Dirección</Text><Text style={styles.addressValue}>{location.address}</Text><Text style={styles.infoValue}>{location.district}</Text></View>
    <Pressable onPress={openMaps} style={styles.primaryButton} accessibilityRole="link" accessibilityLabel={"Abrir " + location.name + " en Mapas"}><Text style={styles.primaryButtonText}>Abrir en Mapas</Text></Pressable>
    <Text style={styles.coordinates} accessibilityLabel={`Coordenadas ${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`}>Coordenadas {location.lat.toFixed(5)}, {location.lng.toFixed(5)}</Text>
  </ScrollView></SafeAreaView>;
}

/**
 * A boxed, non-interactive map of one point, shown above its address.
 *
 * Deliberately not a second live map surface with its own controls: it answers "where is
 * this, roughly" at a glance and hands the actual navigation to the system Maps app just
 * below it. Falls back to nothing at all when the basemap is not approved — a placeholder
 * rectangle pretending to be a map is what this screen already removed once.
 */
function LocationMapPreview({ location, label }: { location: LocationRecord; label: string }) {
  const palette = useTheme();
  const styles = useAppStyles();
  const scheme = useColorScheme();
  const [failed, setFailed] = useState(false);
  if (!APPROVED_ONLINE_MAP_POLICY.approved || failed) return null;
  return (
    <View style={styles.locationMapPreview} accessible accessibilityRole="image" accessibilityLabel={label}>
      <OnlineMapView
        dark={scheme === "dark"}
        pins={mapPinsFromLocations([location], "offline")}
        center={mapCameraTargetFor(location)}
        zoom={14}
        onPinPress={() => undefined}
        onLoadError={() => setFailed(true)}
        palette={palette}
      />
    </View>
  );
}

/**
 * An image anexo, drawn where it belongs: in the body of the procedure it illustrates.
 *
 * The package carries 168 of these — algorithms, dosage tables, airway diagrams — and
 * every one of them used to be a row saying "descargar" under a heading called "Anexos",
 * indistinguishable from a 2 MB PDF. A figure that has to be requested is a figure nobody
 * looks at during a shift.
 *
 * The intrinsic size is unknown until the file is measured, so the frame starts at 4:3 and
 * corrects itself once the image reports its dimensions — the alternative is a page that
 * jumps as each figure lands.
 */
function ProcedureFigure({ attachment, record, onOpen, alt }: { attachment: MobileProcedure["attachments"][number]; record?: AttachmentRecord; onOpen: () => void; alt?: string }) {
  const palette = useTheme();
  const styles = useAppStyles();
  const [ratio, setRatio] = useState(4 / 3);
  const [failed, setFailed] = useState(false);
  const uri = isLocallyAvailable(record, attachment) ? record?.localUri : undefined;
  // 167 of the 168 figures are bundled and render immediately. The odd one out — and any
  // figure whose bytes fail to verify — must still be reachable: returning null here
  // would delete it from the procedure with no way to ask for it, which is worse than the
  // download row this replaced.
  if (!uri || failed) {
    return (
      <Press onPress={onOpen} style={styles.figurePlaceholder} accessibilityRole="button" accessibilityLabel={`Ver figura ${attachment.filename}`} accessibilityHint="Se descarga y se abre dentro de la app.">
        <MaterialCommunityIcons name="image-outline" size={22} color={palette.inkMuted} />
        <View style={styles.resourceCopy}>
          <Text style={styles.resourceTitle} numberOfLines={2}>{attachment.filename}</Text>
          <Text style={styles.resourceMeta}>{failed ? "No se pudo mostrar aquí · toca para abrirla" : "Toca para verla"}</Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={18} color={palette.inkMuted} />
      </Press>
    );
  }
  return (
    <Press onPress={onOpen} noScale accessibilityRole="button" accessibilityLabel={`Ampliar figura ${attachment.filename}`} accessibilityHint={accessibilityHints.openDetail}>
      <Image
        source={{ uri }}
        style={[styles.figure, { aspectRatio: ratio }]}
        contentFit="contain"
        onLoad={(event) => { const { width, height } = event.source; if (width > 0 && height > 0) setRatio(width / height); }}
        onError={() => setFailed(true)}
        alt={alt || attachment.filename}
        accessibilityLabel={alt || attachment.filename}
      />
      <Text style={styles.figureCaption} numberOfLines={2}>{alt || attachment.filename}</Text>
      <View style={styles.figureZoom} pointerEvents="none">
        <MaterialCommunityIcons name="magnify-plus-outline" size={16} color={palette.paper} />
      </View>
    </Press>
  );
}

/**
 * El botón de compartir de la cabecera del lector.
 *
 * Va junto al favorito de las demás fichas (`useDetailHeader`'s `trailing`),
 * aunque el procedimiento no tenga un favorito ahí: ese control vive dentro
 * del cuerpo por la razón que explica el comentario sobre `handoff` más abajo
 * — compite con el título grande — y este no tiene ese problema porque no
 * lleva texto propio, solo el icono.
 */
/**
 * Un botón de la barra del lector: buscar, compartir.
 *
 * Mide su propio marco al pulsarse y lo entrega al que abre el menú. La alternativa
 * —una ref levantada hasta `ProcedureScreen`— no funciona: `headerRight` lo dibuja
 * `useDetailHeader` dentro de la barra nativa, así que la única forma fiable de saber
 * dónde ha quedado el icono es preguntárselo a él.
 */
function ReaderHeaderButton({ icon, label, hint, onPress, busy = false, active = false }: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
  label: string;
  hint?: string;
  onPress: (anchor: MenuAnchor) => void;
  busy?: boolean;
  active?: boolean;
}) {
  const palette = useTheme();
  const ref = useRef<View>(null);
  return (
    <Press
      ref={ref}
      onPress={() => {
        // `measureInWindow` es asíncrono; si falla (la vista ya no está montada) el
        // menú se abre igual, anclado a la esquina, en vez de no abrirse.
        const fallback: MenuAnchor = { x: 0, y: 0, width: 0, height: 0 };
        if (!ref.current) { onPress(fallback); return; }
        ref.current.measureInWindow((x, y, width, height) => onPress({ x, y, width, height }));
      }}
      disabled={busy}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ busy, disabled: busy, expanded: active }}
      style={styles_readerHeaderButton.button}
    >
      <MaterialCommunityIcons name={icon} size={22} color={busy ? palette.inkMuted : active ? palette.primary : palette.ink} />
    </Press>
  );
}

const styles_readerHeaderButton = {
  // Mismo patrón que `FavoriteToggle`: sin fondo propio, centrado sobre su
  // icono, el hit target lo da `Press` (44pt mínimo) y no un círculo dibujado.
  button: { alignItems: "center", justifyContent: "center" },
} as const;

/**
 * Compartir un procedimiento: el enlace web, o un PDF generado con
 * `expo-print`. Vive en su propio hook para que `ProcedureScreen` —ya larga—
 * no absorba también la máquina de estados de la generación del PDF.
 */
function useProcedureShare(procedure: MobileProcedure | undefined) {
  /** El marco del botón que abrió el menú; `undefined` mientras está cerrado. */
  const [anchor, setAnchor] = useState<MenuAnchor | undefined>(undefined);
  // `undefined` mientras se comprueba; una vez resuelto no vuelve a cambiar
  // durante la vida de la pantalla, así que una sola comprobación al montar
  // basta — no hace falta repetirla cada vez que se abre el menú.
  const [pdfAvailable, setPdfAvailable] = useState<boolean | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const available = await Sharing.isAvailableAsync();
        if (!cancelled) setPdfAvailable(available);
      } catch {
        if (!cancelled) setPdfAvailable(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const shareLink = useCallback(async () => {
    if (!procedure) return;
    setBusy(true);
    setError(undefined);
    try {
      const url = buildProcedureShareUrl(CONTENT_ORIGIN, procedure);
      await Share.share(Platform.OS === "ios" ? { url, message: displayTitle(procedure.title) } : { message: url, title: displayTitle(procedure.title) });
      setAnchor(undefined);
    } catch {
      setError("No se ha podido abrir el panel para compartir el enlace.");
    } finally {
      setBusy(false);
    }
  }, [procedure]);

  const sharePdf = useCallback(async () => {
    if (!procedure) return;
    setBusy(true);
    setError(undefined);
    try {
      const html = buildProcedureShareHtml(procedure, CONTENT_ORIGIN);
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      await Sharing.shareAsync(uri, { UTI: "com.adobe.pdf", mimeType: "application/pdf", dialogTitle: displayTitle(procedure.title) });
      setAnchor(undefined);
    } catch {
      setError("No se ha podido generar el PDF de este procedimiento.");
    } finally {
      setBusy(false);
    }
  }, [procedure]);

  return { anchor, setAnchor, pdfAvailable, busy, error, setError, shareLink, sharePdf };
}

/**
 * La barra de "buscar en este procedimiento".
 *
 * Aparece bajo la cabecera al pulsar la lupa, no como pantalla ni como hoja: la
 * pregunta ("¿dónde dice esto?") sólo tiene sentido con el texto delante, y una
 * hoja lo taparía. Los dos chevrones recorren las coincidencias dando la vuelta
 * por los extremos, como cualquier buscador de documento.
 */
function ProcedureFindBar({ query, onChangeQuery, total, index, onStep, onClose }: {
  query: string;
  onChangeQuery: (value: string) => void;
  total: number;
  index: number;
  onStep: (direction: 1 | -1) => void;
  onClose: () => void;
}) {
  const palette = useTheme();
  const styles = useAppStyles();
  const hasMatches = total > 0;
  const searching = isFindableQuery(query);
  return (
    <View style={styles.findBar} accessibilityLabel="Buscar en este procedimiento">
      <View style={styles.findField}>
        <MaterialCommunityIcons name="magnify" size={19} color={palette.inkMuted} />
        <TextInput
          value={query}
          onChangeText={onChangeQuery}
          placeholder="Buscar en este procedimiento"
          placeholderTextColor={palette.inkMuted}
          style={styles.findInput}
          autoFocus
          autoCorrect={false}
          returnKeyType="search"
          onSubmitEditing={() => onStep(1)}
          clearButtonMode="while-editing"
          accessibilityLabel="Texto a buscar en este procedimiento"
        />
        {searching && (
          <Text style={styles.findCounter} accessibilityLiveRegion="polite" accessibilityLabel={hasMatches ? `${formatMatchCounter(index, total)} coincidencias` : "Sin coincidencias"}>
            {formatMatchCounter(index, total)}
          </Text>
        )}
      </View>
      <Press onPress={() => onStep(-1)} disabled={!hasMatches} style={[styles.findStep, !hasMatches && styles.findStepDisabled]} accessibilityRole="button" accessibilityLabel="Coincidencia anterior" accessibilityState={{ disabled: !hasMatches }}>
        <MaterialCommunityIcons name="chevron-up" size={22} color={palette.ink} />
      </Press>
      <Press onPress={() => onStep(1)} disabled={!hasMatches} style={[styles.findStep, !hasMatches && styles.findStepDisabled]} accessibilityRole="button" accessibilityLabel="Coincidencia siguiente" accessibilityState={{ disabled: !hasMatches }}>
        <MaterialCommunityIcons name="chevron-down" size={22} color={palette.ink} />
      </Press>
      <Press onPress={onClose} style={styles.findStep} accessibilityRole="button" accessibilityLabel="Cerrar la búsqueda en el procedimiento" accessibilityHint={accessibilityHints.dismiss}>
        <Text style={styles.findClose}>Listo</Text>
      </Press>
    </View>
  );
}

function ProcedureScreen({ route, navigation }: NativeStackScreenProps<RootStackParamList, "Procedure">) {
  const palette = useTheme();
  const styles = useAppStyles();
  const { content } = useContentData();
  const { favorites, toggleFavorite, remember } = useContentPreferences();
  const reduceMotion = useReduceMotion();
  const [attachmentError, setAttachmentError] = useState<string>();
  const [attachmentRecovery, setAttachmentRecovery] = useState<MobileProcedure["attachments"][number]>();
  const [attachmentRecords, setAttachmentRecords] = useState<Record<string, AttachmentRecord>>({});
  const procedure = useMemo(() => findProcedure(content, route.params.id), [content, route.params.id]);
  const scrollRef = useRef<ScrollView>(null);
  const chrome = useScrollChrome();
  /**
   * The reader's scroll position, on the native driver, so the title handoff
   * below runs on the UI thread and cannot stutter behind a busy JS frame.
   */
  const [scrollY] = useState(() => new Animated.Value(0));
  /** Where the body's own heading ends, in content coordinates. */
  const [titleBottom, setTitleBottom] = useState(0);
  /**
   * `contentInsetAdjustmentBehavior="automatic"` means `contentOffset.y` starts
   * *negative* by the height of the navigation bar, so the handoff thresholds
   * have to be expressed in the same frame of reference. iOS reports the inset
   * on every scroll event; it is read once rather than assumed.
   */
  const [insetTop, setInsetTop] = useState(0);
  const readerDocument = useMemo<ParsedProcedureDocument | undefined>(
    () => procedure ? parseProcedureDocument(procedure, content.procedures) : undefined,
    [content.procedures, procedure],
  );
  const routeKey = readerDocument?.routeKey ?? `procedure:${route.params.id}`;
  const headings = readerDocument?.headings ?? [];
  const sectionOffsets = useRef<Record<string, number>>({});
  const headingOffsets = useRef<MeasuredHeadingOffset[]>([]);
  const markdownOrigin = useRef(0);
  const [tocExpanded, setTocExpanded] = useState(true);
  const [tocPinned, setTocPinned] = useState(false);
  const [activeHeadingKey, setActiveHeadingKey] = useState<string | null>(null);
  const [pendingHeadingKey, setPendingHeadingKey] = useState<string | null>(null);
  const [tocFrame, setTocFrame] = useState({ y: 0, height: 0 });
  const share = useProcedureShare(procedure);

  /**
   * La cápsula de navegación empieza minimizada y vuelve a minimizarse en cuanto el
   * lector sigue bajando: expandida es una barra entera sobre el texto, y el texto es
   * a lo que se ha venido. Quién decide eso es `onProcedureScroll`, con el mismo
   * `COLLAPSE_TRIGGER` que usa el resto de la app.
   */
  const [navExpanded, setNavExpanded] = useState(false);
  /**
   * El punto contra el que se mide la bajada, y la posición actual.
   *
   * El ancla se recoloca al desplegar la cápsula: sin eso, seguiría midiendo desde el
   * principio del procedimiento y el primer evento de scroll tras desplegarla la
   * cerraría otra vez, porque a mitad de una ficha larga ya se han bajado cientos de
   * puntos desde el origen.
   */
  const navAnchor = useRef(0);
  const readerOffset = useRef(0);
  const expandNav = useCallback((expanded: boolean) => {
    navAnchor.current = readerOffset.current;
    setNavExpanded(expanded);
  }, []);
  /**
   * Buscar dentro del procedimiento. El estado vive aquí, en la pantalla, porque el
   * salto a una coincidencia necesita `scrollRef` y el mapa de desplazamientos por
   * bloque, que también son de aquí; la lógica de qué coincide está en
   * `procedure-find-logic.ts` y se prueba sin montar nada.
   */
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [findIndex, setFindIndex] = useState(0);
  const blockOffsets = useRef<Record<string, number>>({});
  const findMatches = useMemo(() => readerDocument ? findProcedureMatches(readerDocument, findQuery) : [], [findQuery, readerDocument]);

  const scrollToBlock = useCallback((blockKey: string) => {
    const offset = blockOffsets.current[blockKey] ?? sectionOffsets.current[blockKey];
    if (typeof offset !== "number") return;
    // El mismo encuadre que el índice de contenidos: el bloque queda justo bajo la
    // barra, no pegado al borde superior.
    scrollRef.current?.scrollTo({ y: Math.max(0, offset - insetTop - spacing.xl), animated: !reduceMotion });
  }, [insetTop, reduceMotion]);

  const stepFind = useCallback((direction: 1 | -1) => {
    if (findMatches.length === 0) return;
    const next = stepMatchIndex(findIndex, findMatches.length, direction);
    setFindIndex(next);
    scrollToBlock(findMatches[next].blockKey);
  }, [findIndex, findMatches, scrollToBlock]);

  const onChangeFindQuery = useCallback((value: string) => {
    setFindQuery(value);
    setFindIndex(0);
  }, []);

  // Al escribir, saltar a la primera coincidencia sin esperar a que se pulse el
  // chevrón: teclear "adrenalina" y quedarse donde estabas no responde la pregunta.
  useEffect(() => {
    if (!findOpen || findMatches.length === 0) return;
    scrollToBlock(findMatches[Math.min(findIndex, findMatches.length - 1)].blockKey);
    // `findIndex` queda fuera a propósito: moverlo ya desplaza desde `stepFind`, y
    // volver a hacerlo aquí encadenaría dos scrolls sobre el mismo destino.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [findMatches, findOpen, scrollToBlock]);

  const closeFind = useCallback(() => {
    setFindOpen(false);
    setFindQuery("");
    setFindIndex(0);
  }, []);

  const headerActions = useCallback(() => (
    <>
      <ReaderHeaderButton
        icon="magnify"
        label="Buscar en este procedimiento"
        hint="Muestra una barra para localizar un texto dentro del procedimiento."
        active={findOpen}
        onPress={() => setFindOpen((open) => !open)}
      />
      <ReaderHeaderButton
        icon="export-variant"
        label="Compartir procedimiento"
        hint={accessibilityHints.share}
        busy={share.busy}
        active={Boolean(share.anchor)}
        onPress={(anchor) => share.setAnchor(anchor)}
      />
    </>
  ), [findOpen, share]);
  useEffect(() => {
    if (procedure && canRecordRecent(content, routeKey)) remember(routeKey);
  }, [content, procedure, remember, routeKey]);
  useEffect(() => {
    if (!procedure) return;
    const offset = readingPositions.get(routeKey);
    if (offset > 0) requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: offset, animated: false }));
  }, [procedure, routeKey]);
  useEffect(() => {
    sectionOffsets.current = {};
    blockOffsets.current = {};
    headingOffsets.current = [];
    markdownOrigin.current = 0;
  }, [readerDocument]);
  useEffect(() => {
    let cancelled = false;
    if (!procedure) return () => { cancelled = true; };
    (async () => {
      const entries = await Promise.all(procedure.attachments.map(async (attachment) => [attachment.id, await reconcileAttachmentRecord(attachment)] as const));
      if (!cancelled) setAttachmentRecords(Object.fromEntries(entries));
    })();
    return () => { cancelled = true; };
  }, [procedure]);
  const procedureFavorite = favorites.includes(routeKey);
  const onToggleProcedureFavorite = useCallback(() => toggleFavorite(routeKey), [toggleFavorite, routeKey]);

  /**
   * Title handoff.
   *
   * The screen used to render the procedure's name twice at once: truncated in
   * the navigation bar and again, full size, as the first line of the body — the
   * same words twice, forty points apart, competing for the top of the screen.
   * The bar's copy now starts invisible and only fades and rises into place over
   * the ~36pt in which the body's copy is leaving, so the two read as one title
   * moving rather than two titles disagreeing.
   */
  const handoff = useMemo(() => {
    const start = Math.max(0, (titleBottom || 72) - insetTop - 28);
    return { start, end: start + 36 };
  }, [titleBottom, insetTop]);
  const headerTitleOpacity = useMemo(
    () => scrollY.interpolate({ inputRange: [handoff.start, handoff.end], outputRange: [0, 1], extrapolate: "clamp" }),
    [handoff.end, handoff.start, scrollY],
  );
  const headerTitleShift = useMemo(
    () => scrollY.interpolate({ inputRange: [handoff.start, handoff.end], outputRange: [10, 0], extrapolate: "clamp" }),
    [handoff.end, handoff.start, scrollY],
  );
  const bodyTitleOpacity = useMemo(
    () => scrollY.interpolate({ inputRange: [handoff.start, handoff.end], outputRange: [1, 0], extrapolate: "clamp" }),
    [handoff.end, handoff.start, scrollY],
  );
  const headerTitle = useCallback(
    () => (
      <Animated.Text
        style={[styles.headerHandoffTitle, { opacity: headerTitleOpacity, transform: [{ translateY: headerTitleShift }] }]}
        numberOfLines={1}
        // The bar and the body say the same thing, so only one of them should be
        // read aloud; `useDetailHeader` still sets the plain string for the back
        // button and the screen's accessible name.
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {displayTitle(procedure ? procedure.title : "Procedimiento")}
      </Animated.Text>
    ),
    [headerTitleOpacity, headerTitleShift, procedure, styles.headerHandoffTitle],
  );

  const onSectionLayout = useCallback((id: string, offset: number) => {
    const absoluteOffset = markdownOrigin.current + offset;
    sectionOffsets.current[id] = absoluteOffset;
    if (readerDocument?.headingIndexById[id] === undefined) return;
    const existingIndex = headingOffsets.current.findIndex((entry) => entry.id === id);
    if (existingIndex >= 0) {
      headingOffsets.current[existingIndex] = { id, offset: absoluteOffset };
      return;
    }
    headingOffsets.current.push({ id, offset: absoluteOffset });
    headingOffsets.current.sort((left, right) => (readerDocument?.headingIndexById[left.id] ?? 0) - (readerDocument?.headingIndexById[right.id] ?? 0));
  }, [readerDocument]);

  const onProcedureScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetY = event.nativeEvent.contentOffset.y;
    // Seguir bajando vuelve a minimizar la cápsula de navegación. Se decide aquí, en el
    // manejador, y no en un efecto que observe `chrome.collapsed`: un `setState` dentro
    // de un efecto encadena un render extra por cada evento de scroll, y el umbral es
    // el mismo `COLLAPSE_TRIGGER` que ya usa el resto de la app.
    readerOffset.current = offsetY;
    if (offsetY - navAnchor.current > COLLAPSE_TRIGGER) setNavExpanded(false);
    // Subir arrastra el ancla consigo, para que una bajada posterior se mida desde donde
    // el lector se paró y no desde el principio.
    if (offsetY < navAnchor.current) navAnchor.current = offsetY;
    scrollY.setValue(offsetY);
    readingPositions.set(routeKey, offsetY);
    chrome.onScroll(event);
    const top = event.nativeEvent.contentInset?.top ?? 0;
    setInsetTop((current) => (current === top ? current : top));
    const contentY = offsetY + top;
    const visibleId = activeHeadingIdAtOffset(headingOffsets.current, contentY + spacing.md);
    const observed = visibleId ? activeSectionKey([{ sectionKey: visibleId }]) : null;
    setActiveHeadingKey((current) => current === observed ? current : observed);
    if (pendingHeadingKey && observed === pendingHeadingKey) setPendingHeadingKey(null);
    setTocPinned(tocFrame.height > 0 && contentY > tocFrame.y + tocFrame.height);
  }, [chrome, pendingHeadingKey, routeKey, scrollY, tocFrame]);
  // The header carries the procedure's name. It used to carry the raw id
  // ("Procedimiento 601_01") because a 60-character name wraps to four lines at
  // large-title size — so the large title is off here, and the id stays on the
  // meta line below where support calls can still read it. The name itself is
  // handed over from the body rather than printed twice: see `handoff` above.
  // No `onToggleFavorite` here on purpose. On the other detail screens the favourite is a
  // fine `headerRight`, but this screen also renders the procedure's own name as the first
  // line of the body (see below), so the star ended up as an unlabelled glyph competing
  // with a collapsing large title. It moves next to that title instead, with a word on it.
  // Under Reduce Motion there is no handoff to run, so the platform draws the
  // title itself and it is simply always there.
  useDetailHeader({
    navigation,
    title: procedure ? procedure.title : "Procedimiento",
    largeTitle: false,
    headerTitle: reduceMotion ? undefined : headerTitle,
    // Compartir sí cabe aquí: a diferencia del favorito no lleva palabra
    // propia junto al icono, así que no compite con el título grande.
    trailing: procedure ? headerActions : undefined,
  });
  if (!procedure) return <MissingResource title="Procedimiento no disponible" detail={`No se encontró “${route.params.id}” en el paquete local.`} onRecover={() => navigation.navigate("Tabs", { screen: "Buscar" })} />;
  if (!readerDocument) return <MissingResource title="Procedimiento no disponible" detail={`No se encontró “${route.params.id}” en el paquete local.`} onRecover={() => navigation.navigate("Tabs", { screen: "Buscar" })} />;
  const { navigation: documentNavigation, rendering, assets } = readerDocument;
  const { outgoing, incoming, unresolvedRelatedIds } = documentNavigation;
  const { imageAttachments, documentAttachments } = rendering;
  const currentHeadingText = readerDocument.headingById.get(pendingHeadingKey ?? activeHeadingKey ?? "")?.text ?? "Contenido";
  /**
   * Opening an anexo is now a navigation, not a download-then-hand-off-to-the-OS.
   *
   * This used to `Linking.openURL` the local file, which throws the reader out of the app
   * into Preview — and it did so *after* waiting for a download that, for every anexo in
   * the approved essential allowlist, had already happened at install time. The viewer
   * screen handles the whole lifecycle instead, including the download and its progress.
   *
   * The one case that still leaves the app is an anexo with no verifiable metadata: there
   * is nothing safe to render, so the official source is genuinely the only route.
   */
  const openAttachment = (attachment: MobileProcedure["attachments"][number]) => {
    if (attachment.byteLength === undefined || !attachment.sha256) {
      setAttachmentRecovery(attachment);
      setAttachmentError(`${attachment.filename} no está validado para guardarse en el dispositivo. Se mantiene disponible la fuente oficial externa.`);
      return;
    }
    setAttachmentError(undefined);
    setAttachmentRecovery(undefined);
    navigation.push("Anexo", { attachmentId: attachment.id });
  };

  return <SafeAreaView style={styles.screen} edges={[]}>
  {findOpen && (
    <ProcedureFindBar
      query={findQuery}
      onChangeQuery={onChangeFindQuery}
      total={findMatches.length}
      index={findIndex}
      onStep={stepFind}
      onClose={closeFind}
    />
  )}
  <Animated.ScrollView
    ref={scrollRef}
    contentContainerStyle={styles.detailContent}
    contentInsetAdjustmentBehavior="automatic"
    onScroll={onProcedureScroll}
    scrollEventThrottle={16}
  >
    <Animated.Text
      style={[styles.detailTitle, reduceMotion ? null : { opacity: bodyTitleOpacity }]}
      onLayout={(event) => { const { y, height } = event.nativeEvent.layout; setTitleBottom(y + height); }}
      accessibilityRole="header"
    >{displayTitle(procedure.title)}</Animated.Text>
    <Press
      onPress={onToggleProcedureFavorite}
      style={[styles.favoriteAction, procedureFavorite && styles.favoriteActionOn]}
      accessibilityRole="button"
      accessibilityLabel={procedureFavorite ? `Quitar ${displayTitle(procedure.title)} de favoritos` : `Guardar ${displayTitle(procedure.title)} en favoritos`}
      accessibilityHint={accessibilityHints.toggleFavorite}
      accessibilityState={{ selected: procedureFavorite }}
    >
      <MaterialCommunityIcons name={procedureFavorite ? "star" : "star-outline"} size={18} color={procedureFavorite ? palette.primaryDark : palette.inkMuted} />
      <Text style={[styles.favoriteActionText, procedureFavorite && styles.favoriteActionTextOn]}>{procedureFavorite ? "Guardado" : "Guardar"}</Text>
    </Press>
    <Text style={styles.detailMeta}>{procedure.section} · {procedure.id}{procedure.updated ? ` · Actualizado ${procedure.updated}` : ""}{procedure.attachments.length ? ` · ${procedure.attachments.length} anexos` : ""}</Text>
    {headings.length > 0 && <View onLayout={(event) => { const { y, height } = event.nativeEvent.layout; setTocFrame({ y, height }); }} style={styles.contentsCard} accessibilityRole="summary" accessibilityLabel="Contenido del procedimiento"><Pressable onPress={() => { animateNextLayout(reduceMotion); setTocExpanded((expanded) => !expanded); }} style={styles.contentsHeader} accessibilityRole="button" accessibilityState={{ expanded: tocExpanded }}><Text style={styles.contentsTitle}>{tocExpanded ? "Contenido" : currentHeadingText}</Text><MaterialCommunityIcons name={tocExpanded ? "chevron-up" : "chevron-down"} size={18} color={palette.inkMuted} /></Pressable>{tocExpanded && headings.map((heading) => <Pressable key={heading.id} onPress={() => { const offset = sectionOffsets.current[heading.id]; setPendingHeadingKey(heading.id); setActiveHeadingKey(heading.id); if (typeof offset === "number") scrollRef.current?.scrollTo({ y: Math.max(0, offset - insetTop - spacing.md), animated: !reduceMotion }); }} style={[styles.contentsRow, (pendingHeadingKey ?? activeHeadingKey) === heading.id && styles.contentsRowActive]} accessibilityRole="button" accessibilityLabel={`Ir a ${heading.text}`} accessibilityHint="Salta a esta sección del procedimiento."><View style={[styles.contentsAccent, (pendingHeadingKey ?? activeHeadingKey) === heading.id && styles.contentsAccentActive]} /><Text style={[styles.contentsText, heading.level > 2 && styles.contentsTextNested]}>{heading.text}</Text></Pressable>)}</View>}
    <MarkdownContent
      sections={readerDocument.renderSections}
      onContainerLayout={(offset) => { markdownOrigin.current = offset; }}
      onSectionLayout={onSectionLayout}
      onBlockLayout={(key, sectionKey, offset) => { blockOffsets.current[key] = (sectionOffsets.current[sectionKey] ?? markdownOrigin.current) + offset; }}
      highlightQuery={findOpen ? findQuery : undefined}
      activeBlockKey={findOpen ? findMatches[findIndex]?.blockKey : undefined}
      renderImage={(src, alt) => {
        const attachment = assets.attachmentsByLocalPath.get(src);
        if (!attachment) return null;
        return <ProcedureFigure attachment={attachment} record={attachmentRecords[attachment.id]} onOpen={() => openAttachment(attachment)} alt={alt} />;
      }}
    />
    <ProcedureEditorialBlocks blocks={procedure.editorialBlocks} onProcedure={(id) => navigation.push("Procedure", { id })} />
    {outgoing.length > 0 && <><SectionHeading title="Relacionados" /><View style={styles.cardList}>{outgoing.map((item) => <ProcedureRow key={`outgoing-${item.id}`} procedure={item} onPress={() => navigation.push("Procedure", { id: item.id })} />)}</View></>}
    {incoming.length > 0 && <><SectionHeading title="Enlazan aquí" /><View style={styles.cardList}>{incoming.map((item) => <ProcedureRow key={`incoming-${item.id}`} procedure={item} onPress={() => navigation.push("Procedure", { id: item.id })} />)}</View></>}
    {unresolvedRelatedIds.length > 0 && <View style={styles.sourceNotice}><MaterialCommunityIcons name="link-variant-off" size={19} color={palette.danger} /><Text style={styles.sourceNoticeText}>Algunas referencias ({unresolvedRelatedIds.join(", ")}) no están incluidas en este paquete local.</Text></View>}
    <ProcedureHistorySection procedureId={procedure.id} updates={content.updates} />
    {imageAttachments.length > 0 && <><SectionHeading title="Figuras" /><View style={styles.figureList}>{imageAttachments.map((attachment) => <ProcedureFigure key={attachment.id} attachment={attachment} record={attachmentRecords[attachment.id]} onOpen={() => openAttachment(attachment)} />)}</View></>}
    {(documentAttachments.length > 0 || attachmentError) && <><SectionHeading title="Anexos" />{attachmentError && <View style={styles.sourceNotice} accessibilityLiveRegion="polite"><MaterialCommunityIcons name="alert-circle-outline" size={19} color={palette.danger} /><View style={styles.resourceCopy}><Text style={styles.sourceNoticeText}>{attachmentError}</Text>{attachmentRecovery && <Pressable onPress={() => void Linking.openURL(attachmentRecovery.sourceUrl)} style={styles.minimumTarget} accessibilityRole="link" accessibilityLabel="Abrir fuente oficial del anexo" accessibilityHint={accessibilityHints.openMap}><Text style={styles.sourceRecoveryLink}>Abrir fuente oficial</Text></Pressable>}</View></View>}<View style={styles.cardList} accessibilityRole="list">{documentAttachments.map((attachment) => { const record = attachmentRecords[attachment.id]; const local = isLocallyAvailable(record, attachment); return <Pressable key={attachment.id} onPress={() => openAttachment(attachment)} style={styles.attachmentRow} accessibilityRole="button" accessibilityLabel={`Abrir anexo ${attachment.filename}`} accessibilityHint="Se abre dentro de la app."><MaterialCommunityIcons name="file-pdf-box" size={23} color={palette.primary} /><View style={styles.resourceCopy}><Text style={styles.resourceTitle}>{attachment.filename}</Text><Text style={styles.resourceMeta}>{attachmentKindLabel(attachment.kind)}{local ? "" : " · se descarga al abrirlo"}</Text></View><MaterialCommunityIcons name="chevron-right" size={18} color={palette.inkMuted} /></Pressable>; })}</View></>}
    <Text style={styles.detailDisclaimer}>Consulta de referencia. Confirma siempre la versión operativa vigente.</Text>
  </Animated.ScrollView>
  {/* La píldora de contenido no se dibuja mientras la barra de buscar está abierta:
      va en `position: absolute; top: 0` dentro de este mismo `SafeAreaView`, así que
      se pintaba justo encima de la barra y la tapaba entera. Y mientras se busca, el
      índice de secciones no es la herramienta que se está usando. */}
  {!findOpen && tocPinned && headings.length > 0 && <Press onPress={() => { setTocExpanded(true); const target = tocFrame.y - insetTop - spacing.md; scrollRef.current?.scrollTo({ y: Math.max(0, target), animated: !reduceMotion }); }} style={styles.pinnedContents} accessibilityRole="button" accessibilityLabel={`Contenido, ${currentHeadingText}`}><Text style={styles.pinnedContentsText}>{currentHeadingText}</Text><MaterialCommunityIcons name="format-list-bulleted" size={17} color={palette.primary} /></Press>}
  {/* Los dos controles del lector se apilan en la esquina inicial: la cápsula de
      navegación abajo y "volver arriba" justo encima. `readerControlsOverlap()`
      convierte esa relación en algo que una prueba puede afirmar — que es como se
      detectó que el botón de volver arriba se había puesto sobre el de buscar. */}
  <BackToTop
    visible={chrome.showBackToTop}
    onPress={() => { scrollRef.current?.scrollTo({ y: 0, animated: !reduceMotion }); chrome.reset(); }}
    label="Volver al principio del procedimiento"
    left={READER_BACK_TO_TOP_PLACEMENT.left}
    bottom={READER_BACK_TO_TOP_PLACEMENT.bottom}
  />
  <ReaderNavBar
    expanded={navExpanded}
    onToggle={expandNav}
    onNavigate={(screen) => { expandNav(false); navigation.navigate("Tabs", { screen } as never); }}
    palette={palette}
  />
  <Menu
    visible={Boolean(share.anchor)}
    anchor={share.anchor}
    onClose={() => share.setAnchor(undefined)}
    accessibilityLabel={`Compartir ${displayTitle(procedure.title)}`}
    notice={share.pdfAvailable === false ? "Este dispositivo no puede compartir archivos: solo está disponible el enlace." : undefined}
    items={[
      { key: "link", label: "Compartir enlace", icon: "link-variant", onPress: () => void share.shareLink(), disabled: share.busy, accessibilityHint: "Abre la hoja para compartir el enlace web de este procedimiento." },
      ...(share.pdfAvailable === false ? [] : [{ key: "pdf", label: share.busy ? "Generando PDF…" : "Compartir como PDF", icon: "file-pdf-box" as const, onPress: () => void share.sharePdf(), disabled: share.busy, accessibilityHint: "Genera un PDF de este procedimiento y abre la hoja para compartirlo." }]),
    ]}
  />
  {share.error && <Toast message={share.error} tone="error" onDismiss={() => share.setError(undefined)} />}
  </SafeAreaView>;
}

/*
 * La calculadora de dosis (DoseUtilityCard) se ha retirado.
 *
 * Pedía peso, unidad, vía y dos confirmaciones para devolver una conversión que
 * el propio aviso calificaba de orientativa. La posología de cada fármaco sigue
 * donde estaba, en la ficha, que es de donde salen las pautas reales.
 *
 * `src/dose-logic.ts` se queda: sus helpers de formato y su auditoría los usan
 * las pruebas de posología del vademécum.
 */

function MedicationDoseSectionView({ section, index }: { section: MedicationDoseSection; index: number }) {
  const styles = useAppStyles();
  const icon = section.audience === "adultos" ? "account-outline" : section.audience === "ninos" || section.audience === "lactantes" ? "baby-face-outline" : "account-multiple-outline";
  const tone = section.audience === "adultos" ? styles.doseSectionAdult : section.audience === "ninos" || section.audience === "lactantes" ? styles.doseSectionPediatric : styles.doseSectionGeneral;
  return (
    <View style={[styles.doseSection, tone]} accessibilityLabel={section.sourceHeading ? `${section.label}. ${section.sourceHeading}` : section.label}>
      <View style={styles.doseSectionHeader}>
        <MaterialCommunityIcons name={icon} size={18} color={styles.doseSectionIcon.color} accessibilityElementsHidden />
        <Text style={styles.doseSectionTitle}>{section.label}</Text>
        {section.sourceHeading && section.sourceHeading !== section.label && <Text style={styles.doseSectionContext}>{section.sourceHeading}</Text>}
      </View>
      {section.lines.map((line, lineIndex) => line.bullet
        ? <View key={`${index}-${lineIndex}`} style={styles.doseBulletRow}><Text style={styles.doseBulletDot}>•</Text><Text style={styles.doseValue}>{line.text}</Text></View>
        : <Text key={`${index}-${lineIndex}`} style={styles.doseValue}>{line.text}</Text>)}
    </View>
  );
}

function MedicationSafetyPanel({ label, value, tone }: { label: string; value: string; tone: "danger" | "warning" | "neutral" }) {
  const styles = useAppStyles();
  const icon = tone === "danger" ? "alert-octagon-outline" : tone === "warning" ? "alert-outline" : "information-outline";
  const panelStyle = tone === "danger" ? styles.safetyPanelDanger : tone === "warning" ? styles.safetyPanelWarning : styles.safetyPanelNeutral;
  return (
    <View style={[styles.safetyPanel, panelStyle]} accessibilityLabel={label}>
      <View style={styles.safetyPanelHeader}>
        <MaterialCommunityIcons name={icon} size={18} color={styles.safetyPanelIcon.color} accessibilityElementsHidden />
        <Text style={styles.safetyPanelTitle}>{label}</Text>
      </View>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function DrugScreen({ route, navigation }: NativeStackScreenProps<RootStackParamList, "Drug">) {
  const styles = useAppStyles();
  const { content } = useContentData();
  const { favorites, toggleFavorite, remember } = useContentPreferences();
  const drug = content.drugs.find((item) => String(item.id) === route.params.id);
  const routeKey = `vademecum:drug:${route.params.id}`;
  const favorite = favorites.includes(routeKey);
  useEffect(() => {
    if (drug && canRecordRecent(content, routeKey)) remember(routeKey);
  }, [content, drug, remember, routeKey]);
  const onToggleFavorite = useCallback(() => toggleFavorite(routeKey), [toggleFavorite, routeKey]);
  useDetailHeader({ navigation, title: String(drug?.name ?? "Fármaco"), favorite, onToggleFavorite });
  if (!drug) return <MissingResource title="Fármaco no disponible" />;
  const routes = parseDrugRoutes(drug.route);
  const doseSections = parseMedicationDose(drug.dose);
  const relatedIds = relatedProcedureIdsForDrug(content, drug).slice(0, 12);
  const safetyRows = DRUG_SAFETY_FIELDS.map(([label, key]) => ({ label, value: drugFieldText(drug[key]) }))
    .filter((row) => row.value.length > 0)
    .map((row) => ({ ...row, tone: row.label === "Contraindicaciones" ? "danger" as const : row.label === "Efectos secundarios" || row.label === "Precauciones" ? "warning" as const : "neutral" as const }));
  return <SafeAreaView style={styles.screen} edges={[]}><ScrollView contentContainerStyle={styles.detailContent} contentInsetAdjustmentBehavior="automatic">
    <View style={styles.drugTaxonomy}>
      {[drug.category, drug.subcategory].filter((value): value is string => typeof value === "string" && value.length > 0).map((value) => (
        <Badge key={value} label={value} />
      ))}
    </View>
    {routes.length > 0 && (
      <View style={styles.drugRoutes} accessibilityLabel={`Vías de administración: ${routes.join(", ")}`}>
        <Text style={styles.infoLabel}>Vías de administración</Text>
        <View style={styles.drugRouteChips}>
          {routes.map((route) => <Badge key={route} label={route} tone="accent" />)}
        </View>
      </View>
    )}
    {doseSections.length > 0 && (
      <View style={styles.doseCard} accessibilityLabel={`Dosis. ${doseSections.map((section) => `${section.label}: ${section.lines.map((line) => line.text).join(". ")}`).join(". ")}`}>
        <Text style={styles.doseLabel}>Dosis</Text>
        <View style={styles.doseSections}>
          {doseSections.map((section, index) => <MedicationDoseSectionView key={`${section.audience}-${index}`} section={section} index={index} />)}
        </View>
      </View>
    )}
    {DRUG_DETAIL_FIELDS.map(([label, key]) => {
      const display = drugFieldText(drug[key]);
      return display ? <View key={key} style={styles.infoBlock}><Text style={styles.infoLabel}>{label}</Text><Text style={styles.infoValue}>{display}</Text></View> : null;
    })}
    {safetyRows.length > 0 && (
      <View style={styles.safetySection}>
        <SectionHeading title="Seguridad" />
        <View style={styles.safetyPanels}>
          {safetyRows.map((row) => <MedicationSafetyPanel key={row.label} {...row} />)}
        </View>
      </View>
    )}
    {DRUG_NOTE_FIELDS.map(([label, key]) => {
      const display = drugFieldText(drug[key]);
      return display ? <View key={key} style={styles.infoBlock}><Text style={styles.infoLabel}>{label}</Text><Text style={styles.infoValue}>{display}</Text></View> : null;
    })}
    {relatedIds.length > 0 && <><SectionHeading title="Procedimientos relacionados" /><View style={styles.cardList}>{relatedIds.map((id) => { const procedure = findProcedure(content, id); return procedure ? <ProcedureRow key={id} procedure={procedure} onPress={() => navigation.push("Procedure", { id })} /> : null; })}</View></>}
  </ScrollView></SafeAreaView>;
}

function VademecumReferenceScreen({ route, navigation }: NativeStackScreenProps<RootStackParamList, "Vademecum">) {
  const styles = useAppStyles();
  const { content } = useContentData();
  const { favorites, toggleFavorite, remember } = useContentPreferences();
  const reference = resolveVademecumReference(content, route.params.routeKey);
  const favorite = favorites.includes(route.params.routeKey);
  useEffect(() => {
    if (reference && canRecordRecent(content, route.params.routeKey)) remember(route.params.routeKey);
  }, [content, reference, remember, route.params.routeKey]);
  const onToggleFavorite = useCallback(() => toggleFavorite(route.params.routeKey), [toggleFavorite, route.params.routeKey]);
  useDetailHeader({ navigation, title: reference?.title ?? "Referencia", favorite, onToggleFavorite });
  if (!reference) return <MissingResource title="Referencia de Vademécum no disponible" detail="Esta entrada no está incluida en el paquete local." onRecover={() => navigation.navigate("Tabs", { screen: "Buscar" })} />;
  const details = reference.detail ?? {};
  const fields = Object.entries(details).filter(([key, value]) => !["id", "drugId", "drug", "brandNames", "activeIngredient"].includes(key) && (typeof value === "string" || typeof value === "number" || Array.isArray(value))).slice(0, 12);
  return <SafeAreaView style={styles.screen} edges={[]}><ScrollView contentContainerStyle={styles.detailContent} contentInsetAdjustmentBehavior="automatic"><Text style={styles.detailMeta}>{reference.subtitle}</Text>{fields.map(([key, value]) => <View key={key} style={styles.infoBlock}><Text style={styles.infoLabel}>{fieldLabel(key)}</Text><Text style={styles.infoValue}>{Array.isArray(value) ? value.join(" · ") : String(value)}</Text></View>)}</ScrollView></SafeAreaView>;
}

function CodeScreen({ route, navigation }: NativeStackScreenProps<RootStackParamList, "Code">) {
  const styles = useAppStyles();
  const { content } = useContentData();
  const { favorites, toggleFavorite, remember } = useContentPreferences();
  const reference = resolveCodeReference(content.codes, route.params.routeKey);
  const favorite = favorites.includes(route.params.routeKey);
  useEffect(() => {
    if (reference && canRecordRecent(content, route.params.routeKey)) remember(route.params.routeKey);
  }, [content, reference, remember, route.params.routeKey]);
  const onToggleFavorite = useCallback(() => toggleFavorite(route.params.routeKey), [toggleFavorite, route.params.routeKey]);
  useDetailHeader({ navigation, title: reference?.badge ?? reference?.title ?? "Código", favorite, onToggleFavorite });
  if (!reference) return <MissingResource title="Código no disponible" detail="Este código no está incluido en el paquete local." onRecover={() => navigation.navigate("Tabs", { screen: "Buscar" })} />;
  const details = reference.detail ?? {};
  const description = typeof details.description === "string" ? details.description : "";
  const category = typeof details.category === "string" ? details.category : "";
  const extraFields = Object.entries(details).filter(([key, value]) => !["code", "name", "title", "category", "description"].includes(key) && (typeof value === "string" || typeof value === "number" || Array.isArray(value))).slice(0, 8);
  const relatedProcedures = content.relationsIndex.codes[route.params.routeKey.replace(/^code:/, "")] ?? [];
  const codeEvents = content.updates.filter((event) => event.category === "codigo" && event.routeKey === route.params.routeKey);
  return <SafeAreaView style={styles.screen} edges={[]}><ScrollView contentContainerStyle={styles.detailContent} contentInsetAdjustmentBehavior="automatic"><Text style={styles.detailTitle}>{[reference.badge, reference.title].filter(Boolean).join(" · ")}</Text><Text style={styles.detailMeta}>{category || "Código"}</Text>{description ? <View style={styles.infoBlock}><Text style={styles.infoLabel}>Descripción</Text><Text style={styles.infoValue}>{description}</Text></View> : null}{extraFields.map(([key, value]) => <View key={key} style={styles.infoBlock}><Text style={styles.infoLabel}>{fieldLabel(key)}</Text><Text style={styles.infoValue}>{Array.isArray(value) ? value.map((item) => typeof item === "object" ? JSON.stringify(item) : String(item)).join(" · ") : String(value)}</Text></View>)}{relatedProcedures.length > 0 && <><SectionHeading title="Procedimientos relacionados" /><View style={styles.cardList}>{relatedProcedures.map((item) => { const procedure = findProcedure(content, item.procedureId); return procedure ? <ProcedureRow key={item.procedureId} procedure={procedure} onPress={() => navigation.push("Procedure", { id: item.procedureId })} /> : null; })}</View></>}{codeEvents.length > 0 && <ProcedureHistorySection predicate={(event) => event.category === "codigo" && event.routeKey === route.params.routeKey} updates={content.updates} />}</ScrollView></SafeAreaView>;
}

// Status 4 is a reusable component (src/components/Status4Cheatsheet.tsx) so a later
// ticket can mount it from the Mapa screen unchanged. This stack screen is Códigos'
// entry point — reached from the Hospitales subtab — satisfying T5c's requirement
// that the cheatsheet (9 records, previously rendered nowhere) be reachable now.
function Status4Screen({ navigation }: NativeStackScreenProps<RootStackParamList, "Status4">) {
  const palette = useTheme();
  const styles = useAppStyles();
  const { content } = useContentData();
  const hospitals = useMemo(() => asCodigosHospitals(content.hospitals), [content.hospitals]);
  const status4 = useMemo(() => asStatus4Entries(content.status4), [content.status4]);
  const entries = useMemo(() => buildHospitalList(hospitals, status4), [hospitals, status4]);
  return <SafeAreaView style={styles.screen} edges={[]}><ScrollView contentContainerStyle={styles.detailContent} contentInsetAdjustmentBehavior="automatic"><Status4Cheatsheet status4={status4} hospitals={entries} palette={palette} onSelectHospital={(hospital) => navigation.navigate("Location", { routeKey: locationRouteKey({ kind: "hospital", id: hospital.id }) })} /></ScrollView></SafeAreaView>;
}

// The placeholder flat/searchable list (T5a) that used to live here is gone:
// the Vademécum tab is now VademecumScreen (src/screens/VademecumScreen.tsx),
// a real destination organising the four domains the way the web's
// VademecumView does, with the dose calculator reachable through it via
// DrugScreen (see T5d).

/**
 * Novedades de la app. `Historial` cuenta lo que cambia en el manual; esto, lo que
 * cambia en la aplicación. Hoy no hay nada que contar y lo dice, en vez de inventarse
 * una entrada de "versión inicial" que enseñaría que esta pantalla no sirve.
 */
function ChangelogScreen({ navigation }: NativeStackScreenProps<RootStackParamList, "Changelog">) {
  const styles = useAppStyles();
  useDetailHeader({ navigation, title: "Novedades" });
  return <SafeAreaView style={styles.screen} edges={[]}><ScrollView contentContainerStyle={styles.detailContent} contentInsetAdjustmentBehavior="automatic">
    {APP_CHANGELOG.length === 0
      ? <EmptyState title="Sin novedades todavía" detail={`Estás en la versión ${Constants.expoConfig?.version ?? "1.0.0"}. Aquí aparecerá lo que cambie en la aplicación a partir de la siguiente.`} />
      : APP_CHANGELOG.map((release) => (
        <View key={release.version} style={styles.infoBlock}>
          <Text style={styles.infoLabel}>{release.version} · {release.date}</Text>
          {release.changes.map((change, index) => (
            <View key={index} style={styles.markdownBullet}><Text style={styles.bulletDot}>•</Text><Text style={styles.infoValue}>{change}</Text></View>
          ))}
        </View>
      ))}
  </ScrollView></SafeAreaView>;
}

function AbbreviationsScreen({ route, navigation }: NativeStackScreenProps<RootStackParamList, "Abbreviations">) {
  const palette = useTheme();
  const styles = useAppStyles();
  const { content } = useContentData();
  const [query, setQuery] = useState(route.params?.query ?? "");
  const entries = useMemo(() => searchAbbreviations(content.abbreviations, query, 1000), [content.abbreviations, query]);
  return <SafeAreaView style={styles.screen} edges={["top"]}><FlatList data={entries} keyExtractor={(item) => item.id} contentContainerStyle={styles.listContent} ListHeaderComponent={<><Pressable onPress={() => navigation.goBack()} style={styles.minimumTarget} accessibilityRole="button" accessibilityLabel="Volver"><MaterialCommunityIcons name="arrow-left" size={24} color={palette.ink} /></Pressable><Text style={styles.pageTitle}>Abreviaturas</Text><View style={styles.detailSearch}><SearchField value={query} onChangeText={setQuery} placeholder="Buscar abreviaturas" /></View></>} ListEmptyComponent={<EmptyState title="Sin coincidencias" detail="Prueba con la abreviatura o su significado." />} renderItem={({ item }) => <View style={styles.abbreviationRow}><Text style={styles.abbreviation}>{item.title}</Text><View style={styles.resourceCopy}><Text style={styles.resourceTitle}>{item.subtitle}</Text><Text style={styles.resourceMeta}>Letra {item.badge ?? "—"}</Text></View></View>} /></SafeAreaView>;
}

/** "PDF" is an acronym; "IMAGE" was the enum shouted at the reader. */
function attachmentKindLabel(kind: MobileAttachment["kind"]): string {
  return kind === "pdf" ? "PDF" : kind === "image" ? "Imagen" : "Documento";
}

function MarkdownContent({ sections, onContainerLayout, onSectionLayout, onBlockLayout, renderImage, highlightQuery, activeBlockKey }: { sections: ParsedProcedureSection[]; onContainerLayout: (offset: number) => void; onSectionLayout: (id: string, offset: number) => void; onBlockLayout?: (key: string, sectionKey: string, offset: number) => void; renderImage?: (src: string, alt: string) => React.ReactNode; highlightQuery?: string; activeBlockKey?: string }) {
  const styles = useAppStyles();
  // Va aqui y no en el stylesheet porque depende de `fontScale`, y `useThemedStyles`
  // memoiza por paleta: un cambio de tamaño de letra no lo regeneraria.
  const { fontScale } = useWindowDimensions();
  const bodyText = [styles.markdownText, { textAlign: procedureTextAlign(fontScale) }];
  /**
   * El desplazamiento de cada bloque, en coordenadas de la sección que lo contiene.
   * El lector lo suma al de la sección y al del contenedor para saltar a una
   * coincidencia. Sin esto sólo se podía saltar a un encabezado, que es justo lo que
   * el índice de contenidos ya hacía.
   */
  const reportBlock = (sectionKey: string, blockKey: string) => (event: LayoutChangeEvent) => {
    onBlockLayout?.(blockKey, sectionKey, event.nativeEvent.layout.y);
  };
  // Un tramo de texto con las coincidencias marcadas. Sin búsqueda activa devuelve la
  // cadena tal cual, para no envolver cada párrafo del manual en `<Text>` anidados.
  const marked = (text: string) => {
    if (!highlightQuery || !isFindableQuery(highlightQuery)) return text;
    return highlightSegments(text, highlightQuery).map((segment, index) =>
      segment.match
        ? <Text key={index} style={styles.markdownHighlight}>{segment.text}</Text>
        : <Text key={index}>{segment.text}</Text>);
  };
  return <View style={[styles.markdown, styles.markdownProcedureBody]} onLayout={(event) => onContainerLayout(event.nativeEvent.layout.y)}>{sections.map((section) => <View key={section.key} onLayout={(event) => onSectionLayout(section.key, event.nativeEvent.layout.y)}>{section.heading && <Text style={section.heading.level === 2 ? styles.markdownH2 : styles.markdownH3}>{marked(section.heading.text)}</Text>}{section.blocks.map((block) => {
    if (block.kind === "table") { const key = `${section.key}-table-${block.startIndex}`; return <View key={key} onLayout={reportBlock(section.key, key)}><MarkdownTable table={block.table} formatCell={readableMarkdownCell} /></View>; }
    if (block.kind === "image") return <React.Fragment key={`${section.key}-img-${block.index}`}>{renderImage?.(block.src, block.alt)}</React.Fragment>;
    if (block.row.kind === "skip") return null;
    const text = readableMarkdownLine(block.line.trim());
    if (!text) return null;
    const key = `${section.key}-${block.index}`;
    const active = activeBlockKey === key;
    if (block.row.kind === "bullet") return <View key={key} onLayout={reportBlock(section.key, key)} style={[styles.markdownBullet, active && styles.markdownBlockActive]}><Text style={styles.bulletDot}>•</Text><Text style={bodyText}>{marked(text)}</Text></View>;
    if (block.row.kind === "ordered") return <View key={key} onLayout={reportBlock(section.key, key)} style={[styles.markdownBullet, active && styles.markdownBlockActive]}><Text style={styles.orderedMarker}>{block.row.ordinal}.</Text><Text style={bodyText}>{marked(text)}</Text></View>;
    return <View key={key} onLayout={reportBlock(section.key, key)} style={active ? styles.markdownBlockActive : undefined}><Text style={bodyText}>{marked(text)}</Text></View>;
  })}</View>)}</View>;
}

function ProcedureEditorialBlocks({ blocks, onProcedure }: { blocks: unknown[]; onProcedure?: (id: string) => void }) {
  const palette = useTheme();
  const styles = useAppStyles();
  const usable = blocks.filter((block): block is Record<string, unknown> => Boolean(block) && typeof block === "object");
  if (!usable.length) return null;
  return <><SectionHeading title="Puntos destacados" /><View style={styles.editorialList}>{usable.map((block, index) => { const items = Array.isArray(block.items) ? block.items : []; const assets = Array.isArray(block.assets) ? block.assets : []; return <View key={String(block.id ?? index)} style={styles.editorialBlock}><Text style={styles.infoLabel}>{String(block.label ?? block.type ?? "Nota")}</Text>{typeof block.title === "string" && <Text style={styles.editorialTitle}>{block.title}</Text>}{typeof block.content === "string" && <Text style={styles.infoValue}>{block.content}</Text>}{items.map((item, itemIndex) => { const itemId = typeof item === "string" && /^\d/.test(item) ? item : undefined; const itemText = typeof item === "string" ? item : String((item as Record<string, unknown>)?.label ?? (item as Record<string, unknown>)?.title ?? "Referencia"); return itemId && onProcedure ? <Pressable key={itemIndex} onPress={() => onProcedure(itemId)} style={styles.editorialLink} accessibilityRole="button" accessibilityLabel={`Abrir procedimiento ${itemId}`}><Text style={styles.markdownText}>• {itemText}</Text><MaterialCommunityIcons name="chevron-right" size={17} color={palette.inkMuted} /></Pressable> : <Text key={itemIndex} style={styles.markdownText}>• {itemText}</Text>; })}{assets.map((asset, assetIndex) => <Text key={assetIndex} style={styles.resourceMeta}>{String((asset as Record<string, unknown>)?.title ?? (asset as Record<string, unknown>)?.src ?? "Material editorial")}</Text>)}</View>; })}</View></>;
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  const palette = useTheme();
  const styles = useAppStyles(); return <View style={styles.emptyState}><MaterialCommunityIcons name="bookmark-off-outline" size={28} color={palette.inkMuted} /><Text style={styles.emptyTitle}>{title}</Text><Text style={styles.emptyDetail}>{detail}</Text></View>; }
function MissingResource({ title, detail, onRecover }: { title: string; detail?: string; onRecover?: () => void }) {
  const palette = useTheme();
  const styles = useAppStyles(); return <SafeAreaView style={styles.screen}><View style={styles.emptyState}><MaterialCommunityIcons name="file-alert-outline" size={30} color={palette.primary} /><Text style={styles.emptyTitle}>{title}</Text>{detail && <Text style={styles.emptyDetail}>{detail}</Text>}{onRecover && <Pressable onPress={onRecover} style={styles.primaryButton} accessibilityRole="button"><Text style={styles.primaryButtonText}>Buscar otro procedimiento</Text></Pressable>}</View></SafeAreaView>; }

function LaunchScreen() {
  const styles = useAppStyles();
  return <SafeAreaView style={styles.launchScreen} accessibilityViewIsModal>
    <LogoMark />
    <Text style={styles.launchTitle} numberOfLines={3}>Manual de procedimientos SAMUR PC</Text>
    <View style={styles.launchAcademy} accessibilityLabel={academyBrand.creator}>
      <Image source={aptaBlueTutor} style={styles.launchMascot} contentFit="contain" alt="Lince azul de APTA Academy" accessibilityLabel="Lince azul de APTA Academy" />
      <View style={styles.launchAcademyCopy}>
        <Text style={styles.launchByline}>{academyBrand.creator}</Text>
        <Text style={styles.launchClaim}>{academyBrand.claim}</Text>
      </View>
    </View>
  </SafeAreaView>;
}

function FirstUseDisclosure({ onContinue }: { onContinue: () => Promise<void> }) {
  const styles = useAppStyles();
  const [isSaving, setIsSaving] = useState(false);
  const reduceMotion = useReduceMotion();
  const continueToApp = async () => { setIsSaving(true); await onContinue(); };
  return <Modal visible animationType={reduceMotion ? "none" : "fade"} presentationStyle="fullScreen" onRequestClose={() => undefined}><SafeAreaView style={styles.disclosureScreen} accessibilityViewIsModal>
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, paddingBottom: spacing.xl, justifyContent: "space-between" }} showsVerticalScrollIndicator={false}>
      <View style={styles.disclosureContent} accessibilityRole="header" accessibilityLabel="Aviso de primera puesta en marcha"><LogoMark /><Text style={styles.disclosureTitle}>Una referencia abierta para la guardia.</Text><View style={styles.disclosureAcademy} accessibilityLabel={academyBrand.creator}><Image source={aptaBlueTutor} style={styles.disclosureMascot} contentFit="contain" alt="Lince azul de APTA Academy" accessibilityLabel="Lince azul de APTA Academy" /><View style={styles.disclosureAcademyCopy}><Text style={styles.disclosureAcademyCreator}>{academyBrand.creator}</Text><Text style={styles.disclosureAcademyClaim}>{academyBrand.claim}</Text></View></View><Text style={styles.disclosureBody}>Manual de procedimientos SAMUR PC es una adaptación digital independiente y no oficial del ManualSAMUR. El contenido es de referencia: no sustituye protocolos, instrucciones ni criterio profesional.</Text><Text style={styles.disclosureBody}>No necesitas cuenta y no se recogen datos de pacientes.</Text></View>
      <View style={{ marginTop: spacing.xl }}><Pressable onPress={() => void continueToApp()} disabled={isSaving} style={[styles.primaryButton, isSaving && styles.disabledButton]} accessibilityRole="button" accessibilityLabel={isSaving ? "Preparando el manual" : "Entendido, abrir el manual"} accessibilityState={{ busy: isSaving }}><Text style={styles.primaryButtonText}>{isSaving ? "Preparando…" : "Entendido, abrir el manual"}</Text></Pressable></View>
    </ScrollView>
  </SafeAreaView></Modal>;
}

/**
 * El icono de una pestaña: contorno cuando no esta activa, relleno cuando lo esta.
 *
 * Cambiar de pestaña es de lo que mas se hace en la app, asi que la transicion se
 * queda en un fundido corto de opacidad: nada de escalas ni rebotes, que a la
 * decima vez cansan. El color sigue siendo la señal principal —cambia siempre,
 * tambien con Reduce Motion— y el fundido solo suaviza el relevo entre los dos
 * trazos. Ambos iconos estan montados a la vez, uno encima del otro, para que no
 * haya un salto de layout al cambiarlos.
 *
 * Codigos y Vademecum no tienen variante de contorno en el set, asi que reciben el
 * mismo nombre en los dos estados y solo cambian de color.
 */
/**
 * `size` viene de `GlassTabBar`, que lo pasa a `options.tabBarIcon`.
 *
 * Estaba fijado a 23 en los cuatro sitios de este componente y el argumento se
 * ignoraba, así que subir el icono de la barra no lo subía: la cápsula crecía y el
 * glifo se quedaba igual, con más aire alrededor. `TAB_ICON_SIZE` es el valor por
 * defecto para el único otro sitio que lo dibuja, la cápsula del lector.
 */
function TabIcon({ name, activeName, color, focused, size = TAB_ICON_SIZE }: { name: keyof typeof MaterialCommunityIcons.glyphMap; activeName?: keyof typeof MaterialCommunityIcons.glyphMap; color: string; focused?: boolean; size?: number }) {
  const reduceMotion = useReduceMotion();
  const filled = activeName ?? name;
  const [progress] = useState(() => new Animated.Value(focused ? 1 : 0));

  useEffect(() => {
    if (reduceMotion) { progress.setValue(focused ? 1 : 0); return; }
    Animated.timing(progress, { toValue: focused ? 1 : 0, duration: motion.instant, useNativeDriver: true }).start();
  }, [focused, progress, reduceMotion]);

  if (filled === name) return <MaterialCommunityIcons name={name} size={size} color={color} />;

  return (
    <View style={[styles_tabIcon.stack, { width: size, height: size }]}>
      <Animated.View style={{ opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }}>
        <MaterialCommunityIcons name={name} size={size} color={color} />
      </Animated.View>
      <Animated.View style={[styles_tabIcon.overlay, { opacity: progress }]}>
        <MaterialCommunityIcons name={filled} size={size} color={color} />
      </Animated.View>
    </View>
  );
}

const styles_tabIcon = StyleSheet.create({
  stack: { alignItems: "center", justifyContent: "center" },
  overlay: { position: "absolute", top: 0, left: 0 },
});

function MainTabs() {
  const palette = useTheme();
  // Five destinations. Buscar used to be the odd one out: a detached capsule beside the
  // tab pill opening a modal, which is the only part of the app you could not get back to
  // by looking at the tab bar.
  return <Tabs.Navigator
    backBehavior="history"
    tabBar={(props) => <GlassTabBar {...props} palette={palette} />}
    screenOptions={{ headerShown: false }}
  >
    <Tabs.Screen name="Inicio" component={HomeScreen} options={{ tabBarLabel: "Inicio", tabBarIcon: ({ color, focused, size }) => <TabIcon name="home-variant-outline" activeName="home-variant" color={color} focused={focused} size={size} /> }} />
    <Tabs.Screen name="Codigos" component={CodigosScreen} options={{ tabBarLabel: "Códigos", tabBarIcon: ({ color, focused, size }) => <TabIcon name="radio-handheld" color={color} focused={focused} size={size} /> }} />
    <Tabs.Screen name="VademecumList" component={VademecumScreen} options={{ tabBarLabel: "Vademécum", tabBarIcon: ({ color, focused, size }) => <TabIcon name="pill" color={color} focused={focused} size={size} /> }} />
    <Tabs.Screen name="Mapa" component={MapaScreen} options={{ tabBarLabel: "Mapa", tabBarIcon: ({ color, focused, size }) => <TabIcon name="map-outline" activeName="map" color={color} focused={focused} size={size} /> }} />
    <Tabs.Screen name="Buscar" component={BuscarScreen} options={{ tabBarLabel: "Buscar", tabBarIcon: ({ color, size }) => <TabIcon name="magnify" color={color} size={size} /> }} />
  </Tabs.Navigator>;
}

function AppNavigation() {
  const palette = useTheme();
  const styles = useAppStyles();
  const reduceMotion = useReduceMotion();
  const { width, fontScale } = useWindowDimensions();
  const layout = adaptiveLayout(width, fontScale);
  const tablet = layout.isTablet;
  // Pushed detail screens use the platform header: a large title that collapses on
  // scroll, the system back button with its swipe affordance, and the favourite as
  // `headerRight`. This replaces six hand-rolled [←][CENTERED CAPS][☆] bars that all
  // rendered the screen's category twice — once in the bar and again as a red caps
  // line forty points below it. Tab screens keep their own headers because they carry
  // the brand lockup and the settings entry point.
  const detailHeader = {
    headerShown: true,
    headerLargeTitle: true,
    headerBackButtonDisplayMode: "minimal",
    headerTintColor: palette.primary,
    headerTitleStyle: { color: palette.ink },
    headerLargeTitleStyle: { color: palette.ink },
    headerStyle: { backgroundColor: palette.paper },
    headerTransparent: false,
  } as const;
  return <NavigationContainer><Stack.Navigator screenOptions={{ headerShown: false, animation: reduceMotion ? "none" : "slide_from_right", gestureEnabled: true, fullScreenGestureEnabled: true, contentStyle: { backgroundColor: styles.screen.backgroundColor }, presentation: tablet ? "card" : undefined }}><Stack.Screen name="Tabs" component={MainTabs} /><Stack.Screen name="Procedure" component={ProcedureScreen} options={{ presentation: "card", ...detailHeader }} /><Stack.Screen name="Location" component={LocationDetailScreen} options={{ presentation: "card", ...detailHeader }} /><Stack.Screen name="Drug" component={DrugScreen} options={{ presentation: "card", ...detailHeader }} /><Stack.Screen name="Vademecum" component={VademecumReferenceScreen} options={{ presentation: "card", ...detailHeader }} /><Stack.Screen name="Code" component={CodeScreen} options={{ presentation: "card", ...detailHeader }} /><Stack.Screen name="Anexo" component={AnexoScreen} options={{ presentation: "card", ...detailHeader }} /><Stack.Screen name="Status4" component={Status4Screen} options={{ presentation: "card", ...detailHeader, title: "Status 4" }} /><Stack.Screen name="Historial" component={HistorialScreen} options={{ presentation: "card", ...detailHeader, title: "Historial" }} /><Stack.Screen name="Changelog" component={ChangelogScreen} options={{ presentation: "card", ...detailHeader, title: "Novedades" }} /><Stack.Screen name="Abbreviations" component={AbbreviationsScreen} options={{ presentation: tablet ? "card" : "formSheet", gestureDirection: "vertical" }} /></Stack.Navigator></NavigationContainer>;
}

function AppGate() {
  const { isHydrated, hasAcknowledgedFirstUse, acknowledgeFirstUse, hasSeenAcademyPromo, markAcademyPromoSeen, appearance } = usePreferences();
  const scheme = useColorScheme();
  const palette = useTheme();
  const styles = useAppStyles();
  const dark = appearance === "dark" || (appearance === "system" && scheme === "dark");
  if (!isHydrated) return <LaunchScreen />;
  if (!hasAcknowledgedFirstUse) return <FirstUseDisclosure onContinue={acknowledgeFirstUse} />;
  if (academySlot && shouldShowAcademySplash(academySlot, hasAcknowledgedFirstUse, hasSeenAcademyPromo)) {
    return <AcademyPromo slot={academySlot} onContinue={markAcademyPromoSeen} />;
  }
  // No `key` here on purpose. The palette used to be a module-level `let` reassigned
  // during this render, so the only way to get the tree to see a theme change was to
  // remount the whole navigator — which threw away wherever the user had navigated to.
  // `useTheme()` re-renders instead.
  return <ContentProvider><View testID="app-interactive-shell" style={[styles.appSurface, { backgroundColor: palette.paper }]}><StatusBar style={dark ? "light" : "dark"} /><AppNavigation /></View></ContentProvider>;
}

function IconFontPreloader() {
  useEffect(() => {
    void MaterialCommunityIcons.loadFont().catch(() => undefined);
  }, []);
  return null;
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <IconFontPreloader />
        <PreferencesProvider>
          <ThemeProvider>
            <AppGate />
          </ThemeProvider>
        </PreferencesProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}


/**
 * `createStyles` cierra con `as const`, que congela también los arrays anidados; un
 * `fontVariant: ["tabular-nums"]` escrito ahí dentro sale como tupla `readonly` y RN
 * la rechaza. Declararlo fuera con su tipo lo deja como referencia y no como literal.
 */
const TABULAR_NUMS: TextStyle["fontVariant"] = ["tabular-nums"];

function createStyles(palette: AdaptivePalette) {
  return {
  appSurface: { flex: 1 },
  minimumTarget: accessibilityTargetStyle(),
  screen: { flex: 1, backgroundColor: palette.paper },
  scrollContent: { padding: spacing.lg, paddingBottom: TAB_BAR_INSET, alignSelf: "center", width: "100%", maxWidth: 960 },
  listContent: { padding: spacing.lg, paddingBottom: TAB_BAR_INSET, gap: 8, alignSelf: "center", width: "100%", maxWidth: 1040 },
  // Keep the reader centered on tablets and clear of the home indicator/floating controls.
  // El margen lateral es `spacing.xl`, no `spacing.lg` como en las listas: el cuerpo del
  // procedimiento va justificado (`procedureTextAlign`), y un texto justificado a 16pt del
  // borde se lee pegado aunque mida lo mismo que una fila de lista alineada a la izquierda.
  detailContent: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: TAB_BAR_INSET, alignSelf: "center", width: "100%", maxWidth: 720 },
  // `brandHeader`/`brandLockup`/`brandName` ya no existen: la cabecera de Inicio es
  // `PageHeader`, la misma que las demás pestañas, y ya no lleva el icono de la app.
  logoMark: { width: 94, height: 94, borderRadius: 27, backgroundColor: palette.primary, overflow: "hidden" },
  logoMarkSmall: { width: 38, height: 38, borderRadius: 11 },
  iconButton: { ...circle(44), alignItems: "center", justifyContent: "center", backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.lineStrong },
  searchBar: { minHeight: 58, borderRadius: radii.md, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.lineStrong, flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, gap: spacing.sm, marginBottom: spacing.xl },
  searchInput: { flex: 1, color: palette.ink, fontSize: 14, paddingVertical: 0 }, searchPlaceholder: { flex: 1, color: palette.inkMuted, fontSize: 14 },
  sectionHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: spacing.md, marginBottom: spacing.md },
  sectionTitle: { color: palette.ink, fontSize: 21, lineHeight: 25, fontWeight: "800", letterSpacing: -0.5 },
  sectionAction: { color: palette.primary, fontSize: 12, fontWeight: "800", paddingBottom: 2 },
  cardList: { backgroundColor: palette.surface, borderRadius: radii.md, borderWidth: 1, borderColor: palette.line, overflow: "hidden", marginBottom: spacing.xl },
  resourceRow: { minHeight: 70, padding: spacing.md, flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: palette.surface, borderBottomWidth: 1, borderBottomColor: palette.line }, resourceRowMain: { flex: 1, minHeight: 44, flexDirection: "row", alignItems: "center", gap: spacing.md },
  resourceCode: { width: 42, height: 42, borderRadius: radii.sm, backgroundColor: palette.primaryWash, alignItems: "center", justifyContent: "center" },
  drugCode: { backgroundColor: palette.surfaceMuted }, resourceCopy: { flex: 1 }, resourceTitle: { color: palette.ink, fontSize: 14, lineHeight: 18, fontWeight: "700" }, resourceInlineCode: { color: palette.primary, fontWeight: "800" }, resourceMeta: { color: palette.inkMuted, fontSize: 11, lineHeight: 16, marginTop: 3 }, resourceSnippet: { color: palette.inkMuted, fontSize: 12, lineHeight: 17, marginTop: 5 }, resourceSnippetMatch: { color: palette.ink, fontWeight: "700", backgroundColor: palette.amberWash },
  pressed: { opacity: 0.72 },
  progressTrack: { height: 4, borderRadius: radii.pill, backgroundColor: palette.line, overflow: "hidden", marginTop: 7 }, progressFill: { height: 4, backgroundColor: palette.green },
  disclaimer: { color: palette.inkMuted, fontSize: 11, lineHeight: 16, textAlign: "center", marginVertical: spacing.md },
  searchScreenHeader: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.md }, searchScreenHeaderRow: { flexDirection: "row", alignItems: "center", gap: spacing.md }, pageTitle: { color: palette.ink, fontSize: typography.largeTitle.fontSize, lineHeight: typography.largeTitle.lineHeight, fontWeight: "700", letterSpacing: -0.8 }, searchPadding: { paddingHorizontal: spacing.lg }, // Altura explicita, no `flexGrow: 0` a secas. Cada `Chip` va envuelto en `Press`, que
  // le impone `minHeight: 44` *despues* del estilo del que llama (`MIN_TARGET` va al
  // final del array en `Press.tsx`), asi que la pildora mide 44 aunque su estilo diga
  // 36. Con solo `spacing.xs` arriba y abajo, el scroller horizontal se quedaba con la
  // altura de su primer layout y recortaba los ultimos puntos de la pildora por abajo,
  // mas aun al subir el cuerpo de letra.
  filterScroller: { flexGrow: 0, flexShrink: 0, height: 44 + spacing.sm * 2, marginTop: spacing.sm, marginBottom: spacing.sm }, filterScrollerContent: { alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, gap: spacing.sm }, detailSearch: { marginTop: spacing.lg },
  filterRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, paddingHorizontal: spacing.lg, marginBottom: spacing.sm }, filterChip: { minHeight: 44, justifyContent: "center", paddingVertical: 9, paddingHorizontal: 13, borderRadius: radii.pill, backgroundColor: palette.surfaceMuted }, filterChipActive: { backgroundColor: palette.ink }, filterText: { color: palette.inkMuted, fontSize: 12, fontWeight: "700" }, filterTextActive: { color: palette.paper },
  emptyState: { alignItems: "center", padding: spacing.xl, gap: spacing.sm }, emptyTitle: { color: palette.ink, fontWeight: "800", fontSize: 16 }, emptyDetail: { color: palette.inkMuted, textAlign: "center", fontSize: 13, lineHeight: 18 },
  mapLegend: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.md }, mapLegendText: { color: palette.inkMuted, fontSize: 12 }, locationPolicyNotice: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, backgroundColor: palette.amberWash, borderRadius: radii.md, padding: spacing.md, marginHorizontal: spacing.lg, marginBottom: spacing.md }, onlineMapDisabled: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, backgroundColor: palette.surfaceMuted, borderRadius: radii.md, borderWidth: 1, borderColor: palette.line, padding: spacing.md, marginHorizontal: spacing.lg, marginBottom: spacing.md }, onlineMapDisabledTitle: { color: palette.ink, fontSize: 13, fontWeight: "800" }, onlineMapDisabledCopy: { color: palette.inkMuted, fontSize: 12, lineHeight: 17, marginTop: 3 }, locationActions: { gap: spacing.sm, marginBottom: spacing.md }, locationActionButton: { minHeight: 48, borderRadius: radii.md, backgroundColor: palette.ink, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, paddingHorizontal: spacing.lg }, locationActionText: { color: palette.white, fontSize: 13, fontWeight: "800" }, nearestToggle: { flexDirection: "row", gap: spacing.sm }, nearestChoice: { flex: 1, minHeight: 42, borderRadius: radii.sm, backgroundColor: palette.surfaceMuted, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.sm }, nearestChoiceActive: { backgroundColor: palette.primaryWash, borderWidth: 1, borderColor: palette.primary }, nearestChoiceText: { color: palette.inkMuted, fontSize: 11, fontWeight: "800", textAlign: "center" }, nearestChoiceTextActive: { color: palette.primaryDark }, locationFallback: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, backgroundColor: palette.amberWash, borderRadius: radii.md, padding: spacing.md, marginBottom: spacing.md }, locationFallbackText: { flex: 1, color: palette.ink, fontSize: 12, lineHeight: 17 }, locationTypeBadge: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: spacing.sm, borderRadius: radii.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginBottom: spacing.sm }, locationTypeBadgeText: { fontSize: 12, fontWeight: "800" }, accessibleEquivalent: { backgroundColor: palette.surfaceMuted, borderRadius: radii.md, padding: spacing.md, marginBottom: spacing.sm }, accessibleEquivalentTitle: { color: palette.ink, fontSize: 14, fontWeight: "800" }, accessibleEquivalentCopy: { color: palette.inkMuted, fontSize: 12, lineHeight: 17, marginTop: 3 }, onlineMapAttributionText: { fontSize: 10, color: "#13233D" }, retryLinkText: { color: palette.ink, fontSize: 12, fontWeight: "800", textDecorationLine: "underline", marginTop: 4 },
  schematicMap: { height: 300, borderRadius: radii.lg, backgroundColor: palette.surfaceMuted, overflow: "hidden", position: "relative", marginBottom: spacing.xl, borderWidth: 1, borderColor: palette.line }, mapRoadOne: { position: "absolute", width: "150%", height: 42, backgroundColor: palette.paper, transform: [{ rotate: "-24deg" }], top: 125, left: -50 }, mapRoadTwo: { position: "absolute", width: "120%", height: 20, backgroundColor: palette.paper, transform: [{ rotate: "38deg" }], top: 64, left: -12 }, mapRoadThree: { position: "absolute", width: 18, height: "130%", backgroundColor: palette.paper, transform: [{ rotate: "15deg" }], top: -20, left: 185 }, mapPinRed: { backgroundColor: palette.primary }, mapPinNavy: { backgroundColor: palette.ink }, mapCompass: { position: "absolute", top: 15, right: 15, alignItems: "center" }, mapCompassN: { fontSize: 11, color: palette.ink, fontWeight: "900" }, mapNote: { color: palette.inkMuted, fontSize: 11, lineHeight: 16, textAlign: "center", marginTop: -spacing.md, marginBottom: spacing.xl }, locationIconBase: { backgroundColor: palette.amberWash }, locationAddress: { color: palette.ink, fontSize: 11, lineHeight: 16, marginTop: 2 }, locationDistance: { color: palette.green, fontSize: 11, fontWeight: "800", lineHeight: 16, marginTop: 2 }, locationFreshness: { color: palette.inkMuted, fontSize: 10, lineHeight: 14, marginTop: 2 },
  detailTopbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.xl }, detailTopbarLabel: { flex: 1, marginHorizontal: spacing.md, textAlign: "center", color: palette.inkMuted, fontSize: 10, fontWeight: "800", letterSpacing: 1.2 }, detailSection: { color: palette.primary, fontSize: 11, fontWeight: "900", letterSpacing: 1.4, marginBottom: spacing.sm }, detailTitle: { color: palette.ink, fontSize: 30, lineHeight: 34, fontWeight: "800", letterSpacing: -0.8 }, headerHandoffTitle: { color: palette.ink, fontSize: 17, fontWeight: "600", letterSpacing: -0.4, maxWidth: 240, textAlign: "center" }, detailMeta: { color: palette.inkMuted, fontSize: 12, marginTop: spacing.sm, marginBottom: spacing.lg }, sourceNotice: { flexDirection: "row", gap: spacing.sm, backgroundColor: palette.dangerWash, borderRadius: radii.md, padding: spacing.md, marginBottom: spacing.xl }, sourceNoticeText: { flex: 1, color: palette.dangerDark, fontSize: 12, lineHeight: 17 }, sourceRecoveryLink: { color: palette.dangerDark, fontSize: 12, fontWeight: "800", textDecorationLine: "underline", marginTop: spacing.sm }, contentsCard: { backgroundColor: palette.surfaceMuted, borderRadius: radii.md, padding: spacing.md, marginBottom: spacing.xl, overflow: "hidden" }, contentsTitle: { color: palette.inkMuted, fontSize: 13, fontWeight: "600", letterSpacing: -0.08 }, contentsRow: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: palette.line }, contentsText: { flex: 1, color: palette.ink, fontSize: 13, fontWeight: "700" }, contentsTextNested: { paddingLeft: spacing.md, fontWeight: "600", color: palette.inkMuted }, markdown: { gap: spacing.sm, marginBottom: spacing.xl }, markdownText: { color: palette.ink, fontSize: 15, lineHeight: 23 }, markdownH2: { color: palette.ink, fontSize: 22, lineHeight: 27, fontWeight: "800", marginTop: spacing.lg }, markdownH3: { color: palette.ink, fontSize: 17, lineHeight: 22, fontWeight: "800", marginTop: spacing.md }, markdownBullet: { flexDirection: "row", gap: spacing.sm, paddingLeft: spacing.sm }, bulletDot: { color: palette.primary, fontSize: 18, lineHeight: 23 }, orderedMarker: { color: palette.primary, fontSize: 15, lineHeight: 23, fontWeight: "800" , minWidth: 22 }, attachmentRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, minHeight: 66, borderBottomWidth: 1, borderBottomColor: palette.line }, editorialList: { backgroundColor: palette.surface, borderRadius: radii.md, borderWidth: 1, borderColor: palette.line, overflow: "hidden", marginBottom: spacing.xl }, editorialBlock: { padding: spacing.md, gap: spacing.sm, borderBottomWidth: 1, borderBottomColor: palette.line }, editorialLink: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, editorialTitle: { color: palette.ink, fontSize: 16, lineHeight: 21, fontWeight: "800" }, updateList: { backgroundColor: palette.surface, borderRadius: radii.md, borderWidth: 1, borderColor: palette.line, overflow: "hidden", marginBottom: spacing.xl }, updateRow: { padding: spacing.md, borderBottomWidth: 1, borderBottomColor: palette.line }, contentsHeader: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, contentsRowActive: { backgroundColor: palette.surface }, contentsAccent: { width: 3, height: 24, borderRadius: radii.pill, backgroundColor: "transparent", marginRight: spacing.sm }, contentsAccentActive: { backgroundColor: palette.primary }, pinnedContents: { position: "absolute", top: 0, left: spacing.lg, right: spacing.lg, minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line, borderRadius: radii.pill }, pinnedContentsText: { color: palette.ink, fontSize: 12, fontWeight: "800" },
  markdownProcedureBody: { paddingRight: spacing.sm },
  // La coincidencia se marca con el lavado ámbar, no con el azul de identidad: el azul
  // ya significa "esto se puede pulsar" en todo el lector, y un párrafo resaltado no
  // lleva a ninguna parte.
  markdownHighlight: { backgroundColor: palette.amberWash, color: palette.ink, fontWeight: "600" },
  // La coincidencia actual, además, lleva la superficie detrás para distinguirla de las
  // otras once que también están marcadas en la pantalla.
  markdownBlockActive: { backgroundColor: palette.surface, borderRadius: radii.sm, marginHorizontal: -spacing.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  favoriteAction: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: spacing.xs + 2, minHeight: 44, paddingHorizontal: spacing.md, borderRadius: radii.pill, backgroundColor: palette.surfaceMuted, marginTop: spacing.md },
  favoriteActionOn: { backgroundColor: palette.primaryWash },
  favoriteActionText: { ...typography.footnote, fontWeight: "600", color: palette.inkMuted },
  favoriteActionTextOn: { color: palette.primaryDark },
  locationMapPreview: { height: 180, borderRadius: radii.lg, overflow: "hidden", borderWidth: 1, borderColor: palette.lineStrong, marginBottom: spacing.lg },
  addressValue: { ...typography.headline, color: palette.ink },
  coordinates: { ...typography.footnote, color: palette.inkMuted, marginTop: spacing.lg },
  figureList: { gap: spacing.lg, marginBottom: spacing.xl },
  figure: { width: "100%", borderRadius: radii.md, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line },
  figurePlaceholder: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 60, paddingHorizontal: spacing.md, borderRadius: radii.md, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line },
  figureCaption: { ...typography.caption, color: palette.inkMuted, marginTop: spacing.xs },
  figureZoom: { position: "absolute", top: spacing.sm, right: spacing.sm, ...circle(28), alignItems: "center", justifyContent: "center", backgroundColor: palette.ink, opacity: 0.72 },
  detailDisclaimer: { color: palette.inkMuted, fontSize: 12, lineHeight: 17, marginTop: spacing.xl, marginBottom: spacing.md },
  // ─── Ficha de fármaco ──────────────────────────────────────────────────────
  // Taxonomía en chapas en vez de una línea gris de doce puntos: "Cardiovascular ·
  // Antiagregantes" era la primera cosa de la pantalla y la más difícil de leer.
  drugTaxonomy: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.lg },
  drugRoutes: { marginBottom: spacing.lg, gap: spacing.sm },
  drugRouteChips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  // La dosis conserva el texto clínico, pero separa los encabezados explícitos de
  // población para que Adultos y Niños no compitan en el mismo bloque visual.
  doseCard: { backgroundColor: palette.surfaceMuted, borderRadius: radii.md, padding: spacing.lg, marginBottom: spacing.lg, gap: spacing.sm },
  doseLabel: { ...typography.footnote, fontWeight: "600", color: palette.inkMuted },
  doseSections: { gap: spacing.sm },
  doseSection: { borderRadius: radii.sm, borderWidth: 1, padding: spacing.md, gap: spacing.sm },
  doseSectionAdult: { borderColor: palette.primary, backgroundColor: palette.primaryWash },
  doseSectionPediatric: { borderColor: palette.green, backgroundColor: palette.greenWash },
  doseSectionGeneral: { borderColor: palette.line, backgroundColor: palette.surface },
  doseSectionHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  doseSectionIcon: { color: palette.inkMuted },
  doseSectionTitle: { color: palette.ink, fontSize: 14, fontWeight: "800" },
  doseSectionContext: { flex: 1, color: palette.inkMuted, fontSize: 12 },
  doseValue: { flex: 1, ...typography.body, color: palette.ink },
  doseBulletRow: { flexDirection: "row", gap: spacing.sm },
  doseBulletDot: { color: palette.primary, ...typography.body, lineHeight: typography.body.lineHeight },
  safetySection: { marginTop: spacing.sm },
  safetyPanels: { gap: spacing.sm },
  safetyPanel: { borderRadius: radii.md, borderWidth: 1, padding: spacing.md, gap: spacing.sm },
  safetyPanelDanger: { borderColor: palette.dangerDark, backgroundColor: palette.dangerWash },
  safetyPanelWarning: { borderColor: palette.amber, backgroundColor: palette.amberWash },
  safetyPanelNeutral: { borderColor: palette.line, backgroundColor: palette.surfaceMuted },
  safetyPanelHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  safetyPanelIcon: { color: palette.inkMuted },
  safetyPanelTitle: { color: palette.ink, fontSize: 13, fontWeight: "800" },
  infoBlock: { borderTopWidth: 1, borderTopColor: palette.line, paddingVertical: spacing.md }, infoLabel: { color: palette.inkMuted, fontSize: 13, fontWeight: "600", letterSpacing: -0.08, marginBottom: 4 }, infoValue: { color: palette.ink, fontSize: 15, lineHeight: 22 }, codeRow: { minHeight: 44, flexDirection: "row", gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: palette.line }, codeValue: { minWidth: 55, color: palette.primary, fontSize: 15, fontWeight: "900" }, codeResultCode: { backgroundColor: palette.amberWash }, abbreviationResultCode: { backgroundColor: palette.greenWash }, abbreviationRow: { minHeight: 44, flexDirection: "row", gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: palette.line }, abbreviation: { width: 70, color: palette.primary, fontWeight: "900", fontSize: 13 },
  modal: { flex: 1, backgroundColor: palette.paper, padding: spacing.lg }, modalContent: { paddingBottom: spacing.xxl }, modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.xl }, modalTitle: { color: palette.ink, fontSize: 24, fontWeight: "800" }, modalClose: { color: palette.primary, fontWeight: "800", padding: spacing.sm }, settingsSectionTitle: { color: palette.ink, fontSize: 17, fontWeight: "800", marginTop: spacing.lg, marginBottom: spacing.sm }, settingsCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: palette.surface, borderColor: palette.line, borderWidth: 1, borderRadius: radii.md, padding: spacing.lg, marginBottom: spacing.sm }, recoveryActions: { backgroundColor: palette.amberWash, borderRadius: radii.md, padding: spacing.md, marginTop: spacing.sm }, recoveryButtons: { flexDirection: "row", gap: spacing.sm }, recoveryButton: { marginTop: spacing.sm, backgroundColor: palette.ink, borderRadius: radii.sm, paddingVertical: 10, paddingHorizontal: spacing.lg }, recoveryButtonText: { color: palette.paper, fontSize: 12, fontWeight: "800" }, recoveryButtonSecondary: { marginTop: spacing.sm, borderColor: palette.lineStrong, borderWidth: 1, borderRadius: radii.sm, paddingVertical: 10, paddingHorizontal: spacing.lg }, recoveryButtonSecondaryText: { color: palette.ink, fontSize: 12, fontWeight: "800" }, primaryButton: { backgroundColor: palette.primaryAction, borderRadius: radii.md, padding: spacing.lg, alignItems: "center", marginTop: spacing.md }, secondaryButton: { borderColor: palette.lineStrong, borderWidth: 1, borderRadius: radii.md, padding: spacing.lg, alignItems: "center", marginTop: spacing.sm }, secondaryButtonText: { color: palette.ink, fontWeight: "800", fontSize: 14 }, locationDetailBlock: { backgroundColor: palette.surfaceMuted, borderRadius: radii.md, padding: spacing.md, marginTop: spacing.lg }, disabledButton: { opacity: 0.55 }, primaryButtonText: { color: palette.white, fontWeight: "800", fontSize: 14 }, appearanceControl: { flexDirection: "row", backgroundColor: palette.surfaceMuted, borderRadius: radii.md, padding: 4, gap: 4 }, appearanceControlStacked: { flexDirection: "column" }, appearanceOption: { flex: 1, minHeight: 45, borderRadius: radii.sm, alignItems: "center", justifyContent: "center", gap: 3 }, appearanceOptionActive: { backgroundColor: palette.ink }, appearanceText: { color: palette.inkMuted, fontSize: 11, fontWeight: "800" }, appearanceTextActive: { color: palette.paper }, infoPanel: { backgroundColor: palette.dangerWash, padding: spacing.lg, borderRadius: radii.md }, infoPanelTitle: { color: palette.dangerDark, fontWeight: "900", fontSize: 14, marginBottom: spacing.sm }, infoPanelText: { color: palette.dangerDark, fontSize: 13, lineHeight: 19 }, linkRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: spacing.lg, borderBottomWidth: 1, borderBottomColor: palette.line }, linkText: { color: palette.primary, fontSize: 13, fontWeight: "800" }, legalText: { color: palette.inkMuted, fontSize: 11, lineHeight: 16, marginTop: spacing.lg }, modalBackdrop: { flex: 1, backgroundColor: "rgba(19,35,61,0.35)", justifyContent: "flex-end" },
  launchScreen: { flex: 1, backgroundColor: palette.paper, alignItems: "center", justifyContent: "center" }, launchTitle: { color: palette.ink, ...typography.title1, textAlign: "center", marginTop: spacing.lg, paddingHorizontal: spacing.xl }, launchAcademy: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.xl, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radii.lg, backgroundColor: palette.primaryWash }, launchMascot: { width: 64, height: 64 }, launchAcademyCopy: { maxWidth: 220, gap: 2 }, launchByline: { color: palette.ink, fontSize: 13, lineHeight: 18, fontWeight: "900" }, launchClaim: { color: palette.primaryDark, fontSize: 12, lineHeight: 16, fontWeight: "700" }, disclosureScreen: { flex: 1, backgroundColor: palette.paper, padding: spacing.lg, justifyContent: "space-between" }, disclosureContent: { alignItems: "flex-start", paddingTop: spacing.xxl }, disclosureEyebrow: { color: palette.primary, fontSize: 10, fontWeight: "900", letterSpacing: 1.3, marginTop: spacing.xxl, marginBottom: spacing.md }, disclosureTitle: { color: palette.ink, fontSize: 30, lineHeight: 35, fontWeight: "900", letterSpacing: -0.8, marginBottom: spacing.lg }, disclosureAcademy: { flexDirection: "row", alignItems: "center", width: "100%", gap: spacing.md, marginBottom: spacing.lg, padding: spacing.md, borderRadius: radii.md, backgroundColor: palette.primaryWash }, disclosureMascot: { width: 48, height: 48 }, disclosureAcademyCopy: { flex: 1, gap: 2 }, disclosureAcademyCreator: { color: palette.ink, fontSize: 13, lineHeight: 18, fontWeight: "900" }, disclosureAcademyClaim: { color: palette.primaryDark, fontSize: 12, lineHeight: 16, fontWeight: "700" }, disclosureBody: { color: palette.ink, fontSize: 16, lineHeight: 23, marginBottom: spacing.md }, disclosureFooter: { color: palette.inkMuted, fontSize: 11, lineHeight: 16, textAlign: "center", marginTop: spacing.md, marginBottom: spacing.sm },
  // La hoja de "Compartir" del lector. Mismas filas de acción que la hoja de
  // Mapa (sheetActions/sheetAction en MapaScreen.tsx) — un único lenguaje
  // para elegir entre varias acciones, no uno por pantalla.
  //
  // Compartir ya no usa ninguno de los dos: dos acciones caben en un desplegable
  // colgado del icono (`components/Menu.tsx`) y no necesitan una hoja a pantalla
  // completa con su propia cabecera.

  // ─── Buscar dentro del procedimiento ───────────────────────────────────────
  // La barra se apoya en la cabecera nativa, con la que comparte fondo, y separa
  // por una línea fina en lugar de por una sombra: es una extensión de la barra,
  // no una tarjeta flotando sobre el texto.
  findBar: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, backgroundColor: palette.paper, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.line },
  findField: { flex: 1, minHeight: 44, flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radii.md, backgroundColor: palette.surfaceMuted },
  findInput: { flex: 1, color: palette.ink, ...typography.callout, paddingVertical: 0 },
  // Cifras tabulares: el contador cambia en cada pulsación y sin ellas los chevrones
  // se desplazan lateralmente al pasar de "9 de 12" a "10 de 12".
  findCounter: { ...typography.footnote, color: palette.inkMuted, fontVariant: TABULAR_NUMS },
  findStep: { alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xs },
  findStepDisabled: { opacity: 0.35 },
  findClose: { ...typography.callout, fontWeight: "600", color: palette.primary },
  // `sheetActions`/`sheetAction`/`sheetActionText` se han ido con la hoja de compartir:
  // sus dos acciones son ahora un desplegable (`components/Menu.tsx`). La hoja del mapa
  // conserva las suyas, declaradas en `MapaScreen.tsx`.
  // The default JS-drawn tab bar styles (tabBar/tabBarTablet/tabLabel/…) were removed here:
  // MainTabs now supplies a custom `tabBar` (GlassTabBar, src/nav-shell.tsx) so the system
  // can render real Liquid Glass, which `@react-navigation/bottom-tabs` can never draw itself.
  } as const;
}

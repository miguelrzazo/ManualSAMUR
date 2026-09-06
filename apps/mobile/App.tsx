import { MaterialCommunityIcons } from "@expo/vector-icons";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator, type BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator, type NativeStackNavigationProp, type NativeStackScreenProps } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import React, { forwardRef, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  FlatList,
  findNodeHandle,
  Linking,
  Modal,
  Platform,
  Pressable as NativePressable,
  ScrollView,
  Text,
  TextInput,
  View,
  useColorScheme,
  useWindowDimensions,
  type PressableProps,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { radii, spacing, TAB_BAR_INSET, typography, type AdaptivePalette } from "@manual-samur/design-tokens";
import { ContentProvider, findProcedure, useContent, type SyncProgress, type SyncState } from "./src/content";
import { contentFreshness, type ContentFreshness } from "./src/content-transaction";
import type { StagedPackage } from "./src/content-transaction";
import { PreferencesProvider, usePreferences, type AppearancePreference } from "./src/preferences";
import { ThemeProvider, useTheme, useThemedStyles } from "./src/theme";
import { useReduceMotion } from "./src/hooks/motion";
import { successNotice, warningNotice } from "./src/hooks/haptics";
import { Chip, Disclosure, FavoriteToggle, PageHeader, Press, SearchField } from "./src/components";
import type { MobileAttachment, MobileProcedure } from "./src/data/schema";
import { displayTitle } from "./src/title-case";
import { classifyMarkdownRows, procedureHeadings, procedureRouteKey, readingPositions, searchProcedures, splitProcedureSections, type ProcedureSection } from "./src/procedure-logic";
import { relatedProcedureIdsForDrug, resolveCodeReference, resolveVademecumReference, searchAbbreviations, searchCodes, searchVademecum, type MobileReferenceSearchResult } from "./src/reference-search-logic";
import { calculateDoseConversion, doseUtilityEligibility, type DoseOperation, type DoseConversionResult } from "./src/dose-logic";
import { isLocallyAvailable, rendersInline, type AttachmentRecord } from "./src/attachment-logic";
import { reconcileAttachmentRecord } from "./src/attachment-runtime";
import {
  locationRecords,
  locationRouteKey,
  locationSourcePolicy,
  locationStaleNotice,
  platformMapsUrl,
  resolveLocationRoute,
  type LocationRecord,
} from "./src/location-logic";
import { APPROVED_ONLINE_MAP_POLICY, mapPinsFromLocations } from "./src/online-map-logic";
import { mapCameraTargetFor } from "./src/mapa-logic";
import { OnlineMapView } from "./src/online-map-view";
import { canRecordRecent, savedReferenceIcon, selectSavedReferences, type ResolvedSavedReference, type SavedReference } from "./src/saved-logic";
import { accessibilityHints, accessibilityTargetStyle, adaptiveLayout, routeAccessibilityLabels } from "./src/accessibility";
import { Image } from "expo-image";
import { GlassTabBar } from "./src/nav-shell";
import { AnexoScreen } from "./src/screens/AnexoScreen";
import { CodigosScreen } from "./src/screens/CodigosScreen";
import { InicioScreen } from "./src/screens/InicioScreen";
import { VademecumScreen } from "./src/screens/VademecumScreen";
import { MapaScreen } from "./src/screens/MapaScreen";
import { Status4Cheatsheet } from "./src/components/Status4Cheatsheet";
import { asCodigosHospitals, asStatus4Entries, buildHospitalList } from "./src/codigos-logic";
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
  return (
    <View style={[styles.logoMark, small && styles.logoMarkSmall]} accessible accessibilityLabel="Manual de procedimientos SAMUR PC">
      <View style={[styles.logoCrossVertical, small && styles.logoSmallBar]} />
      <View style={[styles.logoCrossHorizontal, small && styles.logoSmallHorizontal]} />
      <View style={[styles.logoArrow, small && styles.logoArrowSmall]} />
    </View>
  );
}

function restoreAccessibilityFocus(ref: React.RefObject<View | null>) {
  const node = findNodeHandle(ref.current);
  if (node === null) return;
  setTimeout(() => AccessibilityInfo.setAccessibilityFocus(node), 120);
}

function BrandHeader({ onSettings, settingsRef }: { onSettings?: () => void; settingsRef?: React.RefObject<View | null> }) {
  const palette = useTheme();
  const styles = useAppStyles();
  return (
    <View style={styles.brandHeader}>
      <View style={styles.brandLockup}>
        <LogoMark small />
        <Text style={styles.brandName} numberOfLines={2} maxFontSizeMultiplier={1.6}>Manual de procedimientos SAMUR PC</Text>
      </View>
      {onSettings && (
        <Pressable ref={settingsRef} onPress={onSettings} style={styles.iconButton} accessibilityRole="button" accessibilityLabel={routeAccessibilityLabels.Ajustes} accessibilityHint="Abre las preferencias, privacidad y estado del contenido.">
          <MaterialCommunityIcons name="tune-variant" size={21} color={palette.ink} />
        </Pressable>
      )}
    </View>
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

function useDetailHeader({ navigation, title, favorite, onToggleFavorite, largeTitle = true }: {
  navigation: { setOptions: (options: Record<string, unknown>) => void };
  title: string;
  favorite?: boolean;
  onToggleFavorite?: () => void;
  /** Off for a screen whose body already carries the same name as its own heading. */
  largeTitle?: boolean;
}) {
  useLayoutEffect(() => {
    navigation.setOptions({
      // Titles here come from the corpus (a drug name, a location's short name), which
      // mixes shouted and sentence-cased entries — `displayTitle` levels them.
      title: displayTitle(title),
      headerLargeTitle: largeTitle,
      headerRight: onToggleFavorite
        ? () => <FavoriteToggle favorite={Boolean(favorite)} onToggle={onToggleFavorite} size={24} />
        : undefined,
    });
  }, [navigation, title, favorite, onToggleFavorite, largeTitle]);
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

function ProcedureRow({ procedure, onPress, showFavorite = false }: { procedure: MobileProcedure; onPress: () => void; showFavorite?: boolean }) {
  const palette = useTheme();
  const styles = useAppStyles();
  const { favorites, toggleFavorite } = useContent();
  const routeKey = procedureRouteKey(procedure);
  const favorite = favorites.includes(routeKey);
  return (
    <View style={styles.resourceRow}>
      <Pressable onPress={onPress} style={({ pressed }) => [styles.resourceRowMain, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={`${procedure.id}, ${displayTitle(procedure.title)}`} accessibilityHint={accessibilityHints.openDetail}>
        <View style={styles.resourceCode}><Text style={styles.resourceCodeText}>{procedure.id}</Text></View>
        <View style={styles.resourceCopy}>
          <Text style={styles.resourceTitle}>{displayTitle(procedure.title)}</Text>
          <Text style={styles.resourceMeta}>{procedure.attachments.length ? `${procedure.section} · ${procedure.attachments.length} anexos` : procedure.section}</Text>
        </View>
      </Pressable>
      {showFavorite && <FavoriteToggle favorite={favorite} onToggle={() => toggleFavorite(routeKey)} title={displayTitle(procedure.title)} />}
      <MaterialCommunityIcons name="chevron-right" size={20} color={palette.inkMuted} accessibilityElementsHidden />
    </View>
  );
}

type SyncPresentation = { title: string; detail: string; icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"]; color: string };

function syncPresentation(palette: AdaptivePalette, state: ReturnType<typeof useContent>["syncState"], freshness: ContentFreshness, progress: ReturnType<typeof useContent>["syncProgress"], stagedHash?: string): SyncPresentation {
  const progressText = progress.totalBytes && progress.downloadedBytes !== undefined
    ? `${Math.round((progress.downloadedBytes / progress.totalBytes) * 100)}% en curso`
    : "paquete verificado";
  if (state === "checking" || state === "downloading" || state === "validating" || state === "activating") return { title: "Actualizando contenido", detail: progressText, icon: "cloud-sync-outline", color: palette.green };
  if (state === "success") return { title: "Contenido actualizado", detail: "última activación correcta", icon: "cloud-check-outline", color: palette.green };
  if (state === "failure") return { title: "Actualización no aplicada", detail: stagedHash ? "paquete pendiente; contenido anterior intacto" : "contenido anterior intacto", icon: "cloud-alert-outline", color: palette.primary };
  if (state === "recovery") return { title: "Actualización pendiente", detail: stagedHash ? `recuperable · ${stagedHash.slice(0, 8)}` : "recuperación disponible", icon: "history", color: palette.amber };
  if (freshness !== "fresh" || state === "stale" || state === "offline") return { title: "Contenido sin actualizar", detail: "busca una actualización cuando puedas", icon: "clock-alert-outline", color: palette.amber };
  return { title: "Contenido al día", detail: "listo para la guardia", icon: "database-check-outline", color: palette.green };
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
  const { snapshot, isRefreshing, lastError, refresh, cancelRefresh, syncState, syncProgress, stagedPackage, resumeStaged, discardStaged } = useContent();
  const settingsTriggerRef = useRef<View>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <BrandHeader settingsRef={settingsTriggerRef} onSettings={() => setSettingsOpen(true)} />
      <InicioScreen navigation={navigation} />
      <SettingsModal visible={settingsOpen} onClose={() => { setSettingsOpen(false); restoreAccessibilityFocus(settingsTriggerRef); }} onRefresh={refresh} onCancelRefresh={cancelRefresh} onResumeStaged={resumeStaged} onDiscardStaged={discardStaged} onOpenAbbreviations={() => { setSettingsOpen(false); navigation.getParent()?.navigate("Abbreviations"); }} generatedAt={snapshot.generatedAt} packageHash={snapshot.packageHash} isRefreshing={isRefreshing} lastError={lastError} syncState={syncState} syncProgress={syncProgress} stagedPackage={stagedPackage} />
    </SafeAreaView>
  );
}

const SEARCH_SCOPES = ["Todo", "Procedimientos", "Vademécum", "Códigos"] as const;
const VADEMECUM_SCOPES = ["Todos", "Fármacos", "Comerciales", "Perfusiones", "Fluidos"] as const;

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
  const { content, recents, recentQueries, rememberQuery, forgetQuery } = useContent();
  const stack = navigation.getParent<NativeStackNavigationProp<RootStackParamList>>();
  const recentReferences = useMemo(() => selectSavedReferences(content, recents).slice(0, 6), [content, recents]);
  const openProcedure = (id: string) => stack?.navigate("Procedure", { id });
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof SEARCH_SCOPES)[number]>("Todo");
  const [vademecumCategory, setVademecumCategory] = useState<(typeof VADEMECUM_SCOPES)[number]>("Todos");
  const procedureResults = useMemo(() => searchProcedures(content.procedures, query), [content.procedures, query]);
  const vademecumResults = useMemo(() => searchVademecum(content, query), [content, query]);
  const codeResults = useMemo(() => searchCodes(content.codes, query), [content.codes, query]);
  const visibleProcedures = filter === "Vademécum" || filter === "Códigos" ? [] : procedureResults.map(({ procedure }) => procedure);
  const visibleVademecum = (filter === "Todo" || filter === "Vademécum")
    ? vademecumResults.filter((item) => vademecumCategory === "Todos" || (vademecumCategory === "Fármacos" && item.kind === "drug") || (vademecumCategory === "Comerciales" && item.kind === "commercialName") || (vademecumCategory === "Perfusiones" && item.kind === "perfusion") || (vademecumCategory === "Fluidos" && item.kind === "fluid"))
    : [];
  const visibleCodes = filter === "Todo" || filter === "Códigos" ? codeResults : [];
  const rows = [
    ...visibleProcedures.map((item) => ({ kind: "procedure" as const, item })),
    ...visibleVademecum.map((item) => ({ kind: "reference" as const, item })),
    ...visibleCodes.map((item) => ({ kind: "reference" as const, item })),
  ];

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <PageHeader title="Buscar" />
      {/* No `autoFocus`: a tab that raises the keyboard every time it is selected cannot
          be used to glance at recent searches, which is most of what this screen is for. */}
      <View style={styles.searchPadding}><SearchField value={query} onChangeText={setQuery} onSubmitEditing={() => rememberQuery(query)} placeholder="Buscar procedimientos, fármacos o códigos" /></View>
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
      {(filter === "Todo" || filter === "Vademécum") && <FlatList
        horizontal
        data={VADEMECUM_SCOPES}
        keyExtractor={(item) => item}
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroller}
        contentContainerStyle={styles.filterScrollerContent}
        accessibilityRole="tablist"
        renderItem={({ item }) => <Chip label={item} selected={vademecumCategory === item && filter === "Vademécum"} onPress={() => { setFilter("Vademécum"); setVademecumCategory(item); }} role="tab" />}
      />}
      {query.trim() ? (
        <FlatList
          data={rows}
          keyExtractor={(item, index) => `${item.kind}-${item.item.id}-${index}`}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          onScrollBeginDrag={() => rememberQuery(query)}
          ListEmptyComponent={<EmptyState title="Sin coincidencias" detail="Prueba con un código, un nombre, un sinónimo o una palabra del contenido." />}
          renderItem={({ item }) => item.kind === "procedure" ? <ProcedureRow procedure={item.item} showFavorite onPress={() => { rememberQuery(query); openProcedure(item.item.id); }} /> : <ReferenceRow reference={item.item} onCode={(routeKey) => { rememberQuery(query); stack?.navigate("Code", { routeKey }); }} onVademecum={(routeKey) => { rememberQuery(query); stack?.navigate("Vademecum", { routeKey }); }} onDrug={(id) => { rememberQuery(query); stack?.navigate("Drug", { id }); }} />}
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
  const { favorites, toggleFavorite } = useContent();
  const icon = reference.kind === "code" ? "radio-handheld" : reference.kind === "abbreviation" ? "format-letter-case" : "pill";
  const targetId = reference.targetId;
  const onPress = reference.kind === "code" ? () => onCode(reference.routeKey) : reference.kind === "drug" && targetId ? () => onDrug(targetId) : () => onVademecum(reference.routeKey);
  const favorite = favorites.includes(reference.routeKey);
  const supportsFavorites = reference.kind !== "abbreviation";
  return <View style={styles.resourceRow}>
    <Pressable onPress={onPress} style={({ pressed }) => [styles.resourceRowMain, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={`${reference.title}. ${reference.subtitle}`} accessibilityHint={accessibilityHints.openDetail}>
    <View style={[styles.resourceCode, reference.kind === "code" ? styles.codeResultCode : reference.kind === "abbreviation" ? styles.abbreviationResultCode : styles.drugCode]}><MaterialCommunityIcons name={icon} size={17} color={palette.ink} /></View>
    <View style={styles.resourceCopy}><Text style={styles.resourceTitle}>{reference.title}</Text><Text style={styles.resourceMeta}>{reference.badge ? `${reference.badge} · ` : ""}{reference.subtitle}</Text></View>
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
  const { content, favorites, toggleFavorite, remember } = useContent();
  const policy = locationSourcePolicy;
  const locations = useMemo(() => locationRecords(content, policy), [content, policy]);
  const location = resolveLocationRoute(locations, route.params.routeKey);
  const favorite = favorites.includes(route.params.routeKey);
  useEffect(() => {
    if (location && canRecordRecent(content, route.params.routeKey)) remember(route.params.routeKey);
  }, [content, location, remember, route.params.routeKey]);
  const onToggleFavorite = useCallback(() => toggleFavorite(route.params.routeKey), [toggleFavorite, route.params.routeKey]);
  useDetailHeader({ navigation, title: location?.shortName ?? "Ubicación", favorite, onToggleFavorite });
  if (!location) return <MissingResource title="Punto no disponible" detail="La ruta de ubicación no coincide con el paquete local actual. Vuelve al directorio para consultar otro punto." onRecover={() => navigation.goBack()} />;
  const openMaps = () => { void Linking.openURL(platformMapsUrl(location, Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : "web")); };
  // Order matters here. The address is what a responder reads out, types into a
  // navigator or gives over the radio; the coordinates are a fallback nobody dictates
  // to five decimal places. They used to be the only block on the screen with a label
  // and a heading, above nothing, while the address was a grey meta line.
  return <SafeAreaView style={styles.screen} edges={[]}><ScrollView contentContainerStyle={styles.detailContent} contentInsetAdjustmentBehavior="automatic">
    <LocationMapPreview location={location} label={"Mapa de " + location.name} />
    <Text style={styles.detailMeta}>{displayTitle(location.name)}</Text>
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
        markerColor={palette.primary}
        markerColorBase={palette.ink}
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
function ProcedureFigure({ attachment, record, onOpen }: { attachment: MobileProcedure["attachments"][number]; record?: AttachmentRecord; onOpen: () => void }) {
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
        alt={attachment.filename}
        accessibilityLabel={attachment.filename}
      />
      <Text style={styles.figureCaption} numberOfLines={2}>{attachment.filename}</Text>
      <View style={styles.figureZoom} pointerEvents="none">
        <MaterialCommunityIcons name="magnify-plus-outline" size={16} color={palette.paper} />
      </View>
    </Press>
  );
}

function ProcedureScreen({ route, navigation }: NativeStackScreenProps<RootStackParamList, "Procedure">) {
  const palette = useTheme();
  const styles = useAppStyles();
  const { content, favorites, toggleFavorite, remember } = useContent();
  const reduceMotion = useReduceMotion();
  const [attachmentError, setAttachmentError] = useState<string>();
  const [attachmentRecovery, setAttachmentRecovery] = useState<MobileProcedure["attachments"][number]>();
  const [attachmentRecords, setAttachmentRecords] = useState<Record<string, AttachmentRecord>>({});
  const procedure = findProcedure(content, route.params.id);
  const scrollRef = useRef<ScrollView>(null);
  const routeKey = procedure ? procedureRouteKey(procedure) : `procedure:${route.params.id}`;
  const sections = useMemo(() => procedure ? splitProcedureSections(procedure.content) : [], [procedure]);
  const headings = useMemo(() => procedureHeadings(procedure?.content ?? ""), [procedure]);
  const sectionOffsets = useRef<Record<string, number>>({});
  const markdownOrigin = useRef(0);
  useEffect(() => {
    if (procedure && canRecordRecent(content, routeKey)) remember(routeKey);
  }, [content, procedure, remember, routeKey]);
  useEffect(() => {
    if (!procedure) return;
    const offset = readingPositions.get(routeKey);
    if (offset > 0) requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: offset, animated: false }));
  }, [procedure, routeKey]);
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
  // The header carries the procedure's name. It used to carry the raw id
  // ("Procedimiento 601_01") because a 60-character name wraps to four lines at
  // large-title size — so the large title is off here instead, which also stops the
  // header duplicating the name the body already renders as its own heading. The id
  // stays on the meta line below, where support calls can still read it.
  // No `onToggleFavorite` here on purpose. On the other detail screens the favourite is a
  // fine `headerRight`, but this screen also renders the procedure's own name as the first
  // line of the body (see below), so the star ended up as an unlabelled glyph competing
  // with a collapsing large title. It moves next to that title instead, with a word on it.
  useDetailHeader({ navigation, title: procedure ? procedure.title : "Procedimiento", largeTitle: false });
  if (!procedure) return <MissingResource title="Procedimiento no disponible" detail={`No se encontró “${route.params.id}” en el paquete local.`} onRecover={() => navigation.navigate("Tabs", { screen: "Buscar" })} />;
  const relatedIds = [...new Set([
    ...procedure.related,
    ...procedure.backlinks,
    ...procedure.relations.map((relation) => relation.id),
  ])].filter((id) => id !== procedure.id);
  const related = relatedIds.map((id) => findProcedure(content, id)).filter((item): item is MobileProcedure => Boolean(item));
  const unresolvedRelatedIds = relatedIds.filter((id) => !findProcedure(content, id));
  // Figures belong to the reading; documents belong in a list. See `rendersInline`.
  const imageAttachments = procedure.attachments.filter(rendersInline);
  const documentAttachments = procedure.attachments.filter((attachment) => !rendersInline(attachment));
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

  return <SafeAreaView style={styles.screen} edges={[]}><ScrollView
    ref={scrollRef}
    contentContainerStyle={styles.detailContent}
    contentInsetAdjustmentBehavior="automatic"
    onScroll={(event) => readingPositions.set(routeKey, event.nativeEvent.contentOffset.y)}
    scrollEventThrottle={100}
  >
    <Text style={styles.detailTitle} accessibilityRole="header">{displayTitle(procedure.title)}</Text>
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
    {headings.length > 0 && <View style={styles.contentsCard} accessibilityRole="summary" accessibilityLabel="Contenido del procedimiento"><Text style={styles.contentsTitle}>Contenido</Text>{headings.map((heading) => <Pressable key={heading.id} onPress={() => { const offset = sectionOffsets.current[heading.id]; if (typeof offset === "number") scrollRef.current?.scrollTo({ y: Math.max(0, offset - spacing.md), animated: !reduceMotion }); }} style={styles.contentsRow} accessibilityRole="button" accessibilityLabel={`Ir a ${heading.text}`} accessibilityHint="Salta a esta sección del procedimiento."><Text style={[styles.contentsText, heading.level > 2 && styles.contentsTextNested]}>{heading.text}</Text><MaterialCommunityIcons name="chevron-down" size={16} color={palette.inkMuted} /></Pressable>)}</View>}
    <MarkdownContent sections={sections} onContainerLayout={(offset) => { markdownOrigin.current = offset; }} onSectionLayout={(id, offset) => { sectionOffsets.current[id] = markdownOrigin.current + offset; }} />
    <ProcedureEditorialBlocks blocks={procedure.editorialBlocks} onProcedure={(id) => navigation.push("Procedure", { id })} />
    {related.length > 0 && <><SectionHeading title="Referencias relacionadas" /><View style={styles.cardList}>{related.map((item) => <ProcedureRow key={`related-${item.id}`} procedure={item} onPress={() => navigation.push("Procedure", { id: item.id })} />)}</View></>}
    {unresolvedRelatedIds.length > 0 && <View style={styles.sourceNotice}><MaterialCommunityIcons name="link-variant-off" size={19} color={palette.danger} /><Text style={styles.sourceNoticeText}>Algunas referencias ({unresolvedRelatedIds.join(", ")}) no están incluidas en este paquete local.</Text></View>}
    {procedure.updates.length > 0 && <><SectionHeading title="Actualizaciones" /><View style={styles.updateList} accessibilityLiveRegion="polite" accessibilityLabel={`${procedure.updates.length} actualizaciones editoriales`}>{procedure.updates.map((update, index) => <ProcedureUpdate key={index} update={update} />)}</View></>}
    {imageAttachments.length > 0 && <><SectionHeading title="Figuras" /><View style={styles.figureList}>{imageAttachments.map((attachment) => <ProcedureFigure key={attachment.id} attachment={attachment} record={attachmentRecords[attachment.id]} onOpen={() => openAttachment(attachment)} />)}</View></>}
    {(documentAttachments.length > 0 || attachmentError) && <><SectionHeading title="Anexos" />{attachmentError && <View style={styles.sourceNotice} accessibilityLiveRegion="polite"><MaterialCommunityIcons name="alert-circle-outline" size={19} color={palette.danger} /><View style={styles.resourceCopy}><Text style={styles.sourceNoticeText}>{attachmentError}</Text>{attachmentRecovery && <Pressable onPress={() => void Linking.openURL(attachmentRecovery.sourceUrl)} style={styles.minimumTarget} accessibilityRole="link" accessibilityLabel="Abrir fuente oficial del anexo" accessibilityHint={accessibilityHints.openMap}><Text style={styles.sourceRecoveryLink}>Abrir fuente oficial</Text></Pressable>}</View></View>}<View style={styles.cardList} accessibilityRole="list">{documentAttachments.map((attachment) => { const record = attachmentRecords[attachment.id]; const local = isLocallyAvailable(record, attachment); return <Pressable key={attachment.id} onPress={() => openAttachment(attachment)} style={styles.attachmentRow} accessibilityRole="button" accessibilityLabel={`Abrir anexo ${attachment.filename}`} accessibilityHint="Se abre dentro de la app."><MaterialCommunityIcons name="file-pdf-box" size={23} color={palette.primary} /><View style={styles.resourceCopy}><Text style={styles.resourceTitle}>{attachment.filename}</Text><Text style={styles.resourceMeta}>{attachmentKindLabel(attachment.kind)}{local ? "" : " · se descarga al abrirlo"}</Text></View><MaterialCommunityIcons name="chevron-right" size={18} color={palette.inkMuted} /></Pressable>; })}</View></>}
    <Text style={styles.detailDisclaimer}>Consulta de referencia. Confirma siempre la versión operativa vigente.</Text>
  </ScrollView></SafeAreaView>;
}

function DoseUtilityCard({ drug }: { drug: Record<string, unknown> }) {
  const palette = useTheme();
  const styles = useAppStyles();
  const eligibility = useMemo(() => doseUtilityEligibility(drug), [drug]);
  const structured = drug.doseConversion && typeof drug.doseConversion === "object" ? drug.doseConversion as Record<string, unknown> : undefined;
  const presentation = structured?.presentation && typeof structured.presentation === "object" ? structured.presentation as Record<string, unknown> : undefined;
  const routeValue = presentation?.routes ?? presentation?.route ?? structured?.routes ?? structured?.route;
  const routes = Array.isArray(routeValue) ? routeValue.filter((item): item is string => typeof item === "string") : typeof routeValue === "string" ? [routeValue] : [];
  const [operation, setOperation] = useState<DoseOperation>("amount-to-volume");
  const [amount, setAmount] = useState("1");
  const [amountUnit, setAmountUnit] = useState("mg");
  const [doseRate, setDoseRate] = useState("1");
  const [doseRateUnit, setDoseRateUnit] = useState("mg");
  const [timeUnit, setTimeUnit] = useState("min");
  const [weightKg, setWeightKg] = useState("");
  const [perKg, setPerKg] = useState(false);
  const [enteredRoute, setEnteredRoute] = useState(() => routes[0] ?? "");
  const [presentationConfirmed, setPresentationConfirmed] = useState(false);
  const [routeConfirmed, setRouteConfirmed] = useState(false);
  const [sourceConfirmed, setSourceConfirmed] = useState(false);
  const [result, setResult] = useState<DoseConversionResult>();

  const calculate = () => {
    const next = calculateDoseConversion({
      operation,
      medication: drug,
      amount: operation === "amount-to-volume" ? { value: amount, unit: amountUnit } : undefined,
      doseRate: operation === "dose-rate-to-pump-rate" ? { value: doseRate, unit: doseRateUnit, timeUnit, perKg } : undefined,
      weightKg: perKg ? weightKg : undefined,
      enteredRoute,
      presentationConfirmed,
      routeConfirmed,
      clinicianSourceConfirmed: sourceConfirmed,
    });
    // Feedback the user can feel with the phone in a pocket or under gloves: a
    // success tick for a usable dose, a warning for a refusal. Never the only
    // signal — the result card and the error card render either way.
    if (next.ok) successNotice(); else warningNotice();
    setResult(next);
  };

  if (!eligibility.eligible) {
    return <View style={styles.doseCard} accessibilityLabel="Conversión de dosis no disponible"><View style={styles.doseHeader}><MaterialCommunityIcons name="calculator-variant-outline" size={22} color={palette.inkMuted} /><View style={styles.resourceCopy}><Text style={styles.doseTitle}>Conversión de dosis</Text><Text style={styles.resourceMeta}>No disponible para esta ficha</Text></View></View><Text style={styles.doseUnavailable}>{eligibility.reason ?? "Solo se calculan presentaciones estructuradas y aprobadas."}</Text><Text style={styles.doseDisclaimer}>No se interpreta ni transforma la dosis publicada en texto libre.</Text></View>;
  }

  return <View style={styles.doseCard} accessibilityLabel="Conversión de dosis local">
    <View style={styles.doseHeader}><MaterialCommunityIcons name="calculator-variant-outline" size={22} color={palette.primary} /><View style={styles.resourceCopy}><Text style={styles.doseTitle}>Conversión de dosis</Text><Text style={styles.resourceMeta}>Cálculo local, sin guardar ni compartir</Text></View></View>
    <Text style={styles.doseLabel}>Operación</Text>
    <View style={styles.doseChoiceRow} accessibilityRole="tablist" accessibilityLabel="Operación de conversión">
      {(["amount-to-volume", "dose-rate-to-pump-rate"] as const).map((item) => <Pressable key={item} onPress={() => { setOperation(item); setResult(undefined); }} style={[styles.doseChoice, operation === item && styles.doseChoiceActive]} accessibilityRole="tab" accessibilityLabel={item === "amount-to-volume" ? "Convertir cantidad a volumen" : "Convertir dosis a velocidad de bomba"} accessibilityState={{ selected: operation === item }}><Text style={[styles.doseChoiceText, operation === item && styles.doseChoiceTextActive]}>{item === "amount-to-volume" ? "Cantidad → volumen" : "Dosis → bomba"}</Text></Pressable>)}
    </View>
    {operation === "amount-to-volume" ? <><Text style={styles.doseLabel}>Cantidad de dosis</Text><View style={styles.doseInputRow}><TextInput value={amount} onChangeText={(value) => { setAmount(value); setResult(undefined); }} style={styles.doseInput} keyboardType="decimal-pad" accessibilityLabel="Cantidad de dosis"/><Text style={styles.doseUnit}>{amountUnit}</Text></View><View style={styles.doseChoiceRow}>{["mg", "g", "mcg", "mEq", "UI"].map((item) => <Pressable key={item} onPress={() => setAmountUnit(item)} style={[styles.doseUnitChoice, amountUnit === item && styles.doseUnitChoiceActive]} accessibilityRole="button"><Text style={[styles.doseUnitChoiceText, amountUnit === item && styles.doseUnitChoiceTextActive]}>{item}</Text></Pressable>)}</View></> : <><Text style={styles.doseLabel}>Dosis por tiempo</Text><View style={styles.doseInputRow}><TextInput value={doseRate} onChangeText={(value) => { setDoseRate(value); setResult(undefined); }} style={styles.doseInput} keyboardType="decimal-pad" accessibilityLabel="Dosis por tiempo"/><Text style={styles.doseUnit}>{doseRateUnit} / {timeUnit}</Text></View><View style={styles.doseChoiceRow}>{["mg", "g", "mcg", "mEq", "UI"].map((item) => <Pressable key={item} onPress={() => setDoseRateUnit(item)} style={[styles.doseUnitChoice, doseRateUnit === item && styles.doseUnitChoiceActive]} accessibilityRole="button"><Text style={[styles.doseUnitChoiceText, doseRateUnit === item && styles.doseUnitChoiceTextActive]}>{item}</Text></Pressable>)}{["min", "h", "day"].map((item) => <Pressable key={item} onPress={() => setTimeUnit(item)} style={[styles.doseUnitChoice, timeUnit === item && styles.doseUnitChoiceActive]} accessibilityRole="button"><Text style={[styles.doseUnitChoiceText, timeUnit === item && styles.doseUnitChoiceTextActive]}>{item}</Text></Pressable>)}</View><Pressable onPress={() => { setPerKg((value) => !value); setResult(undefined); }} style={styles.doseCheckRow} accessibilityRole="checkbox" accessibilityState={{ checked: perKg }}><MaterialCommunityIcons name={perKg ? "checkbox-marked" : "checkbox-blank-outline"} size={20} color={perKg ? palette.primary : palette.inkMuted} /><Text style={styles.doseCheckText}>Dosis por kg de peso</Text></Pressable>{perKg && <TextInput value={weightKg} onChangeText={(value) => { setWeightKg(value); setResult(undefined); }} style={styles.doseInputStandalone} keyboardType="decimal-pad" placeholder="Peso (kg)" placeholderTextColor={palette.inkMuted} accessibilityLabel="Peso en kilogramos"/>}</>}
    <Text style={styles.doseLabel} accessibilityRole="header">Vía publicada</Text>
    <View style={styles.doseChoiceRow}>{routes.map((item) => <Pressable key={item} onPress={() => { setEnteredRoute(item); setRouteConfirmed(false); setResult(undefined); }} style={[styles.doseUnitChoice, enteredRoute === item && styles.doseUnitChoiceActive]} accessibilityRole="button"><Text style={[styles.doseUnitChoiceText, enteredRoute === item && styles.doseUnitChoiceTextActive]}>{item}</Text></Pressable>)}</View>
    <Pressable onPress={() => { setPresentationConfirmed((value) => !value); setResult(undefined); }} style={styles.doseCheckRow} accessibilityRole="checkbox" accessibilityLabel="Confirmar la presentación publicada" accessibilityState={{ checked: presentationConfirmed }}><MaterialCommunityIcons name={presentationConfirmed ? "checkbox-marked" : "checkbox-blank-outline"} size={20} color={presentationConfirmed ? palette.primary : palette.inkMuted} /><Text style={styles.doseCheckText}>Confirmo la presentación publicada</Text></Pressable>
    <Pressable onPress={() => { setRouteConfirmed((value) => !value); setResult(undefined); }} style={styles.doseCheckRow} accessibilityRole="checkbox" accessibilityLabel="Confirmar la vía seleccionada" accessibilityState={{ checked: routeConfirmed }}><MaterialCommunityIcons name={routeConfirmed ? "checkbox-marked" : "checkbox-blank-outline"} size={20} color={routeConfirmed ? palette.primary : palette.inkMuted} /><Text style={styles.doseCheckText}>Confirmo la vía seleccionada</Text></Pressable>
    <Pressable onPress={() => { setSourceConfirmed((value) => !value); setResult(undefined); }} style={styles.doseCheckRow} accessibilityRole="checkbox" accessibilityLabel="Confirmar la fuente clínica y su revisión" accessibilityState={{ checked: sourceConfirmed }}><MaterialCommunityIcons name={sourceConfirmed ? "checkbox-marked" : "checkbox-blank-outline"} size={20} color={sourceConfirmed ? palette.primary : palette.inkMuted} /><Text style={styles.doseCheckText}>Confirmo la fuente clínica y su revisión</Text></Pressable>
    <Pressable onPress={calculate} style={styles.doseCalculateButton} accessibilityRole="button" accessibilityLabel="Calcular conversión de dosis" accessibilityHint="Valida los datos y muestra el resultado y su auditoría."><Text style={styles.primaryButtonText}>Calcular</Text></Pressable>
    {result && (result.ok ? <View style={styles.doseResult} accessibilityLiveRegion="polite" accessibilityLabel="Auditoría completa del resultado de dosis"><Text style={styles.doseResultLabel}>Resultado redondeado</Text><Text style={styles.doseResultValue}>{result.display}</Text>{result.warnings.map((warning) => <Text key={warning} style={styles.doseWarning}>Aviso: {warning}</Text>)}<View style={styles.doseAudit}><Disclosure label="Ver detalle del cálculo"><Text style={styles.doseResultDetail}>Medicamento: {result.audit.medication.name} ({result.audit.medication.id})</Text><Text style={styles.doseResultDetail}>Presentación: {result.audit.presentation.label} ({result.audit.presentation.id})</Text><Text style={styles.doseResultDetail}>Fuente clínica: {result.audit.source.clinicianSource} · revisión {result.audit.source.revision} · {result.audit.source.date.slice(0, 10)}</Text><Text style={styles.doseResultDetail}>Entrada: {auditValueSummary(result.audit.inputs.entered)}</Text><Text style={styles.doseResultDetail}>Normalizado: {auditValueSummary(result.audit.inputs.normalized)}</Text><Text style={styles.doseResultDetail}>Fórmula: {result.audit.formula}</Text><Text style={styles.doseResultDetail}>Precisión completa: {result.audit.fullPrecision} {result.unit}</Text><Text style={styles.doseResultDetail}>Redondeo aprobado: {result.audit.rounding.mode} a {result.audit.rounding.increment} {result.audit.rounding.unit} → {result.audit.rounding.result} {result.audit.rounding.unit}</Text></Disclosure></View></View> : <View style={styles.doseError} accessibilityLiveRegion="polite"><MaterialCommunityIcons name="alert-circle-outline" size={19} color={palette.danger} /><Text style={styles.doseErrorText}>{result.reason}</Text></View>)}
    <Text style={styles.doseDisclaimer}>Herramienta orientativa. Verifica la pauta, el paciente y la fuente operativa antes de administrar.</Text>
  </View>;
}

function auditValueSummary(values: Record<string, unknown>): string {
  return Object.entries(values).map(([key, value]) => `${key}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`).join(" · ");
}

function DrugScreen({ route, navigation }: NativeStackScreenProps<RootStackParamList, "Drug">) {
  const styles = useAppStyles();
  const { content, favorites, toggleFavorite, remember } = useContent();
  const drug = content.drugs.find((item) => String(item.id) === route.params.id);
  const routeKey = `vademecum:drug:${route.params.id}`;
  const favorite = favorites.includes(routeKey);
  useEffect(() => {
    if (drug && canRecordRecent(content, routeKey)) remember(routeKey);
  }, [content, drug, remember, routeKey]);
  const onToggleFavorite = useCallback(() => toggleFavorite(routeKey), [toggleFavorite, routeKey]);
  useDetailHeader({ navigation, title: String(drug?.name ?? "Fármaco"), favorite, onToggleFavorite });
  if (!drug) return <MissingResource title="Fármaco no disponible" />;
  const fields = [["Función", "funcion"], ["Indicación", "indication"], ["Presentación publicada", "presentation"], ["Vía", "route"], ["Dosis publicada", "dose"], ["Contraindicaciones", "contraindications"], ["Efectos secundarios", "efectos_secundarios"], ["Notas", "notes"]] as const;
  const relatedIds = relatedProcedureIdsForDrug(content, drug).slice(0, 12);
  return <SafeAreaView style={styles.screen} edges={[]}><ScrollView contentContainerStyle={styles.detailContent} contentInsetAdjustmentBehavior="automatic"><Text style={styles.detailMeta}>{[drug.category, drug.subcategory].filter(Boolean).join(" · ")}</Text>{fields.map(([label, key]) => { const value = drug[key]; const display = Array.isArray(value) ? value.join(" · ") : value; return typeof display === "string" && display ? <View key={key} style={styles.infoBlock}><Text style={styles.infoLabel}>{label}</Text><Text style={styles.infoValue}>{display}</Text></View> : null; })}<DoseUtilityCard drug={drug} />{relatedIds.length > 0 && <><SectionHeading title="Procedimientos relacionados" /><View style={styles.cardList}>{relatedIds.map((id) => { const procedure = findProcedure(content, id); return procedure ? <ProcedureRow key={id} procedure={procedure} onPress={() => navigation.push("Procedure", { id })} /> : null; })}</View></>}</ScrollView></SafeAreaView>;
}

function VademecumReferenceScreen({ route, navigation }: NativeStackScreenProps<RootStackParamList, "Vademecum">) {
  const styles = useAppStyles();
  const { content, favorites, toggleFavorite, remember } = useContent();
  const reference = resolveVademecumReference(content, route.params.routeKey);
  const favorite = favorites.includes(route.params.routeKey);
  useEffect(() => {
    if (reference && canRecordRecent(content, route.params.routeKey)) remember(route.params.routeKey);
  }, [content, reference?.routeKey, remember, route.params.routeKey]);
  const onToggleFavorite = useCallback(() => toggleFavorite(route.params.routeKey), [toggleFavorite, route.params.routeKey]);
  useDetailHeader({ navigation, title: reference?.title ?? "Referencia", favorite, onToggleFavorite });
  if (!reference) return <MissingResource title="Referencia de Vademécum no disponible" detail="Esta entrada no está incluida en el paquete local." onRecover={() => navigation.navigate("Tabs", { screen: "Buscar" })} />;
  const details = reference.detail ?? {};
  const fields = Object.entries(details).filter(([key, value]) => !["id", "drugId", "drug", "brandNames", "activeIngredient"].includes(key) && (typeof value === "string" || typeof value === "number" || Array.isArray(value))).slice(0, 12);
  return <SafeAreaView style={styles.screen} edges={[]}><ScrollView contentContainerStyle={styles.detailContent} contentInsetAdjustmentBehavior="automatic"><Text style={styles.detailMeta}>{reference.subtitle}</Text>{fields.map(([key, value]) => <View key={key} style={styles.infoBlock}><Text style={styles.infoLabel}>{fieldLabel(key)}</Text><Text style={styles.infoValue}>{Array.isArray(value) ? value.join(" · ") : String(value)}</Text></View>)}</ScrollView></SafeAreaView>;
}

function CodeScreen({ route, navigation }: NativeStackScreenProps<RootStackParamList, "Code">) {
  const styles = useAppStyles();
  const { content, favorites, toggleFavorite, remember } = useContent();
  const reference = resolveCodeReference(content.codes, route.params.routeKey);
  const favorite = favorites.includes(route.params.routeKey);
  useEffect(() => {
    if (reference && canRecordRecent(content, route.params.routeKey)) remember(route.params.routeKey);
  }, [content, reference?.routeKey, remember, route.params.routeKey]);
  const onToggleFavorite = useCallback(() => toggleFavorite(route.params.routeKey), [toggleFavorite, route.params.routeKey]);
  useDetailHeader({ navigation, title: reference?.badge ?? reference?.title ?? "Código", favorite, onToggleFavorite });
  if (!reference) return <MissingResource title="Código no disponible" detail="Este código no está incluido en el paquete local." onRecover={() => navigation.navigate("Tabs", { screen: "Buscar" })} />;
  const details = reference.detail ?? {};
  const description = typeof details.description === "string" ? details.description : "";
  const category = typeof details.category === "string" ? details.category : "";
  const extraFields = Object.entries(details).filter(([key, value]) => !["code", "name", "title", "category", "description"].includes(key) && (typeof value === "string" || typeof value === "number" || Array.isArray(value))).slice(0, 8);
  return <SafeAreaView style={styles.screen} edges={[]}><ScrollView contentContainerStyle={styles.detailContent} contentInsetAdjustmentBehavior="automatic"><Text style={styles.detailMeta}>{[reference.title, category].filter(Boolean).join(" · ")}</Text>{description ? <View style={styles.infoBlock}><Text style={styles.infoLabel}>Descripción</Text><Text style={styles.infoValue}>{description}</Text></View> : null}{extraFields.map(([key, value]) => <View key={key} style={styles.infoBlock}><Text style={styles.infoLabel}>{fieldLabel(key)}</Text><Text style={styles.infoValue}>{Array.isArray(value) ? value.map((item) => typeof item === "object" ? JSON.stringify(item) : String(item)).join(" · ") : String(value)}</Text></View>)}</ScrollView></SafeAreaView>;
}

// Status 4 is a reusable component (src/components/Status4Cheatsheet.tsx) so a later
// ticket can mount it from the Mapa screen unchanged. This stack screen is Códigos'
// entry point — reached from the Hospitales subtab — satisfying T5c's requirement
// that the cheatsheet (9 records, previously rendered nowhere) be reachable now.
function Status4Screen({ navigation }: NativeStackScreenProps<RootStackParamList, "Status4">) {
  const palette = useTheme();
  const styles = useAppStyles();
  const { content } = useContent();
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

function AbbreviationsScreen({ route, navigation }: NativeStackScreenProps<RootStackParamList, "Abbreviations">) {
  const palette = useTheme();
  const styles = useAppStyles();
  const { content } = useContent();
  const [query, setQuery] = useState(route.params?.query ?? "");
  const entries = useMemo(() => searchAbbreviations(content.abbreviations, query, 1000), [content.abbreviations, query]);
  return <SafeAreaView style={styles.screen} edges={["top"]}><FlatList data={entries} keyExtractor={(item) => item.id} contentContainerStyle={styles.listContent} ListHeaderComponent={<><Pressable onPress={() => navigation.goBack()} style={styles.minimumTarget} accessibilityRole="button" accessibilityLabel="Volver"><MaterialCommunityIcons name="arrow-left" size={24} color={palette.ink} /></Pressable><Text style={styles.pageTitle}>Abreviaturas</Text><View style={styles.detailSearch}><SearchField value={query} onChangeText={setQuery} placeholder="Buscar abreviaturas" /></View></>} ListEmptyComponent={<EmptyState title="Sin coincidencias" detail="Prueba con la abreviatura o su significado." />} renderItem={({ item }) => <View style={styles.abbreviationRow}><Text style={styles.abbreviation}>{item.title}</Text><View style={styles.resourceCopy}><Text style={styles.resourceTitle}>{item.subtitle}</Text><Text style={styles.resourceMeta}>Letra {item.badge ?? "—"}</Text></View></View>} /></SafeAreaView>;
}

/** "PDF" is an acronym; "IMAGE" was the enum shouted at the reader. */
function attachmentKindLabel(kind: MobileAttachment["kind"]): string {
  return kind === "pdf" ? "PDF" : kind === "image" ? "Imagen" : "Documento";
}

function readableMarkdownLine(line: string): string {
  return line
    .replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "")
    .replace(/^\s*[*_~`]+|[*_~`]+\s*$/g, "")
    .replace(/<DrugLink\s+name="([^"]+)"\s*\/>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\*\*/g, "")
    .replace(/__/g, "")
    .replace(/>>\S+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function MarkdownContent({ sections, onContainerLayout, onSectionLayout }: { sections: ProcedureSection[]; onContainerLayout: (offset: number) => void; onSectionLayout: (id: string, offset: number) => void }) {
  const styles = useAppStyles();
  return <View style={styles.markdown} onLayout={(event) => onContainerLayout(event.nativeEvent.layout.y)}>{sections.map((section) => <View key={section.key} onLayout={(event) => onSectionLayout(section.key, event.nativeEvent.layout.y)}>{section.heading && <Text style={section.heading.level === 2 ? styles.markdownH2 : styles.markdownH3}>{section.heading.text}</Text>}{classifyMarkdownRows(section.lines).map((row, index) => { if (row.kind === "skip") return null; const text = readableMarkdownLine(section.lines[index].trim()); if (!text) return null; if (row.kind === "bullet") return <View key={`${section.key}-${index}`} style={styles.markdownBullet}><Text style={styles.bulletDot}>•</Text><Text style={styles.markdownText}>{text}</Text></View>; if (row.kind === "ordered") return <View key={`${section.key}-${index}`} style={styles.markdownBullet}><Text style={styles.orderedMarker}>{row.ordinal}.</Text><Text style={styles.markdownText}>{text}</Text></View>; return <Text key={`${section.key}-${index}`} style={styles.markdownText}>{text}</Text>; })}</View>)}</View>;
}

function ProcedureEditorialBlocks({ blocks, onProcedure }: { blocks: unknown[]; onProcedure?: (id: string) => void }) {
  const palette = useTheme();
  const styles = useAppStyles();
  const usable = blocks.filter((block): block is Record<string, unknown> => Boolean(block) && typeof block === "object");
  if (!usable.length) return null;
  return <><SectionHeading title="Puntos destacados" /><View style={styles.editorialList}>{usable.map((block, index) => { const items = Array.isArray(block.items) ? block.items : []; const assets = Array.isArray(block.assets) ? block.assets : []; return <View key={String(block.id ?? index)} style={styles.editorialBlock}><Text style={styles.infoLabel}>{String(block.label ?? block.type ?? "Nota")}</Text>{typeof block.title === "string" && <Text style={styles.editorialTitle}>{block.title}</Text>}{typeof block.content === "string" && <Text style={styles.infoValue}>{block.content}</Text>}{items.map((item, itemIndex) => { const itemId = typeof item === "string" && /^\d/.test(item) ? item : undefined; const itemText = typeof item === "string" ? item : String((item as Record<string, unknown>)?.label ?? (item as Record<string, unknown>)?.title ?? "Referencia"); return itemId && onProcedure ? <Pressable key={itemIndex} onPress={() => onProcedure(itemId)} style={styles.editorialLink} accessibilityRole="button" accessibilityLabel={`Abrir procedimiento ${itemId}`}><Text style={styles.markdownText}>• {itemText}</Text><MaterialCommunityIcons name="chevron-right" size={17} color={palette.inkMuted} /></Pressable> : <Text key={itemIndex} style={styles.markdownText}>• {itemText}</Text>; })}{assets.map((asset, assetIndex) => <Text key={assetIndex} style={styles.resourceMeta}>{String((asset as Record<string, unknown>)?.title ?? (asset as Record<string, unknown>)?.src ?? "Material editorial")}</Text>)}</View>; })}</View></>;
}

function ProcedureUpdate({ update }: { update: unknown }) {
  const styles = useAppStyles();
  const value = update && typeof update === "object" ? update as Record<string, unknown> : {};
  const date = String(value.date ?? value.updatedAt ?? value.createdAt ?? "Fecha no indicada");
  const label = String(value.title ?? value.label ?? value.type ?? "Actualización del contenido");
  const detail = String(value.summary ?? value.description ?? value.message ?? "");
  return <View style={styles.updateRow} accessible accessibilityRole="text" accessibilityLabel={`${label}. ${date.slice(0, 10)}${detail ? `. ${detail}` : ""}`}><Text style={styles.infoLabel}>{date.slice(0, 10)}</Text><Text style={styles.resourceTitle}>{label}</Text>{detail && <Text style={styles.resourceMeta}>{detail}</Text>}</View>;
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  const palette = useTheme();
  const styles = useAppStyles(); return <View style={styles.emptyState}><MaterialCommunityIcons name="bookmark-off-outline" size={28} color={palette.inkMuted} /><Text style={styles.emptyTitle}>{title}</Text><Text style={styles.emptyDetail}>{detail}</Text></View>; }
function MissingResource({ title, detail, onRecover }: { title: string; detail?: string; onRecover?: () => void }) {
  const palette = useTheme();
  const styles = useAppStyles(); return <SafeAreaView style={styles.screen}><View style={styles.emptyState}><MaterialCommunityIcons name="file-alert-outline" size={30} color={palette.primary} /><Text style={styles.emptyTitle}>{title}</Text>{detail && <Text style={styles.emptyDetail}>{detail}</Text>}{onRecover && <Pressable onPress={onRecover} style={styles.primaryButton} accessibilityRole="button"><Text style={styles.primaryButtonText}>Buscar otro procedimiento</Text></Pressable>}</View></SafeAreaView>; }

function SettingsModal({ visible, onClose, onRefresh, onCancelRefresh, onResumeStaged, onDiscardStaged, onOpenAbbreviations, generatedAt, packageHash, isRefreshing, lastError, syncState, syncProgress, stagedPackage }: { visible: boolean; onClose: () => void; onRefresh: () => Promise<void>; onCancelRefresh: () => void; onResumeStaged: () => Promise<void>; onDiscardStaged: () => Promise<void>; onOpenAbbreviations: () => void; generatedAt: string; packageHash?: string; isRefreshing: boolean; lastError?: string; syncState: SyncState; syncProgress: SyncProgress; stagedPackage?: StagedPackage }) {
  const palette = useTheme();
  const styles = useAppStyles();
  const { appearance, setAppearance } = usePreferences();
  const reduceMotion = useReduceMotion();
  const { width, fontScale } = useWindowDimensions();
  const layout = adaptiveLayout(width, fontScale);
  const appearanceLabels: Record<AppearancePreference, string> = { system: "Sistema", light: "Claro", dark: "Oscuro" };
  const presentation = syncPresentation(palette, syncState, contentFreshness(generatedAt), syncProgress, stagedPackage?.packageHash);
  const progressPercent = syncProgress.totalBytes && syncProgress.downloadedBytes !== undefined ? Math.min(100, Math.round((syncProgress.downloadedBytes / syncProgress.totalBytes) * 100)) : undefined;
  return <Modal visible={visible} animationType={reduceMotion ? "none" : "slide"} presentationStyle="pageSheet" allowSwipeDismissal onRequestClose={onClose}>
    <SafeAreaView style={styles.modal} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
        <View style={styles.modalHeader} accessibilityRole="header"><View><Text style={styles.modalTitle}>Información y ajustes</Text></View><Pressable onPress={onClose} style={styles.minimumTarget} accessibilityRole="button" accessibilityLabel="Cerrar información y ajustes" accessibilityHint={accessibilityHints.dismiss}><Text style={styles.modalClose}>Cerrar</Text></Pressable></View>
        <Text style={styles.settingsSectionTitle}>Contenido y sincronización</Text>
        <View style={styles.settingsCard} accessibilityLabel="Estado del contenido local">
          <MaterialCommunityIcons name={presentation.icon} size={25} color={presentation.color} />
          <View style={styles.resourceCopy}><Text style={styles.resourceTitle}>{presentation.title}</Text><Text style={styles.resourceMeta}>{lastError ?? `${generatedAt.slice(0, 10)} · rev ${packageHash?.slice(0, 10) ?? "—"} · ${presentation.detail}`}</Text>{progressPercent !== undefined && <View style={styles.progressTrack} accessibilityLabel={`Progreso de actualización ${progressPercent}%`}><View style={[styles.progressFill, { width: `${progressPercent}%` }]} /></View>}</View>
        </View>
        {isRefreshing ? <Pressable onPress={onCancelRefresh} disabled={syncState === "activating"} style={[styles.primaryButton, syncState === "activating" && styles.disabledButton]} accessibilityRole="button" accessibilityLabel={syncState === "activating" ? "Aplicando actualización" : "Cancelar actualización"}><Text style={styles.primaryButtonText}>{syncState === "activating" ? "Aplicando actualización…" : "Cancelar actualización"}</Text></Pressable> : <Pressable onPress={() => void onRefresh()} style={styles.primaryButton} accessibilityRole="button" accessibilityLabel="Buscar actualización"><Text style={styles.primaryButtonText}>Buscar actualización</Text></Pressable>}
        {stagedPackage && <View style={styles.recoveryActions} accessibilityLiveRegion="polite"><Text style={styles.resourceMeta}>Hay un paquete descargado que no llegó a activarse. El contenido anterior sigue protegido.</Text><View style={styles.recoveryButtons}><Pressable onPress={() => void onResumeStaged()} disabled={isRefreshing} style={styles.recoveryButton} accessibilityRole="button" accessibilityLabel="Reanudar actualización pendiente"><Text style={styles.recoveryButtonText}>Reanudar</Text></Pressable><Pressable onPress={() => void onDiscardStaged()} disabled={isRefreshing} style={styles.recoveryButtonSecondary} accessibilityRole="button" accessibilityLabel="Descartar actualización pendiente"><Text style={styles.recoveryButtonSecondaryText}>Descartar</Text></Pressable></View></View>}

        <Text style={styles.settingsSectionTitle}>Consulta rápida</Text>
        <Pressable onPress={onOpenAbbreviations} style={styles.settingsCard} accessibilityRole="button" accessibilityLabel="Abrir abreviaturas">
          <MaterialCommunityIcons name="format-letter-case" size={25} color={palette.green} />
          <View style={styles.resourceCopy}><Text style={styles.resourceTitle}>Abreviaturas</Text><Text style={styles.resourceMeta}>Búsqueda local por abreviatura o significado</Text></View>
          <MaterialCommunityIcons name="chevron-right" size={20} color={palette.inkMuted} />
        </Pressable>

        <Text style={styles.settingsSectionTitle}>Apariencia</Text>
        <View style={[styles.appearanceControl, layout.singleColumn && styles.appearanceControlStacked]} accessibilityRole="radiogroup" accessibilityLabel="Apariencia de la aplicación">
          {(Object.keys(appearanceLabels) as AppearancePreference[]).map((option) => <Pressable key={option} onPress={() => setAppearance(option)} style={[styles.appearanceOption, appearance === option && styles.appearanceOptionActive]} accessibilityRole="radio" accessibilityState={{ selected: appearance === option }}><MaterialCommunityIcons name={option === "system" ? "theme-light-dark" : option === "light" ? "white-balance-sunny" : "weather-night"} size={17} color={appearance === option ? palette.white : palette.inkMuted} /><Text style={[styles.appearanceText, appearance === option && styles.appearanceTextActive]}>{appearanceLabels[option]}</Text></Pressable>)}
        </View>

        <Text style={styles.settingsSectionTitle}>Aviso y alcance</Text>
        <Text style={styles.disclaimer}>Adaptación digital no oficial. No sustituye instrucciones, protocolos ni criterio profesional. Verifica la versión operativa vigente con SAMUR-Protección Civil Madrid.</Text>
        <Text style={styles.settingsSectionTitle}>Privacidad y funcionamiento</Text>
        <Text style={styles.disclaimer}>Sin cuenta y sin datos de pacientes. Tus favoritos, recientes y preferencias se quedan en este dispositivo.</Text>
        <Pressable onPress={() => void Linking.openURL("https://servpub.madrid.es/manualsamur/bin/view/Main/")} style={styles.linkRow} accessibilityRole="link"><Text style={styles.linkText}>Abrir fuente oficial del manual</Text><MaterialCommunityIcons name="open-in-new" size={17} color={palette.primary} /></Pressable>
        <Text style={styles.legalText}>ManualSAMUR y SAMUR-Protección Civil son referencias de sus titulares. Manual de procedimientos SAMUR PC no implica afiliación, aprobación ni representación institucional.</Text>
      </ScrollView>
    </SafeAreaView>
  </Modal>;
}

function LaunchScreen() {
  const styles = useAppStyles();
  return <SafeAreaView style={styles.launchScreen}><LogoMark /><Text style={styles.launchTitle} numberOfLines={3}>Manual de procedimientos SAMUR PC</Text></SafeAreaView>;
}

function FirstUseDisclosure({ onContinue }: { onContinue: () => Promise<void> }) {
  const styles = useAppStyles();
  const [isSaving, setIsSaving] = useState(false);
  const reduceMotion = useReduceMotion();
  const continueToApp = async () => { setIsSaving(true); await onContinue(); };
  return <Modal visible animationType={reduceMotion ? "none" : "fade"} presentationStyle="fullScreen" onRequestClose={() => undefined}><SafeAreaView style={styles.disclosureScreen} accessibilityViewIsModal>
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, paddingBottom: spacing.xl, justifyContent: "space-between" }} showsVerticalScrollIndicator={false}>
      <View style={styles.disclosureContent} accessibilityRole="header" accessibilityLabel="Aviso de primera puesta en marcha"><LogoMark /><Text style={styles.disclosureTitle}>Una referencia abierta para la guardia.</Text><Text style={styles.disclosureBody}>Manual de procedimientos SAMUR PC es una adaptación digital independiente y no oficial del ManualSAMUR. El contenido es de referencia: no sustituye protocolos, instrucciones ni criterio profesional.</Text><Text style={styles.disclosureBody}>No necesitas cuenta y no se recogen datos de pacientes.</Text></View>
      <View style={{ marginTop: spacing.xl }}><Pressable onPress={() => void continueToApp()} disabled={isSaving} style={[styles.primaryButton, isSaving && styles.disabledButton]} accessibilityRole="button" accessibilityLabel={isSaving ? "Preparando el manual" : "Entendido, abrir el manual"} accessibilityState={{ busy: isSaving }}><Text style={styles.primaryButtonText}>{isSaving ? "Preparando…" : "Entendido, abrir el manual"}</Text></Pressable></View>
    </ScrollView>
  </SafeAreaView></Modal>;
}

function TabIcon({ name, color }: { name: keyof typeof MaterialCommunityIcons.glyphMap; color: string }) { return <MaterialCommunityIcons name={name} size={23} color={color} />; }

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
    <Tabs.Screen name="Inicio" component={HomeScreen} options={{ tabBarLabel: "Inicio", tabBarIcon: ({ color }) => <TabIcon name="home-variant-outline" color={color} /> }} />
    <Tabs.Screen name="Codigos" component={CodigosScreen} options={{ tabBarLabel: "Códigos", tabBarIcon: ({ color }) => <TabIcon name="radio-handheld" color={color} /> }} />
    <Tabs.Screen name="VademecumList" component={VademecumScreen} options={{ tabBarLabel: "Vademécum", tabBarIcon: ({ color }) => <TabIcon name="pill" color={color} /> }} />
    <Tabs.Screen name="Mapa" component={MapaScreen} options={{ tabBarLabel: "Mapa", tabBarIcon: ({ color }) => <TabIcon name="map-outline" color={color} /> }} />
    <Tabs.Screen name="Buscar" component={BuscarScreen} options={{ tabBarLabel: "Buscar", tabBarIcon: ({ color }) => <TabIcon name="magnify" color={color} /> }} />
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
  return <NavigationContainer><Stack.Navigator screenOptions={{ headerShown: false, animation: reduceMotion ? "none" : "slide_from_right", gestureEnabled: true, fullScreenGestureEnabled: true, contentStyle: { backgroundColor: styles.screen.backgroundColor }, presentation: tablet ? "card" : undefined }}><Stack.Screen name="Tabs" component={MainTabs} /><Stack.Screen name="Procedure" component={ProcedureScreen} options={{ presentation: "card", ...detailHeader }} /><Stack.Screen name="Location" component={LocationDetailScreen} options={{ presentation: "card", ...detailHeader }} /><Stack.Screen name="Drug" component={DrugScreen} options={{ presentation: "card", ...detailHeader }} /><Stack.Screen name="Vademecum" component={VademecumReferenceScreen} options={{ presentation: "card", ...detailHeader }} /><Stack.Screen name="Code" component={CodeScreen} options={{ presentation: "card", ...detailHeader }} /><Stack.Screen name="Anexo" component={AnexoScreen} options={{ presentation: "card", ...detailHeader }} /><Stack.Screen name="Status4" component={Status4Screen} options={{ presentation: "card", ...detailHeader, title: "Status 4" }} /><Stack.Screen name="Abbreviations" component={AbbreviationsScreen} options={{ presentation: tablet ? "card" : "formSheet", gestureDirection: "vertical" }} /></Stack.Navigator></NavigationContainer>;
}

function AppGate() {
  const { isHydrated, hasAcknowledgedFirstUse, acknowledgeFirstUse, appearance } = usePreferences();
  const scheme = useColorScheme();
  const palette = useTheme();
  const styles = useAppStyles();
  const dark = appearance === "dark" || (appearance === "system" && scheme === "dark");
  if (!isHydrated) return <LaunchScreen />;
  if (!hasAcknowledgedFirstUse) return <FirstUseDisclosure onContinue={acknowledgeFirstUse} />;
  // No `key` here on purpose. The palette used to be a module-level `let` reassigned
  // during this render, so the only way to get the tree to see a theme change was to
  // remount the whole navigator — which threw away wherever the user had navigated to.
  // `useTheme()` re-renders instead.
  return <ContentProvider><View style={[styles.appSurface, { backgroundColor: palette.paper }]}><StatusBar style={dark ? "light" : "dark"} /><AppNavigation /></View></ContentProvider>;
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PreferencesProvider>
          <ThemeProvider>
            <AppGate />
          </ThemeProvider>
        </PreferencesProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}


function createStyles(palette: AdaptivePalette) {
  return {
  appSurface: { flex: 1 },
  minimumTarget: accessibilityTargetStyle(),
  screen: { flex: 1, backgroundColor: palette.paper },
  scrollContent: { padding: spacing.lg, paddingBottom: TAB_BAR_INSET, alignSelf: "center", width: "100%", maxWidth: 960 },
  listContent: { padding: spacing.lg, paddingBottom: TAB_BAR_INSET, gap: 8, alignSelf: "center", width: "100%", maxWidth: 1040 },
  detailContent: { padding: spacing.lg, paddingBottom: 48, alignSelf: "center", width: "100%", maxWidth: 720 },
  brandHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md, paddingBottom: spacing.md, backgroundColor: palette.paper },
  brandLockup: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  logoMark: { width: 94, height: 94, borderRadius: 27, backgroundColor: palette.primary, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  logoMarkSmall: { width: 38, height: 38, borderRadius: 11 },
  logoCrossVertical: { position: "absolute", width: 15, height: 60, backgroundColor: palette.white, borderRadius: 3 },
  logoCrossHorizontal: { position: "absolute", width: 60, height: 15, backgroundColor: palette.white, borderRadius: 3 },
  logoSmallBar: { width: 6, height: 24 }, logoSmallHorizontal: { width: 24, height: 6 },
  logoArrow: { position: "absolute", width: 36, height: 36, backgroundColor: palette.ink, transform: [{ rotate: "45deg" }], left: 20, top: 16, borderRadius: 4 },
  logoArrowSmall: { width: 16, height: 16, left: 8, top: 7, borderRadius: 2 },
  brandName: { flexShrink: 1, color: palette.ink, ...typography.title3, fontWeight: "700" },
  iconButton: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.lineStrong },
  searchBar: { minHeight: 58, borderRadius: radii.md, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.lineStrong, flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, gap: spacing.sm, marginBottom: spacing.xl },
  searchInput: { flex: 1, color: palette.ink, fontSize: 14, paddingVertical: 0 }, searchPlaceholder: { flex: 1, color: palette.inkMuted, fontSize: 14 },
  sectionHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: spacing.md, marginBottom: spacing.md },
  sectionTitle: { color: palette.ink, fontSize: 21, lineHeight: 25, fontWeight: "800", letterSpacing: -0.5 },
  sectionAction: { color: palette.primary, fontSize: 12, fontWeight: "800", paddingBottom: 2 },
  cardList: { backgroundColor: palette.surface, borderRadius: radii.md, borderWidth: 1, borderColor: palette.line, overflow: "hidden", marginBottom: spacing.xl },
  resourceRow: { minHeight: 70, padding: spacing.md, flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: palette.surface, borderBottomWidth: 1, borderBottomColor: palette.line }, resourceRowMain: { flex: 1, minHeight: 44, flexDirection: "row", alignItems: "center", gap: spacing.md },
  resourceCode: { width: 42, height: 42, borderRadius: 12, backgroundColor: palette.primaryWash, alignItems: "center", justifyContent: "center" }, resourceCodeText: { fontSize: 11, fontWeight: "900", color: palette.primary },
  drugCode: { backgroundColor: palette.surfaceMuted }, resourceCopy: { flex: 1 }, resourceTitle: { color: palette.ink, fontSize: 14, lineHeight: 18, fontWeight: "700" }, resourceMeta: { color: palette.inkMuted, fontSize: 11, lineHeight: 16, marginTop: 3 },
  pressed: { opacity: 0.72 },
  progressTrack: { height: 4, borderRadius: 2, backgroundColor: palette.line, overflow: "hidden", marginTop: 7 }, progressFill: { height: 4, backgroundColor: palette.green },
  disclaimer: { color: palette.inkMuted, fontSize: 11, lineHeight: 16, textAlign: "center", marginVertical: spacing.md },
  searchScreenHeader: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.md }, searchScreenHeaderRow: { flexDirection: "row", alignItems: "center", gap: spacing.md }, pageTitle: { color: palette.ink, fontSize: typography.largeTitle.fontSize, lineHeight: typography.largeTitle.lineHeight, fontWeight: "700", letterSpacing: -0.8 }, searchPadding: { paddingHorizontal: spacing.lg }, filterScroller: { flexGrow: 0, marginTop: spacing.md }, filterScrollerContent: { paddingHorizontal: spacing.lg, gap: spacing.sm }, detailSearch: { marginTop: spacing.lg },
  filterRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, paddingHorizontal: spacing.lg, marginBottom: spacing.sm }, filterChip: { minHeight: 44, justifyContent: "center", paddingVertical: 9, paddingHorizontal: 13, borderRadius: radii.pill, backgroundColor: palette.surfaceMuted }, filterChipActive: { backgroundColor: palette.ink }, filterText: { color: palette.inkMuted, fontSize: 12, fontWeight: "700" }, filterTextActive: { color: palette.paper },
  emptyState: { alignItems: "center", padding: spacing.xl, gap: spacing.sm }, emptyTitle: { color: palette.ink, fontWeight: "800", fontSize: 16 }, emptyDetail: { color: palette.inkMuted, textAlign: "center", fontSize: 13, lineHeight: 18 },
  mapLegend: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.md }, mapLegendDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: palette.green }, mapLegendText: { color: palette.inkMuted, fontSize: 12 }, locationPolicyNotice: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, backgroundColor: palette.amberWash, borderRadius: radii.md, padding: spacing.md, marginHorizontal: spacing.lg, marginBottom: spacing.md }, onlineMapDisabled: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, backgroundColor: palette.surfaceMuted, borderRadius: radii.md, borderWidth: 1, borderColor: palette.line, padding: spacing.md, marginHorizontal: spacing.lg, marginBottom: spacing.md }, onlineMapDisabledTitle: { color: palette.ink, fontSize: 13, fontWeight: "800" }, onlineMapDisabledCopy: { color: palette.inkMuted, fontSize: 12, lineHeight: 17, marginTop: 3 }, locationActions: { gap: spacing.sm, marginBottom: spacing.md }, locationActionButton: { minHeight: 48, borderRadius: radii.md, backgroundColor: palette.ink, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, paddingHorizontal: spacing.lg }, locationActionText: { color: palette.white, fontSize: 13, fontWeight: "800" }, nearestToggle: { flexDirection: "row", gap: spacing.sm }, nearestChoice: { flex: 1, minHeight: 42, borderRadius: radii.sm, backgroundColor: palette.surfaceMuted, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.sm }, nearestChoiceActive: { backgroundColor: palette.primaryWash, borderWidth: 1, borderColor: palette.primary }, nearestChoiceText: { color: palette.inkMuted, fontSize: 11, fontWeight: "800", textAlign: "center" }, nearestChoiceTextActive: { color: palette.primaryDark }, locationFallback: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, backgroundColor: palette.amberWash, borderRadius: radii.md, padding: spacing.md, marginBottom: spacing.md }, locationFallbackText: { flex: 1, color: palette.ink, fontSize: 12, lineHeight: 17 }, accessibleEquivalent: { backgroundColor: palette.surfaceMuted, borderRadius: radii.md, padding: spacing.md, marginBottom: spacing.sm }, accessibleEquivalentTitle: { color: palette.ink, fontSize: 14, fontWeight: "800" }, accessibleEquivalentCopy: { color: palette.inkMuted, fontSize: 12, lineHeight: 17, marginTop: 3 },
  onlineMapContainer: { height: 300, borderRadius: radii.lg, overflow: "hidden", position: "relative", marginBottom: spacing.md, borderWidth: 1, borderColor: palette.line }, onlineMapAttribution: { position: "absolute", right: 6, bottom: 6, backgroundColor: "rgba(255,255,255,0.82)", borderRadius: radii.sm, paddingHorizontal: 6, paddingVertical: 2 }, onlineMapAttributionText: { fontSize: 10, color: "#13233D" }, onlineMapRefresh: { position: "absolute", top: 8, right: 8, width: 32, height: 32, borderRadius: 16, backgroundColor: palette.ink, alignItems: "center", justifyContent: "center" }, retryLinkText: { color: palette.ink, fontSize: 12, fontWeight: "800", textDecorationLine: "underline", marginTop: 4 },
  schematicMap: { height: 300, borderRadius: radii.lg, backgroundColor: palette.surfaceMuted, overflow: "hidden", position: "relative", marginBottom: spacing.xl, borderWidth: 1, borderColor: palette.line }, mapRoadOne: { position: "absolute", width: "150%", height: 42, backgroundColor: palette.paper, transform: [{ rotate: "-24deg" }], top: 125, left: -50 }, mapRoadTwo: { position: "absolute", width: "120%", height: 20, backgroundColor: palette.paper, transform: [{ rotate: "38deg" }], top: 64, left: -12 }, mapRoadThree: { position: "absolute", width: 18, height: "130%", backgroundColor: palette.paper, transform: [{ rotate: "15deg" }], top: -20, left: 185 }, mapPin: { position: "absolute", width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: palette.white }, mapPinRed: { backgroundColor: palette.primary }, mapPinNavy: { backgroundColor: palette.ink }, mapCompass: { position: "absolute", top: 15, right: 15, alignItems: "center" }, mapCompassN: { fontSize: 11, color: palette.ink, fontWeight: "900" }, mapNote: { color: palette.inkMuted, fontSize: 11, lineHeight: 16, textAlign: "center", marginTop: -spacing.md, marginBottom: spacing.xl },
  locationRow: { minHeight: 66, padding: spacing.md, flexDirection: "row", alignItems: "center", gap: spacing.md, borderBottomWidth: 1, borderBottomColor: palette.line }, locationIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: palette.primaryWash, alignItems: "center", justifyContent: "center" }, locationIconBase: { backgroundColor: palette.amberWash }, locationAddress: { color: palette.ink, fontSize: 11, lineHeight: 16, marginTop: 2 }, locationDistance: { color: palette.green, fontSize: 11, fontWeight: "800", lineHeight: 16, marginTop: 2 }, locationFreshness: { color: palette.inkMuted, fontSize: 10, lineHeight: 14, marginTop: 2 },
  detailTopbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.xl }, detailTopbarLabel: { flex: 1, marginHorizontal: spacing.md, textAlign: "center", color: palette.inkMuted, fontSize: 10, fontWeight: "800", letterSpacing: 1.2 }, detailSection: { color: palette.primary, fontSize: 11, fontWeight: "900", letterSpacing: 1.4, marginBottom: spacing.sm }, detailTitle: { color: palette.ink, fontSize: 30, lineHeight: 34, fontWeight: "800", letterSpacing: -0.8 }, detailMeta: { color: palette.inkMuted, fontSize: 12, marginTop: spacing.sm, marginBottom: spacing.lg }, sourceNotice: { flexDirection: "row", gap: spacing.sm, backgroundColor: palette.dangerWash, borderRadius: radii.md, padding: spacing.md, marginBottom: spacing.xl }, sourceNoticeText: { flex: 1, color: palette.dangerDark, fontSize: 12, lineHeight: 17 }, sourceRecoveryLink: { color: palette.dangerDark, fontSize: 12, fontWeight: "800", textDecorationLine: "underline", marginTop: spacing.sm }, contentsCard: { backgroundColor: palette.surfaceMuted, borderRadius: radii.md, padding: spacing.md, marginBottom: spacing.xl }, contentsTitle: { color: palette.inkMuted, fontSize: 13, fontWeight: "600", letterSpacing: -0.08, marginBottom: spacing.sm }, contentsRow: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: palette.line }, contentsText: { flex: 1, color: palette.ink, fontSize: 13, fontWeight: "700" }, contentsTextNested: { paddingLeft: spacing.md, fontWeight: "600", color: palette.inkMuted }, markdown: { gap: spacing.sm, marginBottom: spacing.xl }, markdownText: { color: palette.ink, fontSize: 15, lineHeight: 23 }, markdownH2: { color: palette.ink, fontSize: 22, lineHeight: 27, fontWeight: "800", marginTop: spacing.lg }, markdownH3: { color: palette.ink, fontSize: 17, lineHeight: 22, fontWeight: "800", marginTop: spacing.md }, markdownBullet: { flexDirection: "row", gap: spacing.sm, paddingLeft: spacing.sm }, bulletDot: { color: palette.primary, fontSize: 18, lineHeight: 23 }, orderedMarker: { color: palette.primary, fontSize: 15, lineHeight: 23, fontWeight: "800", minWidth: 22 }, attachmentRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, minHeight: 66, borderBottomWidth: 1, borderBottomColor: palette.line }, editorialList: { backgroundColor: palette.surface, borderRadius: radii.md, borderWidth: 1, borderColor: palette.line, overflow: "hidden", marginBottom: spacing.xl }, editorialBlock: { padding: spacing.md, gap: spacing.sm, borderBottomWidth: 1, borderBottomColor: palette.line }, editorialLink: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, editorialTitle: { color: palette.ink, fontSize: 16, lineHeight: 21, fontWeight: "800" }, updateList: { backgroundColor: palette.surface, borderRadius: radii.md, borderWidth: 1, borderColor: palette.line, overflow: "hidden", marginBottom: spacing.xl }, updateRow: { padding: spacing.md, borderBottomWidth: 1, borderBottomColor: palette.line },
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
  figureZoom: { position: "absolute", top: spacing.sm, right: spacing.sm, width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: palette.ink, opacity: 0.72 },
  detailDisclaimer: { color: palette.inkMuted, fontSize: 12, lineHeight: 17, marginTop: spacing.xl, marginBottom: spacing.md },
  infoBlock: { borderTopWidth: 1, borderTopColor: palette.line, paddingVertical: spacing.md }, infoLabel: { color: palette.inkMuted, fontSize: 13, fontWeight: "600", letterSpacing: -0.08, marginBottom: 4 }, infoValue: { color: palette.ink, fontSize: 15, lineHeight: 22 }, codeRow: { minHeight: 44, flexDirection: "row", gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: palette.line }, codeValue: { minWidth: 55, color: palette.primary, fontSize: 15, fontWeight: "900" }, codeResultCode: { backgroundColor: palette.amberWash }, abbreviationResultCode: { backgroundColor: palette.greenWash }, abbreviationRow: { minHeight: 44, flexDirection: "row", gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: palette.line }, abbreviation: { width: 70, color: palette.primary, fontWeight: "900", fontSize: 13 },
  doseCard: { backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line, borderRadius: radii.md, padding: spacing.lg, marginTop: spacing.lg, marginBottom: spacing.xl }, doseHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.md }, doseTitle: { color: palette.ink, fontSize: 16, fontWeight: "800" }, doseLabel: { color: palette.inkMuted, fontSize: 13, fontWeight: "600", letterSpacing: -0.08, marginTop: spacing.md, marginBottom: spacing.sm }, doseChoiceRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.sm }, doseChoice: { flex: 1, minWidth: 120, minHeight: 44, borderRadius: radii.sm, paddingVertical: 10, paddingHorizontal: spacing.sm, backgroundColor: palette.surfaceMuted, alignItems: "center", justifyContent: "center" }, doseChoiceActive: { backgroundColor: palette.ink }, doseChoiceText: { color: palette.inkMuted, fontSize: 11, fontWeight: "800", textAlign: "center" }, doseChoiceTextActive: { color: palette.paper }, doseInputRow: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: palette.lineStrong, borderRadius: radii.sm, backgroundColor: palette.paper, minHeight: 48, paddingHorizontal: spacing.md }, doseInput: { flex: 1, color: palette.ink, fontSize: 17, paddingVertical: 8 }, doseInputStandalone: { borderWidth: 1, borderColor: palette.lineStrong, borderRadius: radii.sm, backgroundColor: palette.paper, minHeight: 48, paddingHorizontal: spacing.md, color: palette.ink, fontSize: 16, marginBottom: spacing.sm }, doseUnit: { color: palette.inkMuted, fontWeight: "800", fontSize: 12 }, doseUnitChoice: { minHeight: 44, borderRadius: radii.pill, paddingVertical: 7, paddingHorizontal: 11, backgroundColor: palette.surfaceMuted, justifyContent: "center" }, doseUnitChoiceActive: { backgroundColor: palette.ink }, doseUnitChoiceText: { color: palette.inkMuted, fontSize: 11, fontWeight: "800" }, doseUnitChoiceTextActive: { color: palette.paper }, doseCheckRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 44 }, doseCheckText: { color: palette.ink, fontSize: 12, lineHeight: 17, flex: 1 }, doseCalculateButton: { backgroundColor: palette.primaryAction, borderRadius: radii.md, padding: spacing.md, alignItems: "center", marginTop: spacing.md }, doseAudit: { marginTop: spacing.md }, doseResult: { backgroundColor: palette.greenWash, borderRadius: radii.sm, padding: spacing.md, marginTop: spacing.md }, doseResultLabel: { color: palette.green, fontSize: 13, fontWeight: "600", letterSpacing: -0.08 }, doseResultValue: { color: palette.ink, fontSize: 27, fontWeight: "900", marginVertical: 3 }, doseResultDetail: { color: palette.inkMuted, fontSize: 11, lineHeight: 16 }, doseWarning: { color: palette.ink, fontSize: 11, lineHeight: 16, marginTop: spacing.sm }, doseError: { flexDirection: "row", gap: spacing.sm, backgroundColor: palette.dangerWash, borderRadius: radii.sm, padding: spacing.md, marginTop: spacing.md }, doseErrorText: { color: palette.dangerDark, flex: 1, fontSize: 12, lineHeight: 17 }, doseUnavailable: { color: palette.ink, fontSize: 13, lineHeight: 18 }, doseDisclaimer: { color: palette.inkMuted, fontSize: 10, lineHeight: 15, marginTop: spacing.md },
  modal: { flex: 1, backgroundColor: palette.paper, padding: spacing.lg }, modalContent: { paddingBottom: spacing.xxl }, modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.xl }, modalTitle: { color: palette.ink, fontSize: 24, fontWeight: "800" }, modalClose: { color: palette.primary, fontWeight: "800", padding: spacing.sm }, settingsSectionTitle: { color: palette.ink, fontSize: 17, fontWeight: "800", marginTop: spacing.lg, marginBottom: spacing.sm }, settingsCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: palette.surface, borderColor: palette.line, borderWidth: 1, borderRadius: radii.md, padding: spacing.lg, marginBottom: spacing.sm }, recoveryActions: { backgroundColor: palette.amberWash, borderRadius: radii.md, padding: spacing.md, marginTop: spacing.sm }, recoveryButtons: { flexDirection: "row", gap: spacing.sm }, recoveryButton: { marginTop: spacing.sm, backgroundColor: palette.ink, borderRadius: radii.sm, paddingVertical: 10, paddingHorizontal: spacing.lg }, recoveryButtonText: { color: palette.paper, fontSize: 12, fontWeight: "800" }, recoveryButtonSecondary: { marginTop: spacing.sm, borderColor: palette.lineStrong, borderWidth: 1, borderRadius: radii.sm, paddingVertical: 10, paddingHorizontal: spacing.lg }, recoveryButtonSecondaryText: { color: palette.ink, fontSize: 12, fontWeight: "800" }, primaryButton: { backgroundColor: palette.primaryAction, borderRadius: radii.md, padding: spacing.lg, alignItems: "center", marginTop: spacing.md }, secondaryButton: { borderColor: palette.lineStrong, borderWidth: 1, borderRadius: radii.md, padding: spacing.lg, alignItems: "center", marginTop: spacing.sm }, secondaryButtonText: { color: palette.ink, fontWeight: "800", fontSize: 14 }, locationDetailBlock: { backgroundColor: palette.surfaceMuted, borderRadius: radii.md, padding: spacing.md, marginTop: spacing.lg }, disabledButton: { opacity: 0.55 }, primaryButtonText: { color: palette.white, fontWeight: "800", fontSize: 14 }, appearanceControl: { flexDirection: "row", backgroundColor: palette.surfaceMuted, borderRadius: radii.md, padding: 4, gap: 4 }, appearanceControlStacked: { flexDirection: "column" }, appearanceOption: { flex: 1, minHeight: 45, borderRadius: radii.sm, alignItems: "center", justifyContent: "center", gap: 3 }, appearanceOptionActive: { backgroundColor: palette.ink }, appearanceText: { color: palette.inkMuted, fontSize: 11, fontWeight: "800" }, appearanceTextActive: { color: palette.paper }, infoPanel: { backgroundColor: palette.dangerWash, padding: spacing.lg, borderRadius: radii.md }, infoPanelTitle: { color: palette.dangerDark, fontWeight: "900", fontSize: 14, marginBottom: spacing.sm }, infoPanelText: { color: palette.dangerDark, fontSize: 13, lineHeight: 19 }, linkRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: spacing.lg, borderBottomWidth: 1, borderBottomColor: palette.line }, linkText: { color: palette.primary, fontSize: 13, fontWeight: "800" }, legalText: { color: palette.inkMuted, fontSize: 11, lineHeight: 16, marginTop: spacing.lg }, modalBackdrop: { flex: 1, backgroundColor: "rgba(19,35,61,0.35)", justifyContent: "flex-end" }, locationSheet: { backgroundColor: palette.paper, padding: spacing.xl, borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg }, sheetHandle: { width: 42, height: 5, borderRadius: 3, backgroundColor: palette.line, alignSelf: "center", marginBottom: spacing.xl }, sheetTitle: { color: palette.ink, fontSize: 24, lineHeight: 28, fontWeight: "800", marginBottom: spacing.sm },
  launchScreen: { flex: 1, backgroundColor: palette.ink, alignItems: "center", justifyContent: "center" }, launchTitle: { color: palette.white, ...typography.title1, textAlign: "center", marginTop: spacing.lg, paddingHorizontal: spacing.xl }, disclosureScreen: { flex: 1, backgroundColor: palette.paper, padding: spacing.lg, justifyContent: "space-between" }, disclosureContent: { alignItems: "flex-start", paddingTop: spacing.xxl }, disclosureEyebrow: { color: palette.primary, fontSize: 10, fontWeight: "900", letterSpacing: 1.3, marginTop: spacing.xxl, marginBottom: spacing.md }, disclosureTitle: { color: palette.ink, fontSize: 30, lineHeight: 35, fontWeight: "900", letterSpacing: -0.8, marginBottom: spacing.lg }, disclosureBody: { color: palette.ink, fontSize: 16, lineHeight: 23, marginBottom: spacing.md }, disclosureFooter: { color: palette.inkMuted, fontSize: 11, lineHeight: 16, textAlign: "center", marginTop: spacing.md, marginBottom: spacing.sm },
  // The default JS-drawn tab bar styles (tabBar/tabBarTablet/tabLabel/…) were removed here:
  // MainTabs now supplies a custom `tabBar` (GlassTabBar, src/nav-shell.tsx) so the system
  // can render real Liquid Glass, which `@react-navigation/bottom-tabs` can never draw itself.
  } as const;
}

import { MaterialCommunityIcons } from "@expo/vector-icons";
import { NavigationContainer, type NavigatorScreenParams } from "@react-navigation/native";
import { createBottomTabNavigator, type BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator, type NativeStackScreenProps } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import * as ExpoLocation from "expo-location";
import React, { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  DynamicColorIOS,
  FlatList,
  findNodeHandle,
  Linking,
  Modal,
  Platform,
  Pressable as NativePressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
  useWindowDimensions,
  type DimensionValue,
  type PressableProps,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { colors, radii, spacing } from "@manual-samur/design-tokens";
import { ContentProvider, findProcedure, useContent, type SyncProgress, type SyncState } from "./src/content";
import { contentFreshness, type ContentFreshness } from "./src/content-transaction";
import type { StagedPackage } from "./src/content-transaction";
import { PreferencesProvider, usePreferences, type AppearancePreference } from "./src/preferences";
import type { MobileProcedure } from "./src/data/schema";
import { procedureHeadings, procedureRouteKey, readingPositions, searchProcedures, splitProcedureSections, type ProcedureSection } from "./src/procedure-logic";
import { relatedProcedureIdsForDrug, resolveCodeReference, resolveVademecumReference, searchAbbreviations, searchCodes, searchVademecum, type MobileReferenceSearchResult } from "./src/reference-search-logic";
import { calculateDoseConversion, doseUtilityEligibility, type DoseOperation, type DoseConversionResult } from "./src/dose-logic";
import { attachmentStatusLabel, isLocallyAvailable, type AttachmentRecord } from "./src/attachment-logic";
import { downloadOptionalAttachment, readAttachmentRecord, reconcileAttachmentRecord } from "./src/attachment-runtime";
import {
  filterLocations,
  locationFavoriteId,
  locationFreshnessLabel,
  locationRecords,
  locationRouteKey,
  locationSourcePolicy,
  platformMapsUrl,
  resolveLocationRoute,
  schematicNodes,
  sortLocationsByDistance,
  type LocationCoordinate,
  type LocationFilter,
  type LocationRecord,
} from "./src/location-logic";
import { initialOnlineMapState, onlineMapFallbackLabel } from "./src/online-map-logic";
import {
  canRecordRecent,
  savedReferenceIcon,
  selectSavedReferences,
  type ResolvedSavedReference,
  type SavedReference,
} from "./src/saved-logic";
import { accessibilityHints, accessibilityTargetStyle, adaptiveLayout, resolveAdaptivePalette, routeAccessibilityLabels } from "./src/accessibility";

type TabsParamList = {
  Inicio: undefined;
  Buscar: undefined;
  Guardados: undefined;
  Mapa: undefined;
};

type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabsParamList> | undefined;
  Procedure: { id: string };
  Drug: { id: string };
  Vademecum: { routeKey: string };
  Code: { routeKey: string };
  Codes: { query?: string } | undefined;
  Abbreviations: { query?: string } | undefined;
  Location: { routeKey: string };
};

const Tabs = createBottomTabNavigator<TabsParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();
let activePalette: ReturnType<typeof resolveAdaptivePalette> = resolveAdaptivePalette("light");

const nativeTheme = Platform.OS === "ios" ? {
  paper: DynamicColorIOS({ light: "#F7F8FA", dark: "#101827" }),
  surface: DynamicColorIOS({ light: "#FFFFFF", dark: "#172235" }),
  surfaceMuted: DynamicColorIOS({ light: "#EEF1F5", dark: "#223149" }),
  ink: DynamicColorIOS({ light: "#13233D", dark: "#F5F7FB" }),
  inkMuted: DynamicColorIOS({ light: "#52627A", dark: "#C1CCDC" }),
  line: DynamicColorIOS({ light: "#C9D2DE", dark: "#46556B" }),
  red: DynamicColorIOS({ light: "#B51F2A", dark: "#FF8A91" }),
  redWash: DynamicColorIOS({ light: "#FCEBED", dark: "#4A202B" }),
  amber: DynamicColorIOS({ light: "#8A5200", dark: "#FFD18A" }),
  amberWash: DynamicColorIOS({ light: "#FFF1D6", dark: "#49391F" }),
  green: DynamicColorIOS({ light: "#12633F", dark: "#7BE2B0" }),
  greenWash: DynamicColorIOS({ light: "#E4F3EB", dark: "#1D4032" }),
} : undefined;

function useReduceMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);
  return reduceMotion;
}

/** Keep every action reachable at the platform minimum, including icon-only controls. */
const Pressable = forwardRef<View, PressableProps>(function AccessiblePressable({ style, ...props }, ref) {
  return <NativePressable ref={ref} {...props} style={(state) => [typeof style === "function" ? style(state) : style, styles.minimumTarget]} />;
});

function LogoMark({ small = false }: { small?: boolean }) {
  return (
    <View style={[styles.logoMark, small && styles.logoMarkSmall]} accessible accessibilityLabel="Pulso abierto">
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
  return (
    <View style={styles.brandHeader}>
      <View style={styles.brandLockup}>
        <LogoMark small />
        <View>
          <Text style={styles.brandName}>Pulso abierto</Text>
          <Text style={styles.brandSubline}>MANUALSAMUR · REFERENCIA</Text>
        </View>
      </View>
      {onSettings && (
        <Pressable ref={settingsRef} onPress={onSettings} style={styles.iconButton} accessibilityRole="button" accessibilityLabel={routeAccessibilityLabels.Ajustes} accessibilityHint="Abre las preferencias, privacidad y estado del contenido.">
          <MaterialCommunityIcons name="tune-variant" size={21} color={activePalette.ink} />
        </Pressable>
      )}
    </View>
  );
}

function SearchBar({ value, onChangeText, onPress }: { value?: string; onChangeText?: (value: string) => void; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.searchBar} accessible={!onChangeText} accessibilityRole={onChangeText ? "none" : "button"} accessibilityLabel={routeAccessibilityLabels.Buscar} accessibilityHint={onChangeText ? accessibilityHints.search : accessibilityHints.openDetail}>
      <MaterialCommunityIcons name="magnify" size={22} color={activePalette.inkMuted} />
      {onChangeText ? <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder="Buscar procedimientos, fármacos o códigos"
          placeholderTextColor={activePalette.inkMuted}
          style={styles.searchInput}
          returnKeyType="search"
          accessibilityLabel="Campo de búsqueda del manual"
          accessibilityHint={accessibilityHints.search}
        /> : <Text style={styles.searchPlaceholder}>Buscar procedimientos, fármacos o códigos</Text>}
      <View style={styles.offlineDot} />
    </Pressable>
  );
}

function SectionHeading({ eyebrow, title, action, onAction }: { eyebrow?: string; title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.sectionHeading}>
      <View>
        {eyebrow && <Text style={styles.eyebrow}>{eyebrow}</Text>}
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {action && <Pressable onPress={onAction} style={styles.minimumTarget} accessibilityRole="button" accessibilityLabel={action} accessibilityHint={accessibilityHints.openDetail}><Text style={styles.sectionAction}>{action}</Text></Pressable>}
    </View>
  );
}

function ActionCard({ icon, label, detail, tone = "red", onPress, fullWidth = false }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; detail: string; tone?: "red" | "navy" | "amber" | "green"; onPress: () => void; fullWidth?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.actionCard, fullWidth && styles.actionCardSingle, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={label} accessibilityValue={{ text: detail }} accessibilityHint={accessibilityHints.openDetail}>
      <View style={[styles.actionIcon, tone === "navy" && styles.actionIconNavy, tone === "amber" && styles.actionIconAmber, tone === "green" && styles.actionIconGreen]}>
        <MaterialCommunityIcons name={icon} size={22} color={tone === "red" ? activePalette.red : tone === "navy" ? activePalette.ink : tone === "amber" ? activePalette.amber : activePalette.green} />
      </View>
      <Text style={styles.actionLabel}>{label}</Text>
      <Text style={styles.actionDetail}>{detail}</Text>
    </Pressable>
  );
}

function ProcedureRow({ procedure, onPress, showFavorite = false }: { procedure: MobileProcedure; onPress: () => void; showFavorite?: boolean }) {
  const { favorites, toggleFavorite } = useContent();
  const routeKey = procedureRouteKey(procedure);
  const favorite = favorites.includes(routeKey);
  return (
    <View style={styles.resourceRow}>
      <Pressable onPress={onPress} style={({ pressed }) => [styles.resourceRowMain, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={`${procedure.id}, ${procedure.title}`} accessibilityHint={accessibilityHints.openDetail}>
        <View style={styles.resourceCode}><Text style={styles.resourceCodeText}>{procedure.id}</Text></View>
        <View style={styles.resourceCopy}>
          <Text style={styles.resourceTitle}>{procedure.title}</Text>
          <Text style={styles.resourceMeta}>{procedure.section} · {procedure.attachments.length ? `${procedure.attachments.length} anexos` : "consulta offline"}</Text>
        </View>
      </Pressable>
      {showFavorite && <Pressable onPress={() => toggleFavorite(routeKey)} hitSlop={12} style={styles.minimumTarget} accessibilityRole="button" accessibilityLabel={favorite ? "Quitar de guardados" : "Guardar procedimiento"} accessibilityHint={accessibilityHints.toggleFavorite} accessibilityState={{ selected: favorite }}>
        <MaterialCommunityIcons name={favorite ? "star" : "star-outline"} size={22} color={favorite ? activePalette.amber : activePalette.inkMuted} />
      </Pressable>}
      <MaterialCommunityIcons name="chevron-right" size={20} color={activePalette.inkMuted} accessibilityElementsHidden />
    </View>
  );
}

type SyncPresentation = { title: string; detail: string; icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"]; color: string };

function syncPresentation(state: ReturnType<typeof useContent>["syncState"], freshness: ContentFreshness, progress: ReturnType<typeof useContent>["syncProgress"], stagedHash?: string): SyncPresentation {
  const progressText = progress.totalBytes && progress.downloadedBytes !== undefined
    ? `${Math.round((progress.downloadedBytes / progress.totalBytes) * 100)}% en curso`
    : "paquete verificado";
  if (state === "checking" || state === "downloading" || state === "validating" || state === "activating") return { title: "Actualizando contenido", detail: progressText, icon: "cloud-sync-outline", color: activePalette.green };
  if (state === "success") return { title: "Contenido actualizado", detail: "última activación correcta", icon: "cloud-check-outline", color: activePalette.green };
  if (state === "failure") return { title: "Actualización no aplicada", detail: stagedHash ? "paquete pendiente; contenido anterior intacto" : "contenido anterior intacto", icon: "cloud-alert-outline", color: activePalette.red };
  if (state === "recovery") return { title: "Actualización pendiente", detail: stagedHash ? `recuperable · ${stagedHash.slice(0, 8)}` : "recuperación disponible", icon: "history", color: activePalette.amber };
  if (state === "offline") return { title: "Modo offline", detail: "se mantiene el último contenido", icon: "cloud-off-outline", color: activePalette.amber };
  if (freshness !== "fresh" || state === "stale") return { title: "Contenido local desactualizado", detail: "revisa cuando tengas conexión", icon: "clock-alert-outline", color: activePalette.amber };
  return { title: "Contenido disponible offline", detail: "hash verificado", icon: "database-check-outline", color: activePalette.green };
}

function HomeScreen({ navigation }: BottomTabScreenProps<TabsParamList, "Inicio">) {
  const { content, recents, snapshot, isRefreshing, lastError, refresh, cancelRefresh, syncState, syncProgress, stagedPackage, resumeStaged, discardStaged } = useContent();
  const { width, fontScale } = useWindowDimensions();
  const layout = adaptiveLayout(width, fontScale);
  const settingsTriggerRef = useRef<View>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const recentProcedures = recents.map((id) => findProcedure(content, id)).filter((item): item is MobileProcedure => Boolean(item)).slice(0, 3);
  const manualVersion = typeof content.manual.manualVersionCurrent === "string" ? content.manual.manualVersionCurrent : "paquete local";
  const freshness = contentFreshness(snapshot.generatedAt);
  const syncCopy = syncPresentation(syncState, freshness, syncProgress, stagedPackage?.packageHash);

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <BrandHeader settingsRef={settingsTriggerRef} onSettings={() => setSettingsOpen(true)} />
        <View style={[styles.hero, layout.singleColumn && styles.heroStacked]}>
          <View style={styles.heroCopy}>
            <Text style={styles.heroEyebrow}>TODO A MANO · SIN COBERTURA</Text>
            <Text style={styles.heroTitle}>La referencia que{`\n`}te acompaña.</Text>
            <Text style={styles.heroBody}>Procedimientos, medicación y comunicaciones listos para consulta en guardia.</Text>
          </View>
          <LogoMark />
        </View>
        <SearchBar onPress={() => navigation.navigate("Buscar")} />

        <SectionHeading eyebrow="ACCESOS RÁPIDOS" title="Consulta por recurso" />
        <View style={[styles.actionGrid, layout.singleColumn && styles.actionGridSingle]}>
          <ActionCard icon="clipboard-text-outline" label="Procedimientos" detail={`${content.procedures.length} fichas`} fullWidth={layout.singleColumn} onPress={() => navigation.navigate("Buscar")} />
          <ActionCard icon="pill" label="Vademécum" detail={`${content.drugs.length} fármacos`} fullWidth={layout.singleColumn} tone="navy" onPress={() => navigation.navigate("Buscar")} />
          <ActionCard icon="radio-handheld" label="Códigos" detail="Radio y claves" fullWidth={layout.singleColumn} tone="amber" onPress={() => navigation.getParent()?.navigate("Codes")} />
        </View>

        {recentProcedures.length > 0 && <>
          <SectionHeading eyebrow="SESIÓN ACTUAL" title="Continuar consulta" action="Ver todo" onAction={() => navigation.navigate("Guardados")} />
          <View style={styles.cardList}>
            {recentProcedures.map((procedure) => <ProcedureRow key={procedure.id} procedure={procedure} onPress={() => navigation.getParent()?.navigate("Procedure", { id: procedure.id })} />)}
          </View>
        </>}

        <View style={styles.syncCard}>
          <View style={styles.syncIcon}><MaterialCommunityIcons name={syncCopy.icon} size={20} color={syncCopy.color} /></View>
          <View style={styles.syncCopy}>
            <Text style={[styles.syncTitle, { color: syncCopy.color }]}>{syncCopy.title}</Text>
            <Text style={styles.syncDetail}>{manualVersion} · rev {snapshot.packageHash?.slice(0, 10) ?? "—"} · {syncCopy.detail}</Text>
          </View>
          {isRefreshing ? <Pressable onPress={cancelRefresh} disabled={syncState === "activating"} style={styles.minimumTarget} accessibilityRole="button" accessibilityLabel={syncState === "activating" ? "Aplicando actualización" : "Cancelar actualización"} accessibilityState={{ busy: syncState === "activating" }}><Text style={styles.syncAction}>{syncState === "activating" ? "Aplicando…" : "Cancelar"}</Text></Pressable> : <Pressable onPress={() => void refresh()} style={styles.minimumTarget} accessibilityRole="button" accessibilityLabel="Actualizar contenido" accessibilityHint="Comprueba si hay un paquete local más reciente."><Text style={styles.syncAction}>Actualizar</Text></Pressable>}
        </View>
        <Text style={styles.disclaimer}>Pulso abierto es una adaptación independiente y no oficial. Consulta siempre la fuente operativa vigente.</Text>
      </ScrollView>
      <SettingsModal visible={settingsOpen} onClose={() => { setSettingsOpen(false); restoreAccessibilityFocus(settingsTriggerRef); }} onRefresh={refresh} onCancelRefresh={cancelRefresh} onResumeStaged={resumeStaged} onDiscardStaged={discardStaged} onOpenAbbreviations={() => { setSettingsOpen(false); navigation.getParent()?.navigate("Abbreviations"); }} generatedAt={snapshot.generatedAt} packageHash={snapshot.packageHash} isRefreshing={isRefreshing} lastError={lastError} syncState={syncState} syncProgress={syncProgress} stagedPackage={stagedPackage} />
    </SafeAreaView>
  );
}

function SearchScreen({ navigation }: BottomTabScreenProps<TabsParamList, "Buscar">) {
  const { content } = useContent();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"Todo" | "Procedimientos" | "Vademécum" | "Códigos">("Todo");
  const [vademecumCategory, setVademecumCategory] = useState<"Todos" | "Fármacos" | "Comerciales" | "Perfusiones" | "Fluidos">("Todos");
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
      <View style={styles.searchScreenHeader}><Text style={styles.pageTitle}>Buscar</Text><Text style={styles.pageKicker}>CONSULTA LOCAL</Text></View>
      <View style={styles.searchPadding}><SearchBar value={query} onChangeText={setQuery} /></View>
      <View style={styles.filterRow} accessibilityRole="tablist">
        {(["Todo", "Procedimientos", "Vademécum", "Códigos"] as const).map((item) => <Pressable key={item} onPress={() => setFilter(item)} style={[styles.filterChip, filter === item && styles.filterChipActive]} accessibilityRole="tab" accessibilityLabel={`Filtrar por ${item}`} accessibilityState={{ selected: filter === item }}><Text style={[styles.filterText, filter === item && styles.filterTextActive]}>{item}</Text></Pressable>)}
      </View>
      {(filter === "Todo" || filter === "Vademécum") && <View style={styles.filterRow} accessibilityRole="tablist">
        {(["Todos", "Fármacos", "Comerciales", "Perfusiones", "Fluidos"] as const).map((item) => <Pressable key={item} onPress={() => { setFilter("Vademécum"); setVademecumCategory(item); }} style={[styles.filterChip, vademecumCategory === item && filter === "Vademécum" && styles.filterChipActive]} accessibilityRole="tab" accessibilityLabel={`Filtrar vademécum por ${item}`} accessibilityState={{ selected: vademecumCategory === item && filter === "Vademécum" }}><Text style={[styles.filterText, vademecumCategory === item && filter === "Vademécum" && styles.filterTextActive]}>{item}</Text></Pressable>)}
      </View>}
      <FlatList
        data={rows}
        keyExtractor={(item, index) => `${item.kind}-${item.item.id}-${index}`}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={<EmptyState title={query.trim() ? "Sin coincidencias" : "Procedimientos no disponibles"} detail={query.trim() ? "Prueba con un código, un nombre, un sinónimo o una palabra del contenido." : "El paquete local no contiene procedimientos utilizables. Revisa una actualización cuando tengas conexión."} />}
        renderItem={({ item }) => item.kind === "procedure" ? <ProcedureRow procedure={item.item} showFavorite onPress={() => navigation.getParent()?.navigate("Procedure", { id: item.item.id })} /> : <ReferenceRow reference={item.item} onCode={(routeKey) => navigation.getParent()?.navigate("Code", { routeKey })} onVademecum={(routeKey) => navigation.getParent()?.navigate("Vademecum", { routeKey })} onDrug={(id) => navigation.getParent()?.navigate("Drug", { id })} />}
      />
    </SafeAreaView>
  );
}

function ReferenceRow({ reference, onCode, onVademecum, onDrug }: { reference: MobileReferenceSearchResult; onCode: (routeKey: string) => void; onVademecum: (routeKey: string) => void; onDrug: (id: string) => void }) {
  const { favorites, toggleFavorite } = useContent();
  const icon = reference.kind === "code" ? "radio-handheld" : reference.kind === "abbreviation" ? "format-letter-case" : "pill";
  const targetId = reference.targetId;
  const onPress = reference.kind === "code" ? () => onCode(reference.routeKey) : reference.kind === "drug" && targetId ? () => onDrug(targetId) : () => onVademecum(reference.routeKey);
  const favorite = favorites.includes(reference.routeKey);
  const supportsFavorites = reference.kind !== "abbreviation";
  return <View style={styles.resourceRow}>
    <Pressable onPress={onPress} style={({ pressed }) => [styles.resourceRowMain, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={`${reference.title}. ${reference.subtitle}`} accessibilityHint={accessibilityHints.openDetail}>
    <View style={[styles.resourceCode, reference.kind === "code" ? styles.codeResultCode : reference.kind === "abbreviation" ? styles.abbreviationResultCode : styles.drugCode]}><MaterialCommunityIcons name={icon} size={17} color={activePalette.ink} /></View>
    <View style={styles.resourceCopy}><Text style={styles.resourceTitle}>{reference.title}</Text><Text style={styles.resourceMeta}>{reference.badge ? `${reference.badge} · ` : ""}{reference.subtitle}</Text></View>
    </Pressable>
    {supportsFavorites && <Pressable onPress={() => toggleFavorite(reference.routeKey)} hitSlop={12} style={styles.minimumTarget} accessibilityRole="button" accessibilityLabel={favorite ? "Quitar de guardados" : "Guardar en guardados"} accessibilityHint={accessibilityHints.toggleFavorite} accessibilityState={{ selected: favorite }}><MaterialCommunityIcons name={favorite ? "star" : "star-outline"} size={21} color={favorite ? activePalette.amber : activePalette.inkMuted} /></Pressable>}
    <MaterialCommunityIcons name="chevron-right" size={20} color={activePalette.inkMuted} accessibilityElementsHidden />
  </View>;
}

function DrugRow({ drug, onPress }: { drug: Record<string, unknown>; onPress: () => void }) {
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.resourceRow, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={`Fármaco ${String(drug.name ?? "sin nombre")}`} accessibilityHint={accessibilityHints.openDetail}>
    <View style={[styles.resourceCode, styles.drugCode]}><MaterialCommunityIcons name="pill" size={17} color={activePalette.ink} /></View>
    <View style={styles.resourceCopy}><Text style={styles.resourceTitle}>{String(drug.name ?? "Fármaco")}</Text><Text style={styles.resourceMeta}>{String(drug.category ?? "Vademécum")} · {String(drug.presentation ?? "")}</Text></View>
    <MaterialCommunityIcons name="chevron-right" size={20} color={activePalette.inkMuted} />
  </Pressable>;
}

function SavedRow({ item, isFavorite, onPress, onToggleFavorite, onRemove }: { item: ResolvedSavedReference; isFavorite: boolean; onPress?: () => void; onToggleFavorite: () => void; onRemove?: () => void }) {
  const stale = item.kind === "stale";
  const body = <><View style={[styles.resourceCode, stale ? styles.staleResourceCode : item.kind === "drug" || item.kind === "perfusion" || item.kind === "fluid" || item.kind === "commercialName" ? styles.drugCode : item.kind === "code" ? styles.codeResultCode : item.kind === "hospital" ? styles.locationIcon : item.kind === "base" ? styles.locationIconBase : undefined]}><MaterialCommunityIcons name={savedReferenceIcon(item.kind)} size={18} color={stale ? activePalette.red : activePalette.ink} /></View>
    <View style={styles.resourceCopy}><Text style={styles.resourceTitle}>{item.title}</Text><Text style={styles.resourceMeta}>{item.subtitle}</Text>{stale && <Text style={styles.staleResourceText}>Paquete local actualizado: revisa esta referencia o elimínala.</Text>}</View></>;
  const row = <View style={styles.resourceRow} accessible={false}>
    {onPress && !stale ? <Pressable onPress={onPress} style={({ pressed }) => [styles.resourceRowMain, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={`${item.title}. ${item.subtitle}`} accessibilityHint={accessibilityHints.openDetail}>{body}</Pressable> : body}
    {!stale && <Pressable onPress={onToggleFavorite} hitSlop={12} style={styles.minimumTarget} accessibilityRole="button" accessibilityLabel={isFavorite ? "Quitar de guardados" : "Guardar en guardados"} accessibilityHint={accessibilityHints.toggleFavorite} accessibilityState={{ selected: isFavorite }}><MaterialCommunityIcons name={isFavorite ? "star" : "star-outline"} size={21} color={isFavorite ? activePalette.amber : activePalette.inkMuted} /></Pressable>}
    {stale && onRemove && <Pressable onPress={onRemove} hitSlop={12} style={styles.minimumTarget} accessibilityRole="button" accessibilityLabel="Quitar referencia no disponible" accessibilityHint="Elimina esta referencia antigua del historial."><MaterialCommunityIcons name="trash-can-outline" size={20} color={activePalette.red} /></Pressable>}
    {!stale && <MaterialCommunityIcons name="chevron-right" size={20} color={activePalette.inkMuted} accessibilityElementsHidden />}
  </View>;
  return row;
}

function openSavedReference(navigation: BottomTabScreenProps<TabsParamList, "Guardados">["navigation"], item: SavedReference) {
  if (item.kind === "procedure") navigation.getParent()?.navigate("Procedure", { id: item.id });
  else if (item.kind === "drug") navigation.getParent()?.navigate("Drug", { id: item.id });
  else if (item.kind === "code") navigation.getParent()?.navigate("Code", { routeKey: item.routeKey });
  else if (item.kind === "hospital" || item.kind === "base") navigation.getParent()?.navigate("Location", { routeKey: item.routeKey });
  else navigation.getParent()?.navigate("Vademecum", { routeKey: item.routeKey });
}

function SavedScreen({ navigation }: BottomTabScreenProps<TabsParamList, "Guardados">) {
  const { content, favorites, recents, toggleFavorite, removeRecent } = useContent();
  const [segment, setSegment] = useState<"favorites" | "recents">("favorites");
  const routeKeys = segment === "favorites" ? favorites : recents;
  const items = selectSavedReferences(content, routeKeys);
  return <SafeAreaView style={styles.screen} edges={["top"]}><ScrollView contentContainerStyle={styles.scrollContent}>
    <View style={styles.searchScreenHeader}><Text style={styles.pageTitle}>Guardados</Text><Text style={styles.pageKicker}>TU TURNO · SOLO EN ESTE DISPOSITIVO</Text></View>
    <View style={styles.filterRow} accessibilityRole="tablist">
      <Pressable onPress={() => setSegment("favorites")} style={[styles.filterChip, segment === "favorites" && styles.filterChipActive]} accessibilityRole="tab" accessibilityLabel="Favoritos" accessibilityState={{ selected: segment === "favorites" }}><Text style={[styles.filterText, segment === "favorites" && styles.filterTextActive]}>Favoritos</Text></Pressable>
      <Pressable onPress={() => setSegment("recents")} style={[styles.filterChip, segment === "recents" && styles.filterChipActive]} accessibilityRole="tab" accessibilityLabel="Recientes" accessibilityState={{ selected: segment === "recents" }}><Text style={[styles.filterText, segment === "recents" && styles.filterTextActive]}>Recientes</Text></Pressable>
    </View>
    <SectionHeading eyebrow={segment === "favorites" ? "ACCESO DIRECTO" : "HISTORIAL LOCAL"} title={segment === "favorites" ? "Favoritos" : "Recientes"} />
    {items.length ? <View style={styles.cardList}>{items.map((item) => <SavedRow key={item.routeKey} item={item} isFavorite={favorites.includes(item.routeKey)} onToggleFavorite={() => toggleFavorite(item.routeKey)} onRemove={segment === "favorites" ? () => toggleFavorite(item.routeKey) : () => removeRecent(item.routeKey)} onPress={item.kind === "stale" ? undefined : () => openSavedReference(navigation, item)} />)}</View> : <EmptyState title={segment === "favorites" ? "Aún no hay favoritos" : "Sin historial"} detail={segment === "favorites" ? "Guarda una ficha con la estrella para encontrarla aquí." : "Las fichas que consultes aparecerán aquí después de abrirlas."} />}
    <Text style={styles.disclaimer}>Tus favoritos y recientes permanecen en este dispositivo. No se sincronizan con una cuenta.</Text>
  </ScrollView></SafeAreaView>;
}


type LocationWithDistance = LocationRecord & { distanceMeters?: number };

function formatDistance(distanceMeters?: number): string | undefined {
  if (distanceMeters === undefined) return undefined;
  return distanceMeters < 1000 ? String(Math.round(distanceMeters)) + " m en línea recta" : (distanceMeters / 1000).toFixed(1) + " km en línea recta";
}

function mapPercent(value: number): DimensionValue {
  return (String(value) + "%") as DimensionValue;
}

function MapScreen({ navigation }: BottomTabScreenProps<TabsParamList, "Mapa">) {
  const { content } = useContent();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<LocationFilter>("all");
  const [nearestKind, setNearestKind] = useState<"hospital" | "base">("hospital");
  const [origin, setOrigin] = useState<LocationCoordinate>();
  const [permission, setPermission] = useState<"idle" | "requesting" | "granted" | "denied" | "unavailable">("idle");
  const policy = locationSourcePolicy;
  const onlineMapState = useMemo(() => initialOnlineMapState(), []);
  const locations = useMemo(() => locationRecords(content, policy), [content, policy]);
  const visibleLocations = useMemo(() => {
    const filtered = filterLocations(locations, query, filter);
    return origin ? sortLocationsByDistance(filtered, origin) : filtered as LocationWithDistance[];
  }, [filter, locations, origin, query]);
  const activeNearestKind = filter === "all" ? nearestKind : filter;
  const nearestLocations = useMemo(() => sortLocationsByDistance(filterLocations(locations, query, activeNearestKind), origin), [activeNearestKind, locations, origin, query]);
  const displayLocations = origin ? nearestLocations : visibleLocations;
  const schematic = useMemo(() => schematicNodes(displayLocations), [displayLocations]);

  const requestLocation = async () => {
    if (permission === "requesting") return;
    setPermission("requesting");
    try {
      const response = await ExpoLocation.requestForegroundPermissionsAsync();
      if (response.status !== ExpoLocation.PermissionStatus.GRANTED) {
        setOrigin(undefined);
        setPermission("denied");
        return;
      }
      const position = await ExpoLocation.getCurrentPositionAsync({ accuracy: ExpoLocation.Accuracy.Low });
      setOrigin({ lat: position.coords.latitude, lng: position.coords.longitude });
      setPermission("granted");
    } catch {
      setOrigin(undefined);
      setPermission("unavailable");
    }
  };

  return <SafeAreaView style={styles.screen} edges={["top"]}><ScrollView contentContainerStyle={styles.scrollContent}>
    <View style={styles.searchScreenHeader}><Text style={styles.pageTitle}>Mapa</Text><Text style={styles.pageKicker}>MADRID · OFFLINE</Text></View>
    <View style={styles.locationPolicyNotice} accessibilityLabel="Estado de la fuente de ubicaciones"><MaterialCommunityIcons name="check-decagram-outline" size={20} color={activePalette.green} /><Text style={styles.sourceNoticeText}>Fuente oficial del SAMUR · paquete del {policy.sourceDate}. El directorio funciona sin red.</Text></View>
    {onlineMapState.status === "disabled" && <View style={styles.onlineMapDisabled} accessibilityLiveRegion="polite" accessibilityLabel="Mapa online desactivado"><MaterialCommunityIcons name="map-marker-off-outline" size={20} color={activePalette.amber} /><View style={styles.resourceCopy}><Text style={styles.onlineMapDisabledTitle}>Mapa online no habilitado</Text><Text style={styles.onlineMapDisabledCopy}>La cartografía online está desactivada hasta aprobar proveedor, licencia, alcance offline, OS floor y presupuesto de tamaño. El directorio y el esquema accesible siguen disponibles.</Text></View></View>}
    {onlineMapState.status === "fallback" && <View style={styles.locationFallback} accessibilityLiveRegion="polite"><MaterialCommunityIcons name="map-marker-path" size={20} color={activePalette.amber} /><Text style={styles.locationFallbackText}>{onlineMapFallbackLabel(onlineMapState.reason)}</Text></View>}
    <View style={styles.searchPadding}><SearchBar value={query} onChangeText={setQuery} /></View>
    <View style={styles.filterRow} accessibilityRole="tablist">
      {(["all", "hospital", "base"] as const).map((item) => <Pressable key={item} onPress={() => setFilter(item)} style={[styles.filterChip, filter === item && styles.filterChipActive]} accessibilityRole="tab" accessibilityLabel={`Filtrar por ${item === "all" ? "todos" : item === "hospital" ? "hospitales" : "bases"}`} accessibilityState={{ selected: filter === item }}><Text style={[styles.filterText, filter === item && styles.filterTextActive]}>{item === "all" ? "Todos" : item === "hospital" ? "Hospitales" : "Bases"}</Text></Pressable>)}
    </View>
    <View style={styles.locationActions}>
      <Pressable onPress={() => void requestLocation()} disabled={permission === "requesting"} style={styles.locationActionButton} accessibilityRole="button" accessibilityLabel="Usar mi ubicación para ordenar lugares cercanos" accessibilityHint="Solicita permiso de ubicación solo después de activar esta acción." accessibilityState={{ busy: permission === "requesting" }}><MaterialCommunityIcons name="crosshairs-gps" size={18} color={activePalette.white} /><Text style={styles.locationActionText}>{permission === "requesting" ? "Solicitando…" : "Usar mi ubicación"}</Text></Pressable>
      {origin && filter === "all" && <View style={styles.nearestToggle} accessibilityRole="radiogroup" accessibilityLabel="Tipo de punto para ordenar por cercanía">{(["hospital", "base"] as const).map((item) => <Pressable key={item} onPress={() => setNearestKind(item)} style={[styles.nearestChoice, nearestKind === item && styles.nearestChoiceActive]} accessibilityRole="radio" accessibilityLabel={item === "hospital" ? "Hospitales cercanos" : "Bases cercanas"} accessibilityState={{ selected: nearestKind === item }}><Text style={[styles.nearestChoiceText, nearestKind === item && styles.nearestChoiceTextActive]}>{item === "hospital" ? "Hospitales cercanos" : "Bases cercanas"}</Text></Pressable>)}</View>}
    </View>
    {permission === "denied" && <View style={styles.locationFallback} accessibilityLiveRegion="polite"><MaterialCommunityIcons name="map-marker-off-outline" size={20} color={activePalette.amber} /><Text style={styles.locationFallbackText}>Permiso de ubicación denegado. El directorio y la Vista accesible siguen disponibles; puedes abrir un punto en Mapas.</Text></View>}
    {permission === "unavailable" && <View style={styles.locationFallback}><MaterialCommunityIcons name="crosshairs-off" size={20} color={activePalette.amber} /><Text style={styles.locationFallbackText}>La ubicación no está disponible en este dispositivo. El directorio local no necesita permiso.</Text></View>}
    <View style={styles.mapLegend}><View style={styles.mapLegendDot} /><Text style={styles.mapLegendText}>Esquema local · sin cartografía, rutas ni tiempos de viaje</Text></View>
    <View style={styles.schematicMap} accessible={false} accessibilityLabel={"Esquema offline con " + schematic.length + " puntos; consulta también la Vista accesible"}>
      <View style={styles.mapRoadOne} /><View style={styles.mapRoadTwo} /><View style={styles.mapRoadThree} />
      {schematic.map((item, index) => <Pressable key={item.kind + "-" + item.id} onPress={() => navigation.getParent()?.navigate("Location", { routeKey: locationRouteKey(item) })} style={[styles.mapPin, item.kind === "hospital" ? styles.mapPinRed : styles.mapPinNavy, { left: mapPercent(8 + ((index * 31) % 82)), top: mapPercent(10 + ((index * 47) % 75)) }]} accessibilityRole="button" accessibilityLabel={(item.kind === "hospital" ? "Hospital " : "Base ") + item.name} accessibilityHint={accessibilityHints.openDetail}><MaterialCommunityIcons name={item.kind === "hospital" ? "hospital-building" : "ambulance"} size={13} color={activePalette.white} /></Pressable>)}
      <View style={styles.mapCompass}><Text style={styles.mapCompassN}>N</Text><MaterialCommunityIcons name="navigation" size={18} color={activePalette.red} /></View>
    </View>
    <SectionHeading eyebrow={String(displayLocations.length) + " PUNTOS LOCALES"} title={origin ? (activeNearestKind === "hospital" ? "Hospitales más cercanos" : "Bases más cercanas") : "Bases y hospitales"} />
    <View style={styles.accessibleEquivalent} accessible accessibilityLabel="Vista accesible del esquema y directorio"><Text style={styles.accessibleEquivalentTitle}>Vista accesible</Text><Text style={styles.accessibleEquivalentCopy}>La lista siguiente contiene los mismos puntos, nombres, direcciones, identificadores y fechas que el esquema.</Text></View>
    <View style={styles.cardList}>{displayLocations.map((item) => <Pressable key={item.kind + "-" + item.id} onPress={() => navigation.getParent()?.navigate("Location", { routeKey: locationRouteKey(item) })} style={styles.locationRow} accessibilityRole="button" accessibilityLabel={(item.kind === "hospital" ? "Hospital " : "Base ") + item.name + ". " + item.address + ", " + item.district + ". " + locationFreshnessLabel(item, new Date(), policy) + (formatDistance(item.distanceMeters) ? ". " + formatDistance(item.distanceMeters) : "")}><View style={[styles.locationIcon, item.kind === "base" && styles.locationIconBase]}><MaterialCommunityIcons name={item.kind === "hospital" ? "hospital-building" : "ambulance"} size={18} color={activePalette.ink} /></View><View style={styles.resourceCopy}><Text style={styles.resourceTitle}>{item.shortName}</Text><Text style={styles.resourceMeta}>{item.kind === "hospital" ? "Hospital" : "Base"} · {item.district} · {item.id}</Text><Text style={styles.locationAddress}>{item.address}</Text>{formatDistance(item.distanceMeters) && <Text style={styles.locationDistance}>{formatDistance(item.distanceMeters)}</Text>}<Text style={styles.locationFreshness}>{locationFreshnessLabel(item, new Date(), policy)}</Text></View><MaterialCommunityIcons name="chevron-right" size={20} color={activePalette.inkMuted} /></Pressable>)}</View>
    <Text style={styles.mapNote}>Selecciona un punto para ver su ficha y transferirlo a la aplicación Mapas del dispositivo. No se calculan rutas ni tiempos de viaje dentro de Pulso abierto.</Text>
  </ScrollView></SafeAreaView>;
}

function LocationDetailScreen({ route, navigation }: NativeStackScreenProps<RootStackParamList, "Location">) {
  const { content, favorites, toggleFavorite, remember } = useContent();
  const policy = locationSourcePolicy;
  const locations = useMemo(() => locationRecords(content, policy), [content, policy]);
  const location = resolveLocationRoute(locations, route.params.routeKey);
  const favorite = favorites.includes(route.params.routeKey);
  useEffect(() => {
    if (location && canRecordRecent(content, route.params.routeKey)) remember(route.params.routeKey);
  }, [content, location, remember, route.params.routeKey]);
  if (!location) return <MissingResource title="Punto no disponible" detail="La ruta de ubicación no coincide con el paquete local actual. Vuelve al directorio para consultar otro punto." onRecover={() => navigation.goBack()} />;
  const openMaps = () => { void Linking.openURL(platformMapsUrl(location, Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : "web")); };
  return <SafeAreaView style={styles.screen} edges={["top"]}><ScrollView contentContainerStyle={styles.detailContent}>
    <View style={styles.detailTopbar} accessibilityRole="header"><Pressable onPress={() => navigation.goBack()} style={styles.minimumTarget} accessibilityRole="button" accessibilityLabel="Volver" accessibilityHint="Vuelve a la lista anterior."><MaterialCommunityIcons name="arrow-left" size={24} color={activePalette.ink} /></Pressable><Text style={styles.detailTopbarLabel}>{location.kind === "hospital" ? "HOSPITAL" : "BASE"} · OFFLINE</Text><Pressable onPress={() => toggleFavorite(route.params.routeKey)} style={styles.minimumTarget} accessibilityRole="button" accessibilityLabel={favorite ? "Quitar de favoritos" : "Guardar en favoritos"} accessibilityHint={accessibilityHints.toggleFavorite} accessibilityState={{ selected: favorite }}><MaterialCommunityIcons name={favorite ? "star" : "star-outline"} size={25} color={favorite ? activePalette.amber : activePalette.ink} /></Pressable></View>
    <Text style={styles.detailSection}>{location.kind === "hospital" ? "HOSPITAL" : "BASE"}</Text><Text style={styles.detailTitle}>{location.shortName}</Text><Text style={styles.detailMeta}>{location.name} · {location.address} · {location.district}</Text>
    <View style={styles.sourceNotice} accessibilityLabel="Fuente y frescura de la ubicación"><MaterialCommunityIcons name="check-decagram-outline" size={19} color={activePalette.green} /><Text style={styles.sourceNoticeText}>{locationFreshnessLabel(location, new Date(), policy)}.</Text></View>
    <View style={styles.infoBlock}><Text style={styles.infoLabel}>Identificador estable</Text><Text style={styles.infoValue}>{locationFavoriteId(location)}</Text></View>
    <View style={styles.infoBlock}><Text style={styles.infoLabel}>Coordenadas</Text><Text style={styles.infoValue}>{location.lat.toFixed(5)}, {location.lng.toFixed(5)} · solo distancia geométrica</Text></View>
    <Pressable onPress={openMaps} style={styles.primaryButton} accessibilityRole="link" accessibilityLabel={"Abrir " + location.name + " en Mapas"}><Text style={styles.primaryButtonText}>Abrir en Mapas</Text></Pressable>
    <Text style={styles.mapNote}>Se transfiere el punto a la aplicación Mapas del sistema. Pulso abierto no incorpora webviews, rutas ni tiempos de viaje.</Text>
  </ScrollView></SafeAreaView>;
}

function ProcedureScreen({ route, navigation }: NativeStackScreenProps<RootStackParamList, "Procedure">) {
  const { content, favorites, toggleFavorite, remember } = useContent();
  const reduceMotion = useReduceMotion();
  const [attachmentError, setAttachmentError] = useState<string>();
  const [attachmentRecovery, setAttachmentRecovery] = useState<MobileProcedure["attachments"][number]>();
  const [attachmentRecords, setAttachmentRecords] = useState<Record<string, AttachmentRecord>>({});
  const [activeAttachmentId, setActiveAttachmentId] = useState<string>();
  const attachmentControllers = useRef<Record<string, AbortController>>({});
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
  useEffect(() => () => {
    Object.values(attachmentControllers.current).forEach((controller) => controller.abort());
  }, []);
  if (!procedure) return <MissingResource title="Procedimiento no disponible" detail={`No se encontró “${route.params.id}” en el paquete local.`} onRecover={() => navigation.navigate("Tabs", { screen: "Buscar" })} />;
  const favorite = favorites.includes(routeKey);
  const relatedIds = [...new Set([
    ...procedure.related,
    ...procedure.backlinks,
    ...procedure.relations.map((relation) => relation.id),
  ])].filter((id) => id !== procedure.id);
  const related = relatedIds.map((id) => findProcedure(content, id)).filter((item): item is MobileProcedure => Boolean(item));
  const unresolvedRelatedIds = relatedIds.filter((id) => !findProcedure(content, id));
  const openAttachment = async (attachment: MobileProcedure["attachments"][number]) => {
    const current = attachmentRecords[attachment.id] ?? await readAttachmentRecord(attachment);
    if (current.status === "downloading") {
      attachmentControllers.current[attachment.id]?.abort();
      return;
    }
    if (isLocallyAvailable(current, attachment) && current.localUri) {
      await Linking.openURL(current.localUri);
      return;
    }
    if (attachment.byteLength === undefined || !attachment.sha256) {
      setAttachmentRecovery(attachment);
      setAttachmentError(`${attachment.filename} no está validado para guardarse offline. Se mantiene disponible la fuente oficial externa.`);
      try { if (await Linking.canOpenURL(attachment.sourceUrl)) await Linking.openURL(attachment.sourceUrl); } catch { /* source recovery remains visible below */ }
      return;
    }
    setAttachmentError(undefined);
    setAttachmentRecovery(undefined);
    const controller = new AbortController();
    attachmentControllers.current[attachment.id] = controller;
    setActiveAttachmentId(attachment.id);
    setAttachmentRecords((records) => ({ ...records, [attachment.id]: { ...current, status: "downloading", error: undefined } }));
    try {
      const next = await downloadOptionalAttachment(attachment, { signal: controller.signal });
      setAttachmentRecords((records) => ({ ...records, [attachment.id]: next }));
      if (next.status === "available" && next.localUri) await Linking.openURL(next.localUri);
      else if (next.status === "failed") {
        setAttachmentRecovery(attachment);
        setAttachmentError(`${attachment.filename}: ${next.error ?? "No se pudo descargar"}. Puedes intentar la fuente oficial.`);
      }
    } finally {
      if (attachmentControllers.current[attachment.id] === controller) delete attachmentControllers.current[attachment.id];
      setActiveAttachmentId(undefined);
    }
  };
  return <SafeAreaView style={styles.screen} edges={["top"]}><ScrollView
    ref={scrollRef}
    contentContainerStyle={styles.detailContent}
    onScroll={(event) => readingPositions.set(routeKey, event.nativeEvent.contentOffset.y)}
    scrollEventThrottle={100}
  >
    <View style={styles.detailTopbar} accessibilityRole="header"><Pressable onPress={() => navigation.goBack()} style={styles.minimumTarget} accessibilityRole="button" accessibilityLabel="Volver" accessibilityHint="Vuelve a la lista anterior."><MaterialCommunityIcons name="arrow-left" size={24} color={activePalette.ink} /></Pressable><Text style={styles.detailTopbarLabel}>PROCEDIMIENTO {procedure.id}</Text><Pressable onPress={() => toggleFavorite(routeKey)} style={styles.minimumTarget} accessibilityRole="button" accessibilityLabel={favorite ? "Quitar de favoritos" : "Guardar en favoritos"} accessibilityHint={accessibilityHints.toggleFavorite} accessibilityState={{ selected: favorite }}><MaterialCommunityIcons name={favorite ? "star" : "star-outline"} size={25} color={favorite ? activePalette.amber : activePalette.ink} /></Pressable></View>
    <Text style={styles.detailSection}>{procedure.section.toUpperCase()}</Text><Text style={styles.detailTitle}>{procedure.title}</Text><Text style={styles.detailMeta}>Actualizado {procedure.updated || "sin fecha"} · {procedure.attachments.length} anexos</Text>
    <View style={styles.sourceNotice}><MaterialCommunityIcons name="information-outline" size={19} color={activePalette.red} /><Text style={styles.sourceNoticeText}>Consulta de referencia. Confirma siempre la versión operativa vigente.</Text></View>
    {headings.length > 0 && <View style={styles.contentsCard} accessibilityRole="summary" accessibilityLabel="Contenido del procedimiento"><Text style={styles.contentsTitle}>CONTENIDO</Text>{headings.map((heading) => <Pressable key={heading.id} onPress={() => { const offset = sectionOffsets.current[heading.id]; if (typeof offset === "number") scrollRef.current?.scrollTo({ y: Math.max(0, offset - spacing.md), animated: !reduceMotion }); }} style={styles.contentsRow} accessibilityRole="button" accessibilityLabel={`Ir a ${heading.text}`} accessibilityHint="Salta a esta sección del procedimiento."><Text style={[styles.contentsText, heading.level > 2 && styles.contentsTextNested]}>{heading.text}</Text><MaterialCommunityIcons name="chevron-down" size={16} color={activePalette.inkMuted} /></Pressable>)}</View>}
    <MarkdownContent sections={sections} onContainerLayout={(offset) => { markdownOrigin.current = offset; }} onSectionLayout={(id, offset) => { sectionOffsets.current[id] = markdownOrigin.current + offset; }} />
    <ProcedureEditorialBlocks blocks={procedure.editorialBlocks} onProcedure={(id) => navigation.push("Procedure", { id })} />
    {related.length > 0 && <><SectionHeading eyebrow="CONTEXTO DEL MANUAL" title="Referencias relacionadas" /><View style={styles.cardList}>{related.map((item) => <ProcedureRow key={`related-${item.id}`} procedure={item} onPress={() => navigation.push("Procedure", { id: item.id })} />)}</View></>}
    {unresolvedRelatedIds.length > 0 && <View style={styles.sourceNotice}><MaterialCommunityIcons name="link-variant-off" size={19} color={activePalette.red} /><Text style={styles.sourceNoticeText}>Algunas referencias ({unresolvedRelatedIds.join(", ")}) no están incluidas en este paquete local.</Text></View>}
    {procedure.updates.length > 0 && <><SectionHeading eyebrow="HISTORIAL EDITORIAL" title="Actualizaciones" /><View style={styles.updateList} accessibilityLiveRegion="polite" accessibilityLabel={`${procedure.updates.length} actualizaciones editoriales`}>{procedure.updates.map((update, index) => <ProcedureUpdate key={index} update={update} />)}</View></>}
    {procedure.attachments.length > 0 && <><SectionHeading eyebrow="MATERIAL OFICIAL" title="Anexos" />{attachmentError && <View style={styles.sourceNotice} accessibilityLiveRegion="polite"><MaterialCommunityIcons name="alert-circle-outline" size={19} color={activePalette.red} /><View style={styles.resourceCopy}><Text style={styles.sourceNoticeText}>{attachmentError}</Text>{attachmentRecovery && <Pressable onPress={() => void Linking.openURL(attachmentRecovery.sourceUrl)} style={styles.minimumTarget} accessibilityRole="link" accessibilityLabel="Abrir fuente oficial del anexo" accessibilityHint={accessibilityHints.openMap}><Text style={styles.sourceRecoveryLink}>Abrir fuente oficial</Text></Pressable>}</View></View>}<View style={styles.cardList} accessibilityRole="list">{procedure.attachments.map((attachment) => { const record = attachmentRecords[attachment.id]; const status = record?.status ?? "not-downloaded"; const isActive = activeAttachmentId === attachment.id; const canOpen = isLocallyAvailable(record, attachment) && Boolean(record?.localUri); return <Pressable key={attachment.id} onPress={() => void openAttachment(attachment)} style={styles.attachmentRow} accessibilityRole="button" accessibilityLabel={`${canOpen ? "Abrir" : status === "downloading" ? "Cancelar descarga de" : "Descargar"} anexo ${attachment.filename}`} accessibilityHint={canOpen ? "Abre el anexo guardado en este dispositivo." : "Descarga y valida el anexo antes de abrirlo."} accessibilityState={{ busy: isActive }}><MaterialCommunityIcons name={attachment.kind === "pdf" ? "file-pdf-box" : "image-outline"} size={23} color={activePalette.red} /><View style={styles.resourceCopy}><Text style={styles.resourceTitle}>{attachment.filename}</Text><Text style={styles.resourceMeta}>{attachment.kind.toUpperCase()} · {isActive ? "descargando…" : canOpen ? attachmentStatusLabel("available") : attachmentStatusLabel(status)}</Text></View><MaterialCommunityIcons name={canOpen ? "open-in-new" : status === "downloading" ? "close-circle-outline" : status === "failed" || status === "cancelled" ? "refresh" : "download-outline"} size={18} color={activePalette.inkMuted} /></Pressable>; })}</View></>}
  </ScrollView></SafeAreaView>;
}

function DoseUtilityCard({ drug }: { drug: Record<string, unknown> }) {
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
    setResult(next);
  };

  if (!eligibility.eligible) {
    return <View style={styles.doseCard} accessibilityLabel="Conversión de dosis no disponible"><View style={styles.doseHeader}><MaterialCommunityIcons name="calculator-variant-outline" size={22} color={activePalette.inkMuted} /><View style={styles.resourceCopy}><Text style={styles.doseTitle}>Conversión de dosis</Text><Text style={styles.resourceMeta}>No disponible para esta ficha</Text></View></View><Text style={styles.doseUnavailable}>{eligibility.reason ?? "Solo se calculan presentaciones estructuradas y aprobadas."}</Text><Text style={styles.doseDisclaimer}>No se interpreta ni transforma la dosis publicada en texto libre.</Text></View>;
  }

  return <View style={styles.doseCard} accessibilityLabel="Conversión de dosis local">
    <View style={styles.doseHeader}><MaterialCommunityIcons name="calculator-variant-outline" size={22} color={activePalette.red} /><View style={styles.resourceCopy}><Text style={styles.doseTitle}>Conversión de dosis</Text><Text style={styles.resourceMeta}>Cálculo local, sin guardar ni compartir</Text></View></View>
    <Text style={styles.doseLabel}>OPERACIÓN</Text>
    <View style={styles.doseChoiceRow} accessibilityRole="tablist" accessibilityLabel="Operación de conversión">
      {(["amount-to-volume", "dose-rate-to-pump-rate"] as const).map((item) => <Pressable key={item} onPress={() => { setOperation(item); setResult(undefined); }} style={[styles.doseChoice, operation === item && styles.doseChoiceActive]} accessibilityRole="tab" accessibilityLabel={item === "amount-to-volume" ? "Convertir cantidad a volumen" : "Convertir dosis a velocidad de bomba"} accessibilityState={{ selected: operation === item }}><Text style={[styles.doseChoiceText, operation === item && styles.doseChoiceTextActive]}>{item === "amount-to-volume" ? "Cantidad → volumen" : "Dosis → bomba"}</Text></Pressable>)}
    </View>
    {operation === "amount-to-volume" ? <><Text style={styles.doseLabel}>CANTIDAD DE DOSIS</Text><View style={styles.doseInputRow}><TextInput value={amount} onChangeText={(value) => { setAmount(value); setResult(undefined); }} style={styles.doseInput} keyboardType="decimal-pad" accessibilityLabel="Cantidad de dosis"/><Text style={styles.doseUnit}>{amountUnit}</Text></View><View style={styles.doseChoiceRow}>{["mg", "g", "mcg", "mEq", "UI"].map((item) => <Pressable key={item} onPress={() => setAmountUnit(item)} style={[styles.doseUnitChoice, amountUnit === item && styles.doseUnitChoiceActive]} accessibilityRole="button"><Text style={[styles.doseUnitChoiceText, amountUnit === item && styles.doseUnitChoiceTextActive]}>{item}</Text></Pressable>)}</View></> : <><Text style={styles.doseLabel}>DOSIS POR TIEMPO</Text><View style={styles.doseInputRow}><TextInput value={doseRate} onChangeText={(value) => { setDoseRate(value); setResult(undefined); }} style={styles.doseInput} keyboardType="decimal-pad" accessibilityLabel="Dosis por tiempo"/><Text style={styles.doseUnit}>{doseRateUnit} / {timeUnit}</Text></View><View style={styles.doseChoiceRow}>{["mg", "g", "mcg", "mEq", "UI"].map((item) => <Pressable key={item} onPress={() => setDoseRateUnit(item)} style={[styles.doseUnitChoice, doseRateUnit === item && styles.doseUnitChoiceActive]} accessibilityRole="button"><Text style={[styles.doseUnitChoiceText, doseRateUnit === item && styles.doseUnitChoiceTextActive]}>{item}</Text></Pressable>)}{["min", "h", "day"].map((item) => <Pressable key={item} onPress={() => setTimeUnit(item)} style={[styles.doseUnitChoice, timeUnit === item && styles.doseUnitChoiceActive]} accessibilityRole="button"><Text style={[styles.doseUnitChoiceText, timeUnit === item && styles.doseUnitChoiceTextActive]}>{item}</Text></Pressable>)}</View><Pressable onPress={() => { setPerKg((value) => !value); setResult(undefined); }} style={styles.doseCheckRow} accessibilityRole="checkbox" accessibilityState={{ checked: perKg }}><MaterialCommunityIcons name={perKg ? "checkbox-marked" : "checkbox-blank-outline"} size={20} color={perKg ? activePalette.red : activePalette.inkMuted} /><Text style={styles.doseCheckText}>Dosis por kg de peso</Text></Pressable>{perKg && <TextInput value={weightKg} onChangeText={(value) => { setWeightKg(value); setResult(undefined); }} style={styles.doseInputStandalone} keyboardType="decimal-pad" placeholder="Peso (kg)" placeholderTextColor={activePalette.inkMuted} accessibilityLabel="Peso en kilogramos"/>}</>}
    <Text style={styles.doseLabel} accessibilityRole="header">VÍA PUBLICADA</Text>
    <View style={styles.doseChoiceRow}>{routes.map((item) => <Pressable key={item} onPress={() => { setEnteredRoute(item); setRouteConfirmed(false); setResult(undefined); }} style={[styles.doseUnitChoice, enteredRoute === item && styles.doseUnitChoiceActive]} accessibilityRole="button"><Text style={[styles.doseUnitChoiceText, enteredRoute === item && styles.doseUnitChoiceTextActive]}>{item}</Text></Pressable>)}</View>
    <Pressable onPress={() => { setPresentationConfirmed((value) => !value); setResult(undefined); }} style={styles.doseCheckRow} accessibilityRole="checkbox" accessibilityLabel="Confirmar la presentación publicada" accessibilityState={{ checked: presentationConfirmed }}><MaterialCommunityIcons name={presentationConfirmed ? "checkbox-marked" : "checkbox-blank-outline"} size={20} color={presentationConfirmed ? activePalette.red : activePalette.inkMuted} /><Text style={styles.doseCheckText}>Confirmo la presentación publicada</Text></Pressable>
    <Pressable onPress={() => { setRouteConfirmed((value) => !value); setResult(undefined); }} style={styles.doseCheckRow} accessibilityRole="checkbox" accessibilityLabel="Confirmar la vía seleccionada" accessibilityState={{ checked: routeConfirmed }}><MaterialCommunityIcons name={routeConfirmed ? "checkbox-marked" : "checkbox-blank-outline"} size={20} color={routeConfirmed ? activePalette.red : activePalette.inkMuted} /><Text style={styles.doseCheckText}>Confirmo la vía seleccionada</Text></Pressable>
    <Pressable onPress={() => { setSourceConfirmed((value) => !value); setResult(undefined); }} style={styles.doseCheckRow} accessibilityRole="checkbox" accessibilityLabel="Confirmar la fuente clínica y su revisión" accessibilityState={{ checked: sourceConfirmed }}><MaterialCommunityIcons name={sourceConfirmed ? "checkbox-marked" : "checkbox-blank-outline"} size={20} color={sourceConfirmed ? activePalette.red : activePalette.inkMuted} /><Text style={styles.doseCheckText}>Confirmo la fuente clínica y su revisión</Text></Pressable>
    <Pressable onPress={calculate} style={styles.doseCalculateButton} accessibilityRole="button" accessibilityLabel="Calcular conversión de dosis" accessibilityHint="Valida los datos y muestra el resultado y su auditoría."><Text style={styles.primaryButtonText}>Calcular</Text></Pressable>
    {result && (result.ok ? <View style={styles.doseResult} accessibilityLiveRegion="polite" accessibilityLabel="Auditoría completa del resultado de dosis"><Text style={styles.doseResultLabel}>RESULTADO REDONDEADO</Text><Text style={styles.doseResultValue}>{result.display}</Text><Text style={styles.doseResultDetail}>Medicamento: {result.audit.medication.name} ({result.audit.medication.id})</Text><Text style={styles.doseResultDetail}>Presentación: {result.audit.presentation.label} ({result.audit.presentation.id})</Text><Text style={styles.doseResultDetail}>Fuente clínica: {result.audit.source.clinicianSource} · revisión {result.audit.source.revision} · {result.audit.source.date.slice(0, 10)}</Text><Text style={styles.doseResultDetail}>Entrada: {auditValueSummary(result.audit.inputs.entered)}</Text><Text style={styles.doseResultDetail}>Normalizado: {auditValueSummary(result.audit.inputs.normalized)}</Text><Text style={styles.doseResultDetail}>Fórmula: {result.audit.formula}</Text><Text style={styles.doseResultDetail}>Precisión completa: {result.audit.fullPrecision} {result.unit}</Text><Text style={styles.doseResultDetail}>Redondeo aprobado: {result.audit.rounding.mode} a {result.audit.rounding.increment} {result.audit.rounding.unit} → {result.audit.rounding.result} {result.audit.rounding.unit}</Text>{result.warnings.map((warning) => <Text key={warning} style={styles.doseWarning}>Aviso: {warning}</Text>)}</View> : <View style={styles.doseError} accessibilityLiveRegion="polite"><MaterialCommunityIcons name="alert-circle-outline" size={19} color={activePalette.red} /><Text style={styles.doseErrorText}>{result.reason}</Text></View>)}
    <Text style={styles.doseDisclaimer}>Herramienta orientativa. Verifica la pauta, el paciente y la fuente operativa antes de administrar.</Text>
  </View>;
}

function auditValueSummary(values: Record<string, unknown>): string {
  return Object.entries(values).map(([key, value]) => `${key}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`).join(" · ");
}

function DrugScreen({ route, navigation }: NativeStackScreenProps<RootStackParamList, "Drug">) {
  const { content, snapshot, favorites, toggleFavorite, remember } = useContent();
  const drug = content.drugs.find((item) => String(item.id) === route.params.id);
  const routeKey = `vademecum:drug:${route.params.id}`;
  const favorite = favorites.includes(routeKey);
  useEffect(() => {
    if (drug && canRecordRecent(content, routeKey)) remember(routeKey);
  }, [content, drug, remember, routeKey]);
  if (!drug) return <MissingResource title="Fármaco no disponible" />;
  const fields = [["Función", "funcion"], ["Indicación", "indication"], ["Presentación publicada", "presentation"], ["Vía", "route"], ["Dosis publicada", "dose"], ["Contraindicaciones", "contraindications"], ["Efectos secundarios", "efectos_secundarios"], ["Notas", "notes"]] as const;
  const relatedIds = relatedProcedureIdsForDrug(content, drug).slice(0, 12);
  const packageRevision = typeof content.manual.manualVersionCurrent === "string" ? content.manual.manualVersionCurrent : snapshot.packageHash?.slice(0, 12) ?? "paquete local";
  const sourceUrl = typeof content.links.officialWebUrl === "string" && content.links.officialWebUrl ? content.links.officialWebUrl : content.links.sourceUrl;
  return <SafeAreaView style={styles.screen} edges={["top"]}><ScrollView contentContainerStyle={styles.detailContent}><View style={styles.detailTopbar}><Pressable onPress={() => navigation.goBack()} style={styles.minimumTarget} accessibilityRole="button" accessibilityLabel="Volver"><MaterialCommunityIcons name="arrow-left" size={24} color={activePalette.ink} /></Pressable><Text style={styles.detailTopbarLabel}>VADEMÉCUM · FÁRMACO</Text><Pressable onPress={() => toggleFavorite(routeKey)} style={styles.minimumTarget} accessibilityRole="button" accessibilityLabel={favorite ? "Quitar de favoritos" : "Guardar en favoritos"}><MaterialCommunityIcons name={favorite ? "star" : "star-outline"} size={25} color={favorite ? activePalette.amber : activePalette.ink} /></Pressable></View><Text style={styles.detailSection}>VADEMÉCUM · FÁRMACO</Text><Text style={styles.detailTitle}>{String(drug.name ?? "Fármaco")}</Text><Text style={styles.detailMeta}>{String(drug.category ?? "")} · {String(drug.subcategory ?? "")}</Text><View style={styles.sourceNotice}><MaterialCommunityIcons name="database-check-outline" size={19} color={activePalette.green} /><Text style={styles.sourceNoticeText}>Referencia publicada en el paquete local {packageRevision}{sourceUrl ? ` · Fuente: ${sourceUrl}` : ""}</Text></View>{fields.map(([label, key]) => { const value = drug[key]; const display = Array.isArray(value) ? value.join(" · ") : value; return typeof display === "string" && display ? <View key={key} style={styles.infoBlock}><Text style={styles.infoLabel}>{label}</Text><Text style={styles.infoValue}>{display}</Text></View> : null; })}<DoseUtilityCard drug={drug} />{relatedIds.length > 0 && <><SectionHeading eyebrow="CONTEXTO DEL MANUAL" title="Procedimientos relacionados" /><View style={styles.cardList}>{relatedIds.map((id) => { const procedure = findProcedure(content, id); return procedure ? <ProcedureRow key={id} procedure={procedure} onPress={() => navigation.push("Procedure", { id })} /> : null; })}</View></>}</ScrollView></SafeAreaView>;
}

function VademecumReferenceScreen({ route, navigation }: NativeStackScreenProps<RootStackParamList, "Vademecum">) {
  const { content, snapshot, favorites, toggleFavorite, remember } = useContent();
  const reference = resolveVademecumReference(content, route.params.routeKey);
  const favorite = favorites.includes(route.params.routeKey);
  useEffect(() => {
    if (reference && canRecordRecent(content, route.params.routeKey)) remember(route.params.routeKey);
  }, [content, reference?.routeKey, remember, route.params.routeKey]);
  if (!reference) return <MissingResource title="Referencia de Vademécum no disponible" detail="Esta entrada no está incluida en el paquete local." onRecover={() => navigation.navigate("Tabs", { screen: "Buscar" })} />;
  const details = reference.detail ?? {};
  const fields = Object.entries(details).filter(([key, value]) => !["id", "drugId", "drug", "brandNames", "activeIngredient"].includes(key) && (typeof value === "string" || typeof value === "number" || Array.isArray(value))).slice(0, 12);
  const packageRevision = typeof content.manual.manualVersionCurrent === "string" ? content.manual.manualVersionCurrent : snapshot.packageHash?.slice(0, 12) ?? "paquete local";
  return <SafeAreaView style={styles.screen} edges={["top"]}><ScrollView contentContainerStyle={styles.detailContent}><View style={styles.detailTopbar}><Pressable onPress={() => navigation.goBack()} style={styles.minimumTarget} accessibilityRole="button" accessibilityLabel="Volver"><MaterialCommunityIcons name="arrow-left" size={24} color={activePalette.ink} /></Pressable><Text style={styles.detailTopbarLabel}>VADEMÉCUM · {reference.kind.toUpperCase()}</Text><Pressable onPress={() => toggleFavorite(route.params.routeKey)} style={styles.minimumTarget} accessibilityRole="button" accessibilityLabel={favorite ? "Quitar de favoritos" : "Guardar en favoritos"}><MaterialCommunityIcons name={favorite ? "star" : "star-outline"} size={25} color={favorite ? activePalette.amber : activePalette.ink} /></Pressable></View><Text style={styles.detailSection}>VADEMÉCUM · {reference.kind.toUpperCase()}</Text><Text style={styles.detailTitle}>{reference.title}</Text><Text style={styles.detailMeta}>{reference.subtitle}</Text><View style={styles.sourceNotice}><MaterialCommunityIcons name="database-check-outline" size={19} color={activePalette.green} /><Text style={styles.sourceNoticeText}>Referencia local · revisión {packageRevision}</Text></View>{fields.map(([key, value]) => <View key={key} style={styles.infoBlock}><Text style={styles.infoLabel}>{key.replace(/([A-Z])/g, " $1")}</Text><Text style={styles.infoValue}>{Array.isArray(value) ? value.join(" · ") : String(value)}</Text></View>)}</ScrollView></SafeAreaView>;
}

function CodeScreen({ route, navigation }: NativeStackScreenProps<RootStackParamList, "Code">) {
  const { content, snapshot, favorites, toggleFavorite, remember } = useContent();
  const reference = resolveCodeReference(content.codes, route.params.routeKey);
  const favorite = favorites.includes(route.params.routeKey);
  useEffect(() => {
    if (reference && canRecordRecent(content, route.params.routeKey)) remember(route.params.routeKey);
  }, [content, reference?.routeKey, remember, route.params.routeKey]);
  if (!reference) return <MissingResource title="Código no disponible" detail="Este código no está incluido en el paquete local." onRecover={() => navigation.navigate("Tabs", { screen: "Buscar" })} />;
  const details = reference.detail ?? {};
  const description = typeof details.description === "string" ? details.description : "";
  const category = typeof details.category === "string" ? details.category : "";
  const packageRevision = typeof content.manual.manualVersionCurrent === "string" ? content.manual.manualVersionCurrent : snapshot.packageHash?.slice(0, 12) ?? "paquete local";
  const extraFields = Object.entries(details).filter(([key, value]) => !["code", "name", "title", "category", "description"].includes(key) && (typeof value === "string" || typeof value === "number" || Array.isArray(value))).slice(0, 8);
  return <SafeAreaView style={styles.screen} edges={["top"]}><ScrollView contentContainerStyle={styles.detailContent}><View style={styles.detailTopbar}><Pressable onPress={() => navigation.goBack()} style={styles.minimumTarget} accessibilityRole="button" accessibilityLabel="Volver"><MaterialCommunityIcons name="arrow-left" size={24} color={activePalette.ink} /></Pressable><Text style={styles.detailTopbarLabel}>CÓDIGOS · {reference.sourceGroup?.toUpperCase() ?? "LOCAL"}</Text><Pressable onPress={() => toggleFavorite(route.params.routeKey)} style={styles.minimumTarget} accessibilityRole="button" accessibilityLabel={favorite ? "Quitar de favoritos" : "Guardar en favoritos"}><MaterialCommunityIcons name={favorite ? "star" : "star-outline"} size={25} color={favorite ? activePalette.amber : activePalette.ink} /></Pressable></View><Text style={styles.detailSection}>CÓDIGOS · {reference.sourceGroup?.toUpperCase() ?? "LOCAL"}</Text><Text style={styles.detailTitle}>{reference.badge ?? reference.title}</Text><Text style={styles.detailMeta}>{reference.title}</Text><View style={styles.sourceNotice}><MaterialCommunityIcons name="radio-handheld" size={19} color={activePalette.amber} /><Text style={styles.sourceNoticeText}>Taxonomía {reference.sourceGroup ?? "local"}{category ? ` · ${category}` : ""} · revisión {packageRevision}</Text></View>{description ? <View style={styles.infoBlock}><Text style={styles.infoLabel}>Descripción</Text><Text style={styles.infoValue}>{description}</Text></View> : null}{extraFields.map(([key, value]) => <View key={key} style={styles.infoBlock}><Text style={styles.infoLabel}>{key}</Text><Text style={styles.infoValue}>{Array.isArray(value) ? value.map((item) => typeof item === "object" ? JSON.stringify(item) : String(item)).join(" · ") : String(value)}</Text></View>)}<View style={styles.infoBlock}><Text style={styles.infoLabel}>Ruta estable</Text><Text style={styles.infoValue}>{reference.routeKey}</Text></View></ScrollView></SafeAreaView>;
}

function CodesScreen({ route, navigation }: NativeStackScreenProps<RootStackParamList, "Codes">) {
  const { content } = useContent();
  const [query, setQuery] = useState(route.params?.query ?? "");
  const codes = useMemo(() => searchCodes(content.codes, query, 2000), [content.codes, query]);
  return <SafeAreaView style={styles.screen} edges={["top"]}><FlatList data={codes} keyExtractor={(item) => item.id} contentContainerStyle={styles.listContent} ListHeaderComponent={<><Pressable onPress={() => navigation.goBack()} style={styles.minimumTarget} accessibilityRole="button" accessibilityLabel="Volver"><MaterialCommunityIcons name="arrow-left" size={24} color={activePalette.ink} /></Pressable><Text style={styles.pageTitle}>Códigos y claves</Text><Text style={styles.pageKicker}>RADIO · CONSULTA LOCAL</Text><View style={styles.detailSearch}><SearchBar value={query} onChangeText={setQuery} /></View></>} ListEmptyComponent={<EmptyState title="Sin coincidencias" detail="Prueba con el código, nombre, categoría o descripción." />} renderItem={({ item }) => <Pressable onPress={() => navigation.push("Code", { routeKey: item.routeKey })} style={styles.codeRow} accessibilityRole="button" accessibilityLabel={`Abrir código ${item.badge ?? item.title}`}><Text style={styles.codeValue}>{item.badge ?? "—"}</Text><View style={styles.resourceCopy}><Text style={styles.resourceTitle}>{item.title}</Text><Text style={styles.resourceMeta}>{item.subtitle}</Text></View><MaterialCommunityIcons name="chevron-right" size={20} color={activePalette.inkMuted} /></Pressable>} /></SafeAreaView>;
}

function AbbreviationsScreen({ route, navigation }: NativeStackScreenProps<RootStackParamList, "Abbreviations">) {
  const { content } = useContent();
  const [query, setQuery] = useState(route.params?.query ?? "");
  const entries = useMemo(() => searchAbbreviations(content.abbreviations, query, 1000), [content.abbreviations, query]);
  return <SafeAreaView style={styles.screen} edges={["top"]}><FlatList data={entries} keyExtractor={(item) => item.id} contentContainerStyle={styles.listContent} ListHeaderComponent={<><Pressable onPress={() => navigation.goBack()} style={styles.minimumTarget} accessibilityRole="button" accessibilityLabel="Volver"><MaterialCommunityIcons name="arrow-left" size={24} color={activePalette.ink} /></Pressable><Text style={styles.pageTitle}>Abreviaturas</Text><Text style={styles.pageKicker}>LENGUAJE OPERATIVO</Text><View style={styles.detailSearch}><SearchBar value={query} onChangeText={setQuery} /></View></>} ListEmptyComponent={<EmptyState title="Sin coincidencias" detail="Prueba con la abreviatura o su significado." />} renderItem={({ item }) => <View style={styles.abbreviationRow}><Text style={styles.abbreviation}>{item.title}</Text><View style={styles.resourceCopy}><Text style={styles.resourceTitle}>{item.subtitle}</Text><Text style={styles.resourceMeta}>Letra {item.badge ?? "—"}</Text></View></View>} /></SafeAreaView>;
}

function readableMarkdownLine(line: string): string {
  return line
    .replace(/^\s*[-*•]\s+/, "")
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
  return <View style={styles.markdown} onLayout={(event) => onContainerLayout(event.nativeEvent.layout.y)}>{sections.map((section) => <View key={section.key} onLayout={(event) => onSectionLayout(section.key, event.nativeEvent.layout.y)}>{section.heading && <Text style={section.heading.level === 2 ? styles.markdownH2 : styles.markdownH3}>{section.heading.text}</Text>}{section.lines.map((line, index) => { const trimmed = line.trim(); if (!trimmed || trimmed.startsWith("🖨️") || /^#{2,6}\s/.test(trimmed)) return null; const text = readableMarkdownLine(trimmed); if (!text) return null; if (/^(\*|-|•)\s/.test(trimmed)) return <View key={`${section.key}-${index}`} style={styles.markdownBullet}><Text style={styles.bulletDot}>•</Text><Text style={styles.markdownText}>{text}</Text></View>; return <Text key={`${section.key}-${index}`} style={styles.markdownText}>{text}</Text>; })}</View>)}</View>;
}

function ProcedureEditorialBlocks({ blocks, onProcedure }: { blocks: unknown[]; onProcedure?: (id: string) => void }) {
  const usable = blocks.filter((block): block is Record<string, unknown> => Boolean(block) && typeof block === "object");
  if (!usable.length) return null;
  return <><SectionHeading eyebrow="NOTAS EDITORIALES" title="Puntos destacados" /><View style={styles.editorialList}>{usable.map((block, index) => { const items = Array.isArray(block.items) ? block.items : []; const assets = Array.isArray(block.assets) ? block.assets : []; return <View key={String(block.id ?? index)} style={styles.editorialBlock}><Text style={styles.infoLabel}>{String(block.label ?? block.type ?? "Nota")}</Text>{typeof block.title === "string" && <Text style={styles.editorialTitle}>{block.title}</Text>}{typeof block.content === "string" && <Text style={styles.infoValue}>{block.content}</Text>}{items.map((item, itemIndex) => { const itemId = typeof item === "string" && /^\d/.test(item) ? item : undefined; const itemText = typeof item === "string" ? item : String((item as Record<string, unknown>)?.label ?? (item as Record<string, unknown>)?.title ?? "Referencia"); return itemId && onProcedure ? <Pressable key={itemIndex} onPress={() => onProcedure(itemId)} style={styles.editorialLink} accessibilityRole="button" accessibilityLabel={`Abrir procedimiento ${itemId}`}><Text style={styles.markdownText}>• {itemText}</Text><MaterialCommunityIcons name="chevron-right" size={17} color={activePalette.inkMuted} /></Pressable> : <Text key={itemIndex} style={styles.markdownText}>• {itemText}</Text>; })}{assets.map((asset, assetIndex) => <Text key={assetIndex} style={styles.resourceMeta}>{String((asset as Record<string, unknown>)?.title ?? (asset as Record<string, unknown>)?.src ?? "Material editorial")}</Text>)}</View>; })}</View></>;
}

function ProcedureUpdate({ update }: { update: unknown }) {
  const value = update && typeof update === "object" ? update as Record<string, unknown> : {};
  const date = String(value.date ?? value.updatedAt ?? value.createdAt ?? "Fecha no indicada");
  const label = String(value.title ?? value.label ?? value.type ?? "Actualización del contenido");
  const detail = String(value.summary ?? value.description ?? value.message ?? "");
  return <View style={styles.updateRow} accessible accessibilityRole="text" accessibilityLabel={`${label}. ${date.slice(0, 10)}${detail ? `. ${detail}` : ""}`}><Text style={styles.infoLabel}>{date.slice(0, 10)}</Text><Text style={styles.resourceTitle}>{label}</Text>{detail && <Text style={styles.resourceMeta}>{detail}</Text>}</View>;
}

function EmptyState({ title, detail }: { title: string; detail: string }) { return <View style={styles.emptyState}><MaterialCommunityIcons name="bookmark-off-outline" size={28} color={activePalette.inkMuted} /><Text style={styles.emptyTitle}>{title}</Text><Text style={styles.emptyDetail}>{detail}</Text></View>; }
function MissingResource({ title, detail, onRecover }: { title: string; detail?: string; onRecover?: () => void }) { return <SafeAreaView style={styles.screen}><View style={styles.emptyState}><MaterialCommunityIcons name="file-alert-outline" size={30} color={activePalette.red} /><Text style={styles.emptyTitle}>{title}</Text>{detail && <Text style={styles.emptyDetail}>{detail}</Text>}{onRecover && <Pressable onPress={onRecover} style={styles.primaryButton} accessibilityRole="button"><Text style={styles.primaryButtonText}>Buscar otro procedimiento</Text></Pressable>}</View></SafeAreaView>; }

function SettingsModal({ visible, onClose, onRefresh, onCancelRefresh, onResumeStaged, onDiscardStaged, onOpenAbbreviations, generatedAt, packageHash, isRefreshing, lastError, syncState, syncProgress, stagedPackage }: { visible: boolean; onClose: () => void; onRefresh: () => Promise<void>; onCancelRefresh: () => void; onResumeStaged: () => Promise<void>; onDiscardStaged: () => Promise<void>; onOpenAbbreviations: () => void; generatedAt: string; packageHash?: string; isRefreshing: boolean; lastError?: string; syncState: SyncState; syncProgress: SyncProgress; stagedPackage?: StagedPackage }) {
  const { appearance, setAppearance } = usePreferences();
  const reduceMotion = useReduceMotion();
  const { width, fontScale } = useWindowDimensions();
  const layout = adaptiveLayout(width, fontScale);
  const appearanceLabels: Record<AppearancePreference, string> = { system: "Sistema", light: "Claro", dark: "Oscuro" };
  const presentation = syncPresentation(syncState, contentFreshness(generatedAt), syncProgress, stagedPackage?.packageHash);
  const progressPercent = syncProgress.totalBytes && syncProgress.downloadedBytes !== undefined ? Math.min(100, Math.round((syncProgress.downloadedBytes / syncProgress.totalBytes) * 100)) : undefined;
  return <Modal visible={visible} animationType={reduceMotion ? "none" : "slide"} presentationStyle="pageSheet" allowSwipeDismissal onRequestClose={onClose}>
    <SafeAreaView style={styles.modal} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
        <View style={styles.modalHeader} accessibilityRole="header"><View><Text style={styles.modalTitle}>Información y ajustes</Text><Text style={styles.modalKicker}>PULSO ABIERTO</Text></View><Pressable onPress={onClose} style={styles.minimumTarget} accessibilityRole="button" accessibilityLabel="Cerrar información y ajustes" accessibilityHint={accessibilityHints.dismiss}><Text style={styles.modalClose}>Cerrar</Text></Pressable></View>
        <Text style={styles.settingsSectionTitle}>Contenido y sincronización</Text>
        <View style={styles.settingsCard} accessibilityLabel="Estado del contenido local">
          <MaterialCommunityIcons name={presentation.icon} size={25} color={presentation.color} />
          <View style={styles.resourceCopy}><Text style={styles.resourceTitle}>{presentation.title}</Text><Text style={styles.resourceMeta}>{lastError ?? `${generatedAt.slice(0, 10)} · rev ${packageHash?.slice(0, 10) ?? "—"} · ${presentation.detail}`}</Text>{progressPercent !== undefined && <View style={styles.progressTrack} accessibilityLabel={`Progreso de actualización ${progressPercent}%`}><View style={[styles.progressFill, { width: `${progressPercent}%` }]} /></View>}</View>
        </View>
        {isRefreshing ? <Pressable onPress={onCancelRefresh} disabled={syncState === "activating"} style={[styles.primaryButton, syncState === "activating" && styles.disabledButton]} accessibilityRole="button" accessibilityLabel={syncState === "activating" ? "Aplicando actualización" : "Cancelar actualización"}><Text style={styles.primaryButtonText}>{syncState === "activating" ? "Aplicando actualización…" : "Cancelar actualización"}</Text></Pressable> : <Pressable onPress={() => void onRefresh()} style={styles.primaryButton} accessibilityRole="button" accessibilityLabel="Buscar actualización"><Text style={styles.primaryButtonText}>Buscar actualización</Text></Pressable>}
        {stagedPackage && <View style={styles.recoveryActions} accessibilityLiveRegion="polite"><Text style={styles.resourceMeta}>Hay un paquete descargado que no llegó a activarse. El contenido anterior sigue protegido.</Text><View style={styles.recoveryButtons}><Pressable onPress={() => void onResumeStaged()} disabled={isRefreshing} style={styles.recoveryButton} accessibilityRole="button" accessibilityLabel="Reanudar actualización pendiente"><Text style={styles.recoveryButtonText}>Reanudar</Text></Pressable><Pressable onPress={() => void onDiscardStaged()} disabled={isRefreshing} style={styles.recoveryButtonSecondary} accessibilityRole="button" accessibilityLabel="Descartar actualización pendiente"><Text style={styles.recoveryButtonSecondaryText}>Descartar</Text></Pressable></View></View>}

        <Text style={styles.settingsSectionTitle}>Consulta rápida</Text>
        <Pressable onPress={onOpenAbbreviations} style={styles.settingsCard} accessibilityRole="button" accessibilityLabel="Abrir abreviaturas">
          <MaterialCommunityIcons name="format-letter-case" size={25} color={activePalette.green} />
          <View style={styles.resourceCopy}><Text style={styles.resourceTitle}>Abreviaturas</Text><Text style={styles.resourceMeta}>Búsqueda local por abreviatura o significado</Text></View>
          <MaterialCommunityIcons name="chevron-right" size={20} color={activePalette.inkMuted} />
        </Pressable>

        <Text style={styles.settingsSectionTitle}>Apariencia</Text>
        <View style={[styles.appearanceControl, layout.singleColumn && styles.appearanceControlStacked]} accessibilityRole="radiogroup" accessibilityLabel="Apariencia de la aplicación">
          {(Object.keys(appearanceLabels) as AppearancePreference[]).map((option) => <Pressable key={option} onPress={() => setAppearance(option)} style={[styles.appearanceOption, appearance === option && styles.appearanceOptionActive]} accessibilityRole="radio" accessibilityState={{ selected: appearance === option }}><MaterialCommunityIcons name={option === "system" ? "theme-light-dark" : option === "light" ? "white-balance-sunny" : "weather-night"} size={17} color={appearance === option ? activePalette.white : activePalette.inkMuted} /><Text style={[styles.appearanceText, appearance === option && styles.appearanceTextActive]}>{appearanceLabels[option]}</Text></Pressable>)}
        </View>

        <Text style={styles.settingsSectionTitle}>Aviso y alcance</Text>
        <View style={styles.infoPanel}><Text style={styles.infoPanelTitle}>Referencia independiente</Text><Text style={styles.infoPanelText}>Pulso abierto es una adaptación digital no oficial para consulta. No sustituye instrucciones, protocolos ni criterio profesional. Verifica siempre la versión operativa vigente con SAMUR-Protección Civil Madrid.</Text></View>
        <Text style={styles.settingsSectionTitle}>Privacidad y funcionamiento</Text>
        <Text style={styles.disclaimer}>No se solicitan cuentas ni datos de pacientes. Favoritos, recientes y preferencias permanecen en este dispositivo. No hay publicidad, pagos, analítica obligatoria, notificaciones push ni sincronización entre dispositivos.</Text>
        <Pressable onPress={() => void Linking.openURL("https://servpub.madrid.es/manualsamur/bin/view/Main/")} style={styles.linkRow} accessibilityRole="link"><Text style={styles.linkText}>Abrir fuente oficial del manual</Text><MaterialCommunityIcons name="open-in-new" size={17} color={activePalette.red} /></Pressable>
        <Text style={styles.legalText}>ManualSAMUR y SAMUR-Protección Civil son referencias de sus titulares. Pulso abierto no implica afiliación, aprobación ni representación institucional.</Text>
      </ScrollView>
    </SafeAreaView>
  </Modal>;
}

function LaunchScreen() {
  return <SafeAreaView style={styles.launchScreen}><LogoMark /><Text style={styles.launchTitle}>Pulso abierto</Text><Text style={styles.launchSubtitle}>MANUALSAMUR · REFERENCIA LOCAL</Text></SafeAreaView>;
}

function FirstUseDisclosure({ onContinue }: { onContinue: () => Promise<void> }) {
  const [isSaving, setIsSaving] = useState(false);
  const reduceMotion = useReduceMotion();
  const continueToApp = async () => { setIsSaving(true); await onContinue(); };
  return <Modal visible animationType={reduceMotion ? "none" : "fade"} presentationStyle="fullScreen" onRequestClose={() => undefined}><SafeAreaView style={styles.disclosureScreen} accessibilityViewIsModal>
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, paddingBottom: spacing.xl, justifyContent: "space-between" }} showsVerticalScrollIndicator={false}>
      <View style={styles.disclosureContent} accessibilityRole="header" accessibilityLabel="Aviso de primera puesta en marcha"><LogoMark /><Text style={styles.disclosureEyebrow}>ANTES DE EMPEZAR</Text><Text style={styles.disclosureTitle}>Una referencia abierta para la guardia.</Text><Text style={styles.disclosureBody}>Pulso abierto es una adaptación digital independiente y no oficial del ManualSAMUR. El contenido es de referencia: no sustituye protocolos, instrucciones ni criterio profesional.</Text><Text style={styles.disclosureBody}>El manual se consulta offline. No necesitas cuenta y no se recogen datos de pacientes.</Text></View>
      <View style={{ marginTop: spacing.xl }}><Pressable onPress={() => void continueToApp()} disabled={isSaving} style={[styles.primaryButton, isSaving && styles.disabledButton]} accessibilityRole="button" accessibilityLabel={isSaving ? "Preparando el manual" : "Entendido, abrir el manual"} accessibilityState={{ busy: isSaving }}><Text style={styles.primaryButtonText}>{isSaving ? "Preparando…" : "Entendido, abrir el manual"}</Text></Pressable><Text style={styles.disclosureFooter}>Puedes revisar este aviso, la fuente y la privacidad desde Información y ajustes.</Text></View>
    </ScrollView>
  </SafeAreaView></Modal>;
}

function LocationModal({ location, onClose, onOpenMaps, policy = locationSourcePolicy }: { location?: LocationWithDistance; onClose: () => void; onOpenMaps?: (location: LocationRecord) => void; policy?: typeof locationSourcePolicy }) {
  const reduceMotion = useReduceMotion();
  if (!location) return null;
  const title = location.shortName || location.name;
  return <Modal visible animationType={reduceMotion ? "none" : "slide"} transparent onRequestClose={onClose}><View style={styles.modalBackdrop}>
    <Pressable style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }} onPress={onClose} accessibilityElementsHidden accessibilityLabel="Cerrar ficha de ubicación" />
    <ScrollView style={[styles.locationSheet, { maxHeight: "85%", padding: 0 }]} contentContainerStyle={{ padding: spacing.xl }} showsVerticalScrollIndicator={false} accessibilityViewIsModal>
      <View style={styles.sheetHandle} accessibilityElementsHidden /><View accessibilityRole="header" accessibilityLabel={`${title}, ficha de ubicación`}><Text style={styles.detailSection}>{location.kind === "hospital" ? "HOSPITAL" : "BASE"}</Text><Text style={styles.sheetTitle}>{title}</Text><Text style={styles.resourceMeta}>{location.name} · {location.address} · {location.district}</Text></View><View style={styles.locationDetailBlock}><Text style={styles.infoLabel}>Identificador estable</Text><Text style={styles.infoValue}>{locationFavoriteId(location)} · ruta {locationRouteKey(location)}</Text><Text style={styles.infoLabel}>Fuente y frescura</Text><Text style={styles.infoValue}>{locationFreshnessLabel(location, new Date(), policy)}</Text><Text style={styles.infoLabel}>Coordenadas</Text><Text style={styles.infoValue}>{location.lat.toFixed(5)}, {location.lng.toFixed(5)} · distancia geométrica, sin ruta</Text></View>{onOpenMaps && <Pressable onPress={() => onOpenMaps(location)} style={styles.primaryButton} accessibilityRole="link" accessibilityLabel={"Abrir " + title + " en Mapas"} accessibilityHint={accessibilityHints.openMap}><Text style={styles.primaryButtonText}>Abrir en Mapas</Text></Pressable>}<Pressable onPress={onClose} style={styles.secondaryButton} accessibilityRole="button" accessibilityLabel="Hecho, cerrar ficha de ubicación" accessibilityHint={accessibilityHints.dismiss}><Text style={styles.secondaryButtonText}>Hecho</Text></Pressable>
    </ScrollView>
  </View></Modal>;
}

function TabIcon({ name, color }: { name: keyof typeof MaterialCommunityIcons.glyphMap; color: string }) { return <MaterialCommunityIcons name={name} size={23} color={color} />; }

function MainTabs() {
  const { width, fontScale } = useWindowDimensions();
  const layout = adaptiveLayout(width, fontScale);
  return <Tabs.Navigator backBehavior="history" screenOptions={{ headerShown: false, tabBarActiveTintColor: activePalette.red, tabBarInactiveTintColor: activePalette.inkMuted, tabBarLabelStyle: [styles.tabLabel, layout.singleColumn && styles.tabLabelLarge], tabBarStyle: [styles.tabBar, layout.isTablet && styles.tabBarTablet, layout.singleColumn && styles.tabBarLargeFont], tabBarHideOnKeyboard: true, tabBarAccessibilityLabel: "Navegación principal" }}>
    <Tabs.Screen name="Inicio" component={HomeScreen} options={{ tabBarIcon: ({ color }) => <TabIcon name="home-variant-outline" color={color} /> }} />
    <Tabs.Screen name="Buscar" component={SearchScreen} options={{ tabBarIcon: ({ color }) => <TabIcon name="magnify" color={color} /> }} />
    <Tabs.Screen name="Guardados" component={SavedScreen} options={{ tabBarIcon: ({ color }) => <TabIcon name="star-outline" color={color} /> }} />
    <Tabs.Screen name="Mapa" component={MapScreen} options={{ tabBarIcon: ({ color }) => <TabIcon name="map-outline" color={color} /> }} />
  </Tabs.Navigator>;
}

function AppNavigation() {
  const reduceMotion = useReduceMotion();
  const { width, fontScale } = useWindowDimensions();
  const layout = adaptiveLayout(width, fontScale);
  const tablet = layout.isTablet;
  return <NavigationContainer><Stack.Navigator screenOptions={{ headerShown: false, animation: reduceMotion ? "none" : "slide_from_right", gestureEnabled: true, fullScreenGestureEnabled: true, contentStyle: { backgroundColor: styles.screen.backgroundColor }, presentation: tablet ? "card" : undefined }}><Stack.Screen name="Tabs" component={MainTabs} /><Stack.Screen name="Procedure" component={ProcedureScreen} options={{ presentation: "card" }} /><Stack.Screen name="Location" component={LocationDetailScreen} options={{ presentation: "card" }} /><Stack.Screen name="Drug" component={DrugScreen} options={{ presentation: "card" }} /><Stack.Screen name="Vademecum" component={VademecumReferenceScreen} options={{ presentation: "card" }} /><Stack.Screen name="Codes" component={CodesScreen} options={{ presentation: tablet ? "card" : "formSheet", gestureDirection: "vertical" }} /><Stack.Screen name="Code" component={CodeScreen} options={{ presentation: "card" }} /><Stack.Screen name="Abbreviations" component={AbbreviationsScreen} options={{ presentation: tablet ? "card" : "formSheet", gestureDirection: "vertical" }} /></Stack.Navigator></NavigationContainer>;
}

function AppGate() {
  const { isHydrated, hasAcknowledgedFirstUse, acknowledgeFirstUse, appearance } = usePreferences();
  const scheme = useColorScheme();
  const palette = resolveAdaptivePalette(appearance === "system" ? scheme : appearance);
  // Route components are intentionally kept as plain navigators; AppGate is the
  // single render owner that refreshes the shared theme snapshot before mounting them.
  // eslint-disable-next-line react-hooks/globals
  activePalette = palette;
  // eslint-disable-next-line react-hooks/globals
  styles = createStyles(palette);
  if (!isHydrated) return <LaunchScreen />;
  if (!hasAcknowledgedFirstUse) return <FirstUseDisclosure onContinue={acknowledgeFirstUse} />;
  return <ContentProvider><View style={[styles.appSurface, { backgroundColor: palette.paper }]}><StatusBar style={appearance === "dark" || (appearance === "system" && scheme === "dark") ? "light" : "dark"} /><AppNavigation key={`${appearance}-${scheme ?? "light"}`} /></View></ContentProvider>;
}

export default function App() { return <SafeAreaProvider><PreferencesProvider><AppGate /></PreferencesProvider></SafeAreaProvider>; }

function createStyles(palette: typeof colors | ReturnType<typeof resolveAdaptivePalette>) {
  return StyleSheet.create({
  appSurface: { flex: 1 },
  minimumTarget: accessibilityTargetStyle(),
  screen: { flex: 1, backgroundColor: nativeTheme?.paper ?? palette.paper },
  scrollContent: { padding: spacing.lg, paddingBottom: 40, alignSelf: "center", width: "100%", maxWidth: 960 },
  listContent: { padding: spacing.lg, paddingBottom: 40, gap: 8, alignSelf: "center", width: "100%", maxWidth: 1040 },
  detailContent: { padding: spacing.lg, paddingBottom: 48, alignSelf: "center", width: "100%", maxWidth: 720 },
  brandHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.xl },
  brandLockup: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  logoMark: { width: 94, height: 94, borderRadius: 27, backgroundColor: palette.red, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  logoMarkSmall: { width: 38, height: 38, borderRadius: 11 },
  logoCrossVertical: { position: "absolute", width: 15, height: 60, backgroundColor: palette.white, borderRadius: 3 },
  logoCrossHorizontal: { position: "absolute", width: 60, height: 15, backgroundColor: palette.white, borderRadius: 3 },
  logoSmallBar: { width: 6, height: 24 }, logoSmallHorizontal: { width: 24, height: 6 },
  logoArrow: { position: "absolute", width: 36, height: 36, backgroundColor: palette.ink, transform: [{ rotate: "45deg" }], left: 20, top: 16, borderRadius: 4 },
  logoArrowSmall: { width: 16, height: 16, left: 8, top: 7, borderRadius: 2 },
  brandName: { color: nativeTheme?.ink ?? palette.ink, fontSize: 18, fontWeight: "800", letterSpacing: -0.4 },
  brandSubline: { color: nativeTheme?.red ?? palette.red, fontSize: 9, fontWeight: "800", letterSpacing: 1.3, marginTop: 2 },
  iconButton: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: nativeTheme?.surface ?? palette.surface, borderWidth: 1, borderColor: nativeTheme?.line ?? palette.line },
  hero: { backgroundColor: nativeTheme?.ink ?? palette.ink, borderRadius: radii.lg, padding: spacing.xl, minHeight: 190, flexDirection: "row", overflow: "hidden", marginBottom: spacing.lg },
  heroCopy: { flex: 1, zIndex: 1 }, heroStacked: { flexDirection: "column", minHeight: 250 },
  heroEyebrow: { color: "#B8C4D7", fontSize: 10, fontWeight: "800", letterSpacing: 1.2, marginBottom: spacing.md },
  heroTitle: { color: palette.white, fontSize: 29, lineHeight: 32, fontWeight: "800", letterSpacing: -1 },
  heroBody: { color: "#D7DEEA", fontSize: 13, lineHeight: 18, marginTop: spacing.md, maxWidth: 225 },
  searchBar: { minHeight: 58, borderRadius: radii.md, backgroundColor: nativeTheme?.surface ?? palette.surface, borderWidth: 1, borderColor: nativeTheme?.line ?? palette.line, flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, gap: spacing.sm, marginBottom: spacing.xl },
  searchInput: { flex: 1, color: nativeTheme?.ink ?? palette.ink, fontSize: 14, paddingVertical: 0 }, searchPlaceholder: { flex: 1, color: nativeTheme?.inkMuted ?? palette.inkMuted, fontSize: 14 },
  offlineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: palette.green },
  sectionHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: spacing.md, marginBottom: spacing.md },
  eyebrow: { color: nativeTheme?.red ?? palette.red, fontSize: 10, letterSpacing: 1.3, fontWeight: "800", marginBottom: 4 },
  sectionTitle: { color: nativeTheme?.ink ?? palette.ink, fontSize: 21, lineHeight: 25, fontWeight: "800", letterSpacing: -0.5 },
  sectionAction: { color: nativeTheme?.red ?? palette.red, fontSize: 12, fontWeight: "800", paddingBottom: 2 },
  actionGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.lg, maxWidth: 720 }, actionGridSingle: { flexDirection: "column" },
  actionCard: { width: "48%", minHeight: 126, padding: spacing.md, borderRadius: radii.md, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line }, actionCardSingle: { width: "100%" },
  actionIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: palette.redWash, alignItems: "center", justifyContent: "center", marginBottom: spacing.sm },
  actionIconNavy: { backgroundColor: palette.surfaceMuted }, actionIconAmber: { backgroundColor: palette.amberWash }, actionIconGreen: { backgroundColor: palette.greenWash },
  actionLabel: { fontSize: 15, fontWeight: "800", color: palette.ink }, actionDetail: { fontSize: 11, color: palette.inkMuted, marginTop: 3 },
  cardList: { backgroundColor: palette.surface, borderRadius: radii.md, borderWidth: 1, borderColor: palette.line, overflow: "hidden", marginBottom: spacing.xl },
  resourceRow: { minHeight: 70, padding: spacing.md, flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: palette.surface, borderBottomWidth: 1, borderBottomColor: palette.line }, resourceRowMain: { flex: 1, minHeight: 44, flexDirection: "row", alignItems: "center", gap: spacing.md },
  resourceCode: { width: 42, height: 42, borderRadius: 12, backgroundColor: palette.redWash, alignItems: "center", justifyContent: "center" }, resourceCodeText: { fontSize: 11, fontWeight: "900", color: palette.red }, staleResourceCode: { backgroundColor: palette.redWash }, staleResourceText: { color: palette.redDark, fontSize: 10, lineHeight: 14, marginTop: 3 },
  drugCode: { backgroundColor: palette.surfaceMuted }, resourceCopy: { flex: 1 }, resourceTitle: { color: palette.ink, fontSize: 14, lineHeight: 18, fontWeight: "700" }, resourceMeta: { color: palette.inkMuted, fontSize: 11, lineHeight: 16, marginTop: 3 },
  pressed: { opacity: 0.72 },
  syncCard: { backgroundColor: palette.greenWash, borderRadius: radii.md, padding: spacing.md, flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.lg }, syncIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: palette.white, alignItems: "center", justifyContent: "center" }, syncCopy: { flex: 1 }, syncTitle: { color: palette.green, fontWeight: "800", fontSize: 13 }, syncDetail: { color: palette.inkMuted, fontSize: 11, marginTop: 2 }, syncAction: { color: palette.green, fontSize: 12, fontWeight: "800" }, progressTrack: { height: 4, borderRadius: 2, backgroundColor: palette.line, overflow: "hidden", marginTop: 7 }, progressFill: { height: 4, backgroundColor: palette.green },
  disclaimer: { color: palette.inkMuted, fontSize: 11, lineHeight: 16, textAlign: "center", marginVertical: spacing.md },
  searchScreenHeader: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.md }, pageTitle: { color: palette.ink, fontSize: 31, fontWeight: "800", letterSpacing: -1 }, pageKicker: { color: palette.red, fontSize: 10, fontWeight: "800", letterSpacing: 1.3, marginTop: 4 }, searchPadding: { paddingHorizontal: spacing.lg }, detailSearch: { marginTop: spacing.lg },
  filterRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, paddingHorizontal: spacing.lg, marginBottom: spacing.sm }, filterChip: { minHeight: 44, justifyContent: "center", paddingVertical: 9, paddingHorizontal: 13, borderRadius: radii.pill, backgroundColor: palette.surfaceMuted }, filterChipActive: { backgroundColor: palette.ink }, filterText: { color: palette.inkMuted, fontSize: 12, fontWeight: "700" }, filterTextActive: { color: palette.white },
  emptyState: { alignItems: "center", padding: spacing.xl, gap: spacing.sm }, emptyTitle: { color: palette.ink, fontWeight: "800", fontSize: 16 }, emptyDetail: { color: palette.inkMuted, textAlign: "center", fontSize: 13, lineHeight: 18 },
  mapLegend: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.md }, mapLegendDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: palette.green }, mapLegendText: { color: palette.inkMuted, fontSize: 12 }, locationPolicyNotice: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, backgroundColor: palette.amberWash, borderRadius: radii.md, padding: spacing.md, marginHorizontal: spacing.lg, marginBottom: spacing.md }, onlineMapDisabled: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, backgroundColor: palette.surfaceMuted, borderRadius: radii.md, borderWidth: 1, borderColor: palette.line, padding: spacing.md, marginHorizontal: spacing.lg, marginBottom: spacing.md }, onlineMapDisabledTitle: { color: palette.ink, fontSize: 13, fontWeight: "800" }, onlineMapDisabledCopy: { color: palette.inkMuted, fontSize: 12, lineHeight: 17, marginTop: 3 }, locationActions: { gap: spacing.sm, marginBottom: spacing.md }, locationActionButton: { minHeight: 48, borderRadius: radii.md, backgroundColor: palette.ink, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, paddingHorizontal: spacing.lg }, locationActionText: { color: palette.white, fontSize: 13, fontWeight: "800" }, nearestToggle: { flexDirection: "row", gap: spacing.sm }, nearestChoice: { flex: 1, minHeight: 42, borderRadius: radii.sm, backgroundColor: palette.surfaceMuted, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.sm }, nearestChoiceActive: { backgroundColor: palette.redWash, borderWidth: 1, borderColor: palette.red }, nearestChoiceText: { color: palette.inkMuted, fontSize: 11, fontWeight: "800", textAlign: "center" }, nearestChoiceTextActive: { color: palette.redDark }, locationFallback: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, backgroundColor: palette.amberWash, borderRadius: radii.md, padding: spacing.md, marginBottom: spacing.md }, locationFallbackText: { flex: 1, color: palette.ink, fontSize: 12, lineHeight: 17 }, accessibleEquivalent: { backgroundColor: palette.surfaceMuted, borderRadius: radii.md, padding: spacing.md, marginBottom: spacing.sm }, accessibleEquivalentTitle: { color: palette.ink, fontSize: 14, fontWeight: "800" }, accessibleEquivalentCopy: { color: palette.inkMuted, fontSize: 12, lineHeight: 17, marginTop: 3 },
  schematicMap: { height: 300, borderRadius: radii.lg, backgroundColor: palette.surfaceMuted, overflow: "hidden", position: "relative", marginBottom: spacing.xl, borderWidth: 1, borderColor: palette.line }, mapRoadOne: { position: "absolute", width: "150%", height: 42, backgroundColor: palette.paper, transform: [{ rotate: "-24deg" }], top: 125, left: -50 }, mapRoadTwo: { position: "absolute", width: "120%", height: 20, backgroundColor: palette.paper, transform: [{ rotate: "38deg" }], top: 64, left: -12 }, mapRoadThree: { position: "absolute", width: 18, height: "130%", backgroundColor: palette.paper, transform: [{ rotate: "15deg" }], top: -20, left: 185 }, mapPin: { position: "absolute", width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: palette.white }, mapPinRed: { backgroundColor: palette.red }, mapPinNavy: { backgroundColor: palette.ink }, mapCompass: { position: "absolute", top: 15, right: 15, alignItems: "center" }, mapCompassN: { fontSize: 11, color: palette.ink, fontWeight: "900" }, mapNote: { color: palette.inkMuted, fontSize: 11, lineHeight: 16, textAlign: "center", marginTop: -spacing.md, marginBottom: spacing.xl },
  locationRow: { minHeight: 66, padding: spacing.md, flexDirection: "row", alignItems: "center", gap: spacing.md, borderBottomWidth: 1, borderBottomColor: palette.line }, locationIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: palette.redWash, alignItems: "center", justifyContent: "center" }, locationIconBase: { backgroundColor: palette.amberWash }, locationAddress: { color: palette.ink, fontSize: 11, lineHeight: 16, marginTop: 2 }, locationDistance: { color: palette.green, fontSize: 11, fontWeight: "800", lineHeight: 16, marginTop: 2 }, locationFreshness: { color: palette.inkMuted, fontSize: 10, lineHeight: 14, marginTop: 2 },
  detailTopbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.xl }, detailTopbarLabel: { flex: 1, marginHorizontal: spacing.md, textAlign: "center", color: palette.inkMuted, fontSize: 10, fontWeight: "800", letterSpacing: 1.2 }, detailSection: { color: palette.red, fontSize: 11, fontWeight: "900", letterSpacing: 1.4, marginBottom: spacing.sm }, detailTitle: { color: palette.ink, fontSize: 30, lineHeight: 34, fontWeight: "800", letterSpacing: -0.8 }, detailMeta: { color: palette.inkMuted, fontSize: 12, marginTop: spacing.sm, marginBottom: spacing.lg }, sourceNotice: { flexDirection: "row", gap: spacing.sm, backgroundColor: palette.redWash, borderRadius: radii.md, padding: spacing.md, marginBottom: spacing.xl }, sourceNoticeText: { flex: 1, color: palette.redDark, fontSize: 12, lineHeight: 17 }, sourceRecoveryLink: { color: palette.redDark, fontSize: 12, fontWeight: "800", textDecorationLine: "underline", marginTop: spacing.sm }, contentsCard: { backgroundColor: palette.surfaceMuted, borderRadius: radii.md, padding: spacing.md, marginBottom: spacing.xl }, contentsTitle: { color: palette.red, fontSize: 10, fontWeight: "900", letterSpacing: 1.2, marginBottom: spacing.sm }, contentsRow: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: palette.line }, contentsText: { flex: 1, color: palette.ink, fontSize: 13, fontWeight: "700" }, contentsTextNested: { paddingLeft: spacing.md, fontWeight: "600", color: palette.inkMuted }, markdown: { gap: spacing.sm, marginBottom: spacing.xl }, markdownText: { color: palette.ink, fontSize: 15, lineHeight: 23 }, markdownH2: { color: palette.ink, fontSize: 22, lineHeight: 27, fontWeight: "800", marginTop: spacing.lg }, markdownH3: { color: palette.ink, fontSize: 17, lineHeight: 22, fontWeight: "800", marginTop: spacing.md }, markdownBullet: { flexDirection: "row", gap: spacing.sm, paddingLeft: spacing.sm }, bulletDot: { color: palette.red, fontSize: 18, lineHeight: 23 }, attachmentRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, minHeight: 66, borderBottomWidth: 1, borderBottomColor: palette.line }, editorialList: { backgroundColor: palette.surface, borderRadius: radii.md, borderWidth: 1, borderColor: palette.line, overflow: "hidden", marginBottom: spacing.xl }, editorialBlock: { padding: spacing.md, gap: spacing.sm, borderBottomWidth: 1, borderBottomColor: palette.line }, editorialLink: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, editorialTitle: { color: palette.ink, fontSize: 16, lineHeight: 21, fontWeight: "800" }, updateList: { backgroundColor: palette.surface, borderRadius: radii.md, borderWidth: 1, borderColor: palette.line, overflow: "hidden", marginBottom: spacing.xl }, updateRow: { padding: spacing.md, borderBottomWidth: 1, borderBottomColor: palette.line },
  infoBlock: { borderTopWidth: 1, borderTopColor: palette.line, paddingVertical: spacing.md }, infoLabel: { color: palette.red, fontSize: 10, fontWeight: "900", letterSpacing: 1.1, textTransform: "uppercase", marginBottom: 5 }, infoValue: { color: palette.ink, fontSize: 15, lineHeight: 22 }, codeRow: { minHeight: 44, flexDirection: "row", gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: palette.line }, codeValue: { minWidth: 55, color: palette.red, fontSize: 15, fontWeight: "900" }, codeResultCode: { backgroundColor: palette.amberWash }, abbreviationResultCode: { backgroundColor: palette.greenWash }, abbreviationRow: { minHeight: 44, flexDirection: "row", gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: palette.line }, abbreviation: { width: 70, color: palette.red, fontWeight: "900", fontSize: 13 },
  doseCard: { backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line, borderRadius: radii.md, padding: spacing.lg, marginTop: spacing.lg, marginBottom: spacing.xl }, doseHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.md }, doseTitle: { color: palette.ink, fontSize: 16, fontWeight: "800" }, doseLabel: { color: palette.red, fontSize: 10, fontWeight: "900", letterSpacing: 1.1, marginTop: spacing.md, marginBottom: spacing.sm }, doseChoiceRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.sm }, doseChoice: { flex: 1, minWidth: 120, minHeight: 44, borderRadius: radii.sm, paddingVertical: 10, paddingHorizontal: spacing.sm, backgroundColor: palette.surfaceMuted, alignItems: "center", justifyContent: "center" }, doseChoiceActive: { backgroundColor: palette.ink }, doseChoiceText: { color: palette.inkMuted, fontSize: 11, fontWeight: "800", textAlign: "center" }, doseChoiceTextActive: { color: palette.white }, doseInputRow: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: palette.line, borderRadius: radii.sm, backgroundColor: palette.paper, minHeight: 48, paddingHorizontal: spacing.md }, doseInput: { flex: 1, color: palette.ink, fontSize: 17, paddingVertical: 8 }, doseInputStandalone: { borderWidth: 1, borderColor: palette.line, borderRadius: radii.sm, backgroundColor: palette.paper, minHeight: 48, paddingHorizontal: spacing.md, color: palette.ink, fontSize: 16, marginBottom: spacing.sm }, doseUnit: { color: palette.inkMuted, fontWeight: "800", fontSize: 12 }, doseUnitChoice: { minHeight: 44, borderRadius: radii.pill, paddingVertical: 7, paddingHorizontal: 11, backgroundColor: palette.surfaceMuted, justifyContent: "center" }, doseUnitChoiceActive: { backgroundColor: palette.ink }, doseUnitChoiceText: { color: palette.inkMuted, fontSize: 11, fontWeight: "800" }, doseUnitChoiceTextActive: { color: palette.white }, doseCheckRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 44 }, doseCheckText: { color: palette.ink, fontSize: 12, lineHeight: 17, flex: 1 }, doseCalculateButton: { backgroundColor: palette.redAction, borderRadius: radii.md, padding: spacing.md, alignItems: "center", marginTop: spacing.md }, doseResult: { backgroundColor: palette.greenWash, borderRadius: radii.sm, padding: spacing.md, marginTop: spacing.md }, doseResultLabel: { color: palette.green, fontSize: 10, fontWeight: "900", letterSpacing: 1.1 }, doseResultValue: { color: palette.ink, fontSize: 27, fontWeight: "900", marginVertical: 3 }, doseResultDetail: { color: palette.inkMuted, fontSize: 11, lineHeight: 16 }, doseWarning: { color: palette.ink, fontSize: 11, lineHeight: 16, marginTop: spacing.sm }, doseError: { flexDirection: "row", gap: spacing.sm, backgroundColor: palette.redWash, borderRadius: radii.sm, padding: spacing.md, marginTop: spacing.md }, doseErrorText: { color: palette.redDark, flex: 1, fontSize: 12, lineHeight: 17 }, doseUnavailable: { color: palette.ink, fontSize: 13, lineHeight: 18 }, doseDisclaimer: { color: palette.inkMuted, fontSize: 10, lineHeight: 15, marginTop: spacing.md },
  modal: { flex: 1, backgroundColor: palette.paper, padding: spacing.lg }, modalContent: { paddingBottom: spacing.xxl }, modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.xl }, modalTitle: { color: palette.ink, fontSize: 24, fontWeight: "800" }, modalKicker: { color: palette.red, fontSize: 10, fontWeight: "900", letterSpacing: 1.2, marginTop: 4 }, modalClose: { color: palette.red, fontWeight: "800", padding: spacing.sm }, settingsSectionTitle: { color: palette.ink, fontSize: 17, fontWeight: "800", marginTop: spacing.lg, marginBottom: spacing.sm }, settingsCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: palette.surface, borderColor: palette.line, borderWidth: 1, borderRadius: radii.md, padding: spacing.lg, marginBottom: spacing.sm }, recoveryActions: { backgroundColor: palette.amberWash, borderRadius: radii.md, padding: spacing.md, marginTop: spacing.sm }, recoveryButtons: { flexDirection: "row", gap: spacing.sm }, recoveryButton: { marginTop: spacing.sm, backgroundColor: palette.ink, borderRadius: radii.sm, paddingVertical: 10, paddingHorizontal: spacing.lg }, recoveryButtonText: { color: palette.white, fontSize: 12, fontWeight: "800" }, recoveryButtonSecondary: { marginTop: spacing.sm, borderColor: palette.ink, borderWidth: 1, borderRadius: radii.sm, paddingVertical: 10, paddingHorizontal: spacing.lg }, recoveryButtonSecondaryText: { color: palette.ink, fontSize: 12, fontWeight: "800" }, primaryButton: { backgroundColor: palette.redAction, borderRadius: radii.md, padding: spacing.lg, alignItems: "center", marginTop: spacing.md }, secondaryButton: { borderColor: palette.ink, borderWidth: 1, borderRadius: radii.md, padding: spacing.lg, alignItems: "center", marginTop: spacing.sm }, secondaryButtonText: { color: palette.ink, fontWeight: "800", fontSize: 14 }, locationDetailBlock: { backgroundColor: palette.surfaceMuted, borderRadius: radii.md, padding: spacing.md, marginTop: spacing.lg }, disabledButton: { opacity: 0.55 }, primaryButtonText: { color: palette.white, fontWeight: "800", fontSize: 14 }, appearanceControl: { flexDirection: "row", backgroundColor: palette.surfaceMuted, borderRadius: radii.md, padding: 4, gap: 4 }, appearanceControlStacked: { flexDirection: "column" }, appearanceOption: { flex: 1, minHeight: 45, borderRadius: radii.sm, alignItems: "center", justifyContent: "center", gap: 3 }, appearanceOptionActive: { backgroundColor: palette.ink }, appearanceText: { color: palette.inkMuted, fontSize: 11, fontWeight: "800" }, appearanceTextActive: { color: palette.white }, infoPanel: { backgroundColor: palette.redWash, padding: spacing.lg, borderRadius: radii.md }, infoPanelTitle: { color: palette.redDark, fontWeight: "900", fontSize: 14, marginBottom: spacing.sm }, infoPanelText: { color: palette.redDark, fontSize: 13, lineHeight: 19 }, linkRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: spacing.lg, borderBottomWidth: 1, borderBottomColor: palette.line }, linkText: { color: palette.red, fontSize: 13, fontWeight: "800" }, legalText: { color: palette.inkMuted, fontSize: 11, lineHeight: 16, marginTop: spacing.lg }, modalBackdrop: { flex: 1, backgroundColor: "rgba(19,35,61,0.35)", justifyContent: "flex-end" }, locationSheet: { backgroundColor: palette.paper, padding: spacing.xl, borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg }, sheetHandle: { width: 42, height: 5, borderRadius: 3, backgroundColor: palette.line, alignSelf: "center", marginBottom: spacing.xl }, sheetTitle: { color: palette.ink, fontSize: 24, lineHeight: 28, fontWeight: "800", marginBottom: spacing.sm },
  launchScreen: { flex: 1, backgroundColor: palette.ink, alignItems: "center", justifyContent: "center" }, launchTitle: { color: palette.white, fontSize: 30, fontWeight: "900", letterSpacing: -0.8, marginTop: spacing.lg }, launchSubtitle: { color: "#B8C4D7", fontSize: 10, fontWeight: "900", letterSpacing: 1.2, marginTop: spacing.sm }, disclosureScreen: { flex: 1, backgroundColor: palette.paper, padding: spacing.lg, justifyContent: "space-between" }, disclosureContent: { alignItems: "flex-start", paddingTop: spacing.xxl }, disclosureEyebrow: { color: palette.red, fontSize: 10, fontWeight: "900", letterSpacing: 1.3, marginTop: spacing.xxl, marginBottom: spacing.md }, disclosureTitle: { color: palette.ink, fontSize: 30, lineHeight: 35, fontWeight: "900", letterSpacing: -0.8, marginBottom: spacing.lg }, disclosureBody: { color: palette.ink, fontSize: 16, lineHeight: 23, marginBottom: spacing.md }, disclosureFooter: { color: palette.inkMuted, fontSize: 11, lineHeight: 16, textAlign: "center", marginTop: spacing.md, marginBottom: spacing.sm },
  tabBar: { height: Platform.OS === "ios" ? 84 : 64, paddingTop: 7, paddingBottom: Platform.OS === "ios" ? 20 : 7, backgroundColor: palette.surface, borderTopColor: palette.line }, tabBarTablet: { maxWidth: 720, alignSelf: "center", width: "100%" }, tabBarLargeFont: { height: Platform.OS === "ios" ? 104 : 84, paddingBottom: Platform.OS === "ios" ? 28 : 12 }, tabLabel: { fontSize: 10, fontWeight: "700" }, tabLabelLarge: { fontSize: 12 },
  });
}

let styles = createStyles(colors);

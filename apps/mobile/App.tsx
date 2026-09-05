import { MaterialCommunityIcons } from "@expo/vector-icons";
import { NavigationContainer, type NavigatorScreenParams } from "@react-navigation/native";
import { createBottomTabNavigator, type BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator, type NativeStackScreenProps } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import * as ExpoLocation from "expo-location";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type DimensionValue,
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

function LogoMark({ small = false }: { small?: boolean }) {
  return (
    <View style={[styles.logoMark, small && styles.logoMarkSmall]} accessible accessibilityLabel="Pulso abierto">
      <View style={[styles.logoCrossVertical, small && styles.logoSmallBar]} />
      <View style={[styles.logoCrossHorizontal, small && styles.logoSmallHorizontal]} />
      <View style={[styles.logoArrow, small && styles.logoArrowSmall]} />
    </View>
  );
}

function BrandHeader({ onSettings }: { onSettings?: () => void }) {
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
        <Pressable onPress={onSettings} style={styles.iconButton} accessibilityRole="button" accessibilityLabel="Ajustes">
          <MaterialCommunityIcons name="tune-variant" size={21} color={colors.ink} />
        </Pressable>
      )}
    </View>
  );
}

function SearchBar({ value, onChangeText, onPress }: { value?: string; onChangeText?: (value: string) => void; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.searchBar} accessibilityRole={onChangeText ? "none" : "button"} accessibilityLabel="Buscar en el manual">
      <MaterialCommunityIcons name="magnify" size={22} color={colors.inkMuted} />
      {onChangeText ? <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder="Buscar procedimientos, fármacos o códigos"
          placeholderTextColor={colors.inkMuted}
          style={styles.searchInput}
          returnKeyType="search"
          accessibilityLabel="Buscar procedimientos, fármacos o códigos"
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
      {action && <Pressable onPress={onAction} accessibilityRole="button"><Text style={styles.sectionAction}>{action}</Text></Pressable>}
    </View>
  );
}

function ActionCard({ icon, label, detail, tone = "red", onPress }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; detail: string; tone?: "red" | "navy" | "amber" | "green"; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.actionCard, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={`${label}. ${detail}`}>
      <View style={[styles.actionIcon, tone === "navy" && styles.actionIconNavy, tone === "amber" && styles.actionIconAmber, tone === "green" && styles.actionIconGreen]}>
        <MaterialCommunityIcons name={icon} size={22} color={tone === "red" ? colors.red : tone === "navy" ? colors.ink : tone === "amber" ? colors.amber : colors.green} />
      </View>
      <Text style={styles.actionLabel}>{label}</Text>
      <Text style={styles.actionDetail}>{detail}</Text>
    </Pressable>
  );
}

function ProcedureRow({ procedure, onPress, showFavorite = false }: { procedure: MobileProcedure; onPress: () => void; showFavorite?: boolean }) {
  const { favorites, toggleFavorite } = useContent();
  const favorite = favorites.includes(procedure.id);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.resourceRow, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={`${procedure.id}, ${procedure.title}`}>
      <View style={styles.resourceCode}><Text style={styles.resourceCodeText}>{procedure.id}</Text></View>
      <View style={styles.resourceCopy}>
        <Text style={styles.resourceTitle} numberOfLines={2}>{procedure.title}</Text>
        <Text style={styles.resourceMeta}>{procedure.section} · {procedure.attachments.length ? `${procedure.attachments.length} anexos` : "consulta offline"}</Text>
      </View>
      {showFavorite && <Pressable onPress={() => toggleFavorite(procedure.id)} hitSlop={12} accessibilityRole="button" accessibilityLabel={favorite ? "Quitar de guardados" : "Guardar procedimiento"}>
        <MaterialCommunityIcons name={favorite ? "star" : "star-outline"} size={22} color={favorite ? colors.amber : colors.inkMuted} />
      </Pressable>}
      <MaterialCommunityIcons name="chevron-right" size={20} color={colors.inkMuted} />
    </Pressable>
  );
}

type SyncPresentation = { title: string; detail: string; icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"]; color: string };

function syncPresentation(state: ReturnType<typeof useContent>["syncState"], freshness: ContentFreshness, progress: ReturnType<typeof useContent>["syncProgress"], stagedHash?: string): SyncPresentation {
  const progressText = progress.totalBytes && progress.downloadedBytes !== undefined
    ? `${Math.round((progress.downloadedBytes / progress.totalBytes) * 100)}% en curso`
    : "paquete verificado";
  if (state === "checking" || state === "downloading" || state === "validating" || state === "activating") return { title: "Actualizando contenido", detail: progressText, icon: "cloud-sync-outline", color: colors.green };
  if (state === "success") return { title: "Contenido actualizado", detail: "última activación correcta", icon: "cloud-check-outline", color: colors.green };
  if (state === "failure") return { title: "Actualización no aplicada", detail: stagedHash ? "paquete pendiente; contenido anterior intacto" : "contenido anterior intacto", icon: "cloud-alert-outline", color: colors.red };
  if (state === "recovery") return { title: "Actualización pendiente", detail: stagedHash ? `recuperable · ${stagedHash.slice(0, 8)}` : "recuperación disponible", icon: "history", color: colors.amber };
  if (state === "offline") return { title: "Modo offline", detail: "se mantiene el último contenido", icon: "cloud-off-outline", color: colors.amber };
  if (freshness !== "fresh" || state === "stale") return { title: "Contenido local desactualizado", detail: "revisa cuando tengas conexión", icon: "clock-alert-outline", color: colors.amber };
  return { title: "Contenido disponible offline", detail: "hash verificado", icon: "database-check-outline", color: colors.green };
}

function HomeScreen({ navigation }: BottomTabScreenProps<TabsParamList, "Inicio">) {
  const { content, recents, snapshot, isRefreshing, lastError, refresh, cancelRefresh, syncState, syncProgress, stagedPackage, resumeStaged, discardStaged } = useContent();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const recentProcedures = recents.map((id) => findProcedure(content, id)).filter((item): item is MobileProcedure => Boolean(item)).slice(0, 3);
  const manualVersion = typeof content.manual.manualVersionCurrent === "string" ? content.manual.manualVersionCurrent : "paquete local";
  const freshness = contentFreshness(snapshot.generatedAt);
  const syncCopy = syncPresentation(syncState, freshness, syncProgress, stagedPackage?.packageHash);

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <BrandHeader onSettings={() => setSettingsOpen(true)} />
        <View style={styles.hero}>
          <View style={styles.heroCopy}>
            <Text style={styles.heroEyebrow}>TODO A MANO · SIN COBERTURA</Text>
            <Text style={styles.heroTitle}>La referencia que{`\n`}te acompaña.</Text>
            <Text style={styles.heroBody}>Procedimientos, medicación y comunicaciones listos para consulta en guardia.</Text>
          </View>
          <LogoMark />
        </View>
        <SearchBar onPress={() => navigation.navigate("Buscar")} />

        <SectionHeading eyebrow="ACCESOS RÁPIDOS" title="Consulta por recurso" />
        <View style={styles.actionGrid}>
          <ActionCard icon="clipboard-text-outline" label="Procedimientos" detail={`${content.procedures.length} fichas`} onPress={() => navigation.navigate("Buscar")} />
          <ActionCard icon="pill" label="Vademécum" detail={`${content.drugs.length} fármacos`} tone="navy" onPress={() => navigation.navigate("Buscar")} />
          <ActionCard icon="radio-handheld" label="Códigos" detail="Radio y claves" tone="amber" onPress={() => navigation.getParent()?.navigate("Codes")} />
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
          {isRefreshing ? <Pressable onPress={cancelRefresh} disabled={syncState === "activating"} accessibilityRole="button" accessibilityLabel={syncState === "activating" ? "Aplicando actualización" : "Cancelar actualización"}><Text style={styles.syncAction}>{syncState === "activating" ? "Aplicando…" : "Cancelar"}</Text></Pressable> : <Pressable onPress={() => void refresh()} accessibilityRole="button" accessibilityLabel="Actualizar contenido"><Text style={styles.syncAction}>Actualizar</Text></Pressable>}
        </View>
        <Text style={styles.disclaimer}>Pulso abierto es una adaptación independiente y no oficial. Consulta siempre la fuente operativa vigente.</Text>
      </ScrollView>
      <SettingsModal visible={settingsOpen} onClose={() => setSettingsOpen(false)} onRefresh={refresh} onCancelRefresh={cancelRefresh} onResumeStaged={resumeStaged} onDiscardStaged={discardStaged} onOpenAbbreviations={() => { setSettingsOpen(false); navigation.getParent()?.navigate("Abbreviations"); }} generatedAt={snapshot.generatedAt} packageHash={snapshot.packageHash} isRefreshing={isRefreshing} lastError={lastError} syncState={syncState} syncProgress={syncProgress} stagedPackage={stagedPackage} />
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
        {(["Todo", "Procedimientos", "Vademécum", "Códigos"] as const).map((item) => <Pressable key={item} onPress={() => setFilter(item)} style={[styles.filterChip, filter === item && styles.filterChipActive]} accessibilityRole="tab" accessibilityState={{ selected: filter === item }}><Text style={[styles.filterText, filter === item && styles.filterTextActive]}>{item}</Text></Pressable>)}
      </View>
      {(filter === "Todo" || filter === "Vademécum") && <View style={styles.filterRow} accessibilityRole="tablist">
        {(["Todos", "Fármacos", "Comerciales", "Perfusiones", "Fluidos"] as const).map((item) => <Pressable key={item} onPress={() => { setFilter("Vademécum"); setVademecumCategory(item); }} style={[styles.filterChip, vademecumCategory === item && filter === "Vademécum" && styles.filterChipActive]} accessibilityRole="tab" accessibilityState={{ selected: vademecumCategory === item && filter === "Vademécum" }}><Text style={[styles.filterText, vademecumCategory === item && filter === "Vademécum" && styles.filterTextActive]}>{item}</Text></Pressable>)}
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
  const icon = reference.kind === "code" ? "radio-handheld" : reference.kind === "abbreviation" ? "format-letter-case" : "pill";
  const targetId = reference.targetId;
  const onPress = reference.kind === "code" ? () => onCode(reference.routeKey) : reference.kind === "drug" && targetId ? () => onDrug(targetId) : () => onVademecum(reference.routeKey);
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.resourceRow, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={`${reference.title}. ${reference.subtitle}`}>
    <View style={[styles.resourceCode, reference.kind === "code" ? styles.codeResultCode : reference.kind === "abbreviation" ? styles.abbreviationResultCode : styles.drugCode]}><MaterialCommunityIcons name={icon} size={17} color={colors.ink} /></View>
    <View style={styles.resourceCopy}><Text style={styles.resourceTitle} numberOfLines={2}>{reference.title}</Text><Text style={styles.resourceMeta}>{reference.badge ? `${reference.badge} · ` : ""}{reference.subtitle}</Text></View>
    <MaterialCommunityIcons name="chevron-right" size={20} color={colors.inkMuted} />
  </Pressable>;
}

function DrugRow({ drug, onPress }: { drug: Record<string, unknown>; onPress: () => void }) {
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.resourceRow, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={`Fármaco ${String(drug.name ?? "sin nombre")}`}>
    <View style={[styles.resourceCode, styles.drugCode]}><MaterialCommunityIcons name="pill" size={17} color={colors.ink} /></View>
    <View style={styles.resourceCopy}><Text style={styles.resourceTitle} numberOfLines={2}>{String(drug.name ?? "Fármaco")}</Text><Text style={styles.resourceMeta}>{String(drug.category ?? "Vademécum")} · {String(drug.presentation ?? "")}</Text></View>
    <MaterialCommunityIcons name="chevron-right" size={20} color={colors.inkMuted} />
  </Pressable>;
}

function SavedScreen({ navigation }: BottomTabScreenProps<TabsParamList, "Guardados">) {
  const { content, favorites, recents } = useContent();
  const saved = favorites.map((id) => findProcedure(content, id)).filter((item): item is MobileProcedure => Boolean(item));
  const recent = recents.map((id) => findProcedure(content, id)).filter((item): item is MobileProcedure => Boolean(item));
  return <SafeAreaView style={styles.screen} edges={["top"]}><ScrollView contentContainerStyle={styles.scrollContent}>
    <View style={styles.searchScreenHeader}><Text style={styles.pageTitle}>Guardados</Text><Text style={styles.pageKicker}>TU TURNO</Text></View>
    <SectionHeading eyebrow="ACCESO DIRECTO" title="Favoritos" />
    {saved.length ? <View style={styles.cardList}>{saved.map((item) => <ProcedureRow key={item.id} procedure={item} showFavorite onPress={() => navigation.getParent()?.navigate("Procedure", { id: item.id })} />)}</View> : <EmptyState title="Aún no hay favoritos" detail="Guarda una ficha con la estrella para encontrarla aquí." />}
    <SectionHeading eyebrow="HISTORIAL LOCAL" title="Recientes" />
    {recent.length ? <View style={styles.cardList}>{recent.map((item) => <ProcedureRow key={item.id} procedure={item} onPress={() => navigation.getParent()?.navigate("Procedure", { id: item.id })} />)}</View> : <EmptyState title="Sin historial" detail="Las fichas que consultes aparecerán aquí durante tu sesión." />}
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
    <View style={styles.locationPolicyNotice} accessibilityLabel="Estado de la fuente de ubicaciones"><MaterialCommunityIcons name="clock-alert-outline" size={20} color={colors.amber} /><Text style={styles.sourceNoticeText}>Fuente empaquetada {policy.sourceDate} · pendiente de aprobación y congelación operativa. El directorio funciona sin red.</Text></View>
    <View style={styles.searchPadding}><SearchBar value={query} onChangeText={setQuery} /></View>
    <View style={styles.filterRow} accessibilityRole="tablist">
      {(["all", "hospital", "base"] as const).map((item) => <Pressable key={item} onPress={() => setFilter(item)} style={[styles.filterChip, filter === item && styles.filterChipActive]} accessibilityRole="tab" accessibilityState={{ selected: filter === item }}><Text style={[styles.filterText, filter === item && styles.filterTextActive]}>{item === "all" ? "Todos" : item === "hospital" ? "Hospitales" : "Bases"}</Text></Pressable>)}
    </View>
    <View style={styles.locationActions}>
      <Pressable onPress={() => void requestLocation()} disabled={permission === "requesting"} style={styles.locationActionButton} accessibilityRole="button" accessibilityLabel="Usar mi ubicación para ordenar lugares cercanos"><MaterialCommunityIcons name="crosshairs-gps" size={18} color={colors.white} /><Text style={styles.locationActionText}>{permission === "requesting" ? "Solicitando…" : "Usar mi ubicación"}</Text></Pressable>
      {origin && filter === "all" && <View style={styles.nearestToggle} accessibilityRole="radiogroup" accessibilityLabel="Tipo de punto para cercanía">{(["hospital", "base"] as const).map((item) => <Pressable key={item} onPress={() => setNearestKind(item)} style={[styles.nearestChoice, nearestKind === item && styles.nearestChoiceActive]} accessibilityRole="radio" accessibilityState={{ selected: nearestKind === item }}><Text style={[styles.nearestChoiceText, nearestKind === item && styles.nearestChoiceTextActive]}>{item === "hospital" ? "Hospitales cercanos" : "Bases cercanas"}</Text></Pressable>)}</View>}
    </View>
    {permission === "denied" && <View style={styles.locationFallback} accessibilityLiveRegion="polite"><MaterialCommunityIcons name="map-marker-off-outline" size={20} color={colors.amber} /><Text style={styles.locationFallbackText}>Permiso de ubicación denegado. El directorio y la Vista accesible siguen disponibles; puedes abrir un punto en Mapas.</Text></View>}
    {permission === "unavailable" && <View style={styles.locationFallback}><MaterialCommunityIcons name="crosshairs-off" size={20} color={colors.amber} /><Text style={styles.locationFallbackText}>La ubicación no está disponible en este dispositivo. El directorio local no necesita permiso.</Text></View>}
    <View style={styles.mapLegend}><View style={styles.mapLegendDot} /><Text style={styles.mapLegendText}>Esquema local · sin cartografía, rutas ni tiempos de viaje</Text></View>
    <View style={styles.schematicMap} accessible accessibilityLabel={"Esquema offline con " + schematic.length + " puntos; consulta también la Vista accesible"}>
      <View style={styles.mapRoadOne} /><View style={styles.mapRoadTwo} /><View style={styles.mapRoadThree} />
      {schematic.map((item, index) => <Pressable key={item.kind + "-" + item.id} onPress={() => navigation.getParent()?.navigate("Location", { routeKey: locationRouteKey(item) })} style={[styles.mapPin, item.kind === "hospital" ? styles.mapPinRed : styles.mapPinNavy, { left: mapPercent(8 + ((index * 31) % 82)), top: mapPercent(10 + ((index * 47) % 75)) }]} accessibilityRole="button" accessibilityLabel={(item.kind === "hospital" ? "Hospital " : "Base ") + item.name}><MaterialCommunityIcons name={item.kind === "hospital" ? "hospital-building" : "ambulance"} size={13} color={colors.white} /></Pressable>)}
      <View style={styles.mapCompass}><Text style={styles.mapCompassN}>N</Text><MaterialCommunityIcons name="navigation" size={18} color={colors.red} /></View>
    </View>
    <SectionHeading eyebrow={String(displayLocations.length) + " PUNTOS LOCALES"} title={origin ? (activeNearestKind === "hospital" ? "Hospitales más cercanos" : "Bases más cercanas") : "Bases y hospitales"} />
    <View style={styles.accessibleEquivalent} accessible accessibilityLabel="Vista accesible del esquema y directorio"><Text style={styles.accessibleEquivalentTitle}>Vista accesible</Text><Text style={styles.accessibleEquivalentCopy}>La lista siguiente contiene los mismos puntos, nombres, direcciones, identificadores y fechas que el esquema.</Text></View>
    <View style={styles.cardList}>{displayLocations.map((item) => <Pressable key={item.kind + "-" + item.id} onPress={() => navigation.getParent()?.navigate("Location", { routeKey: locationRouteKey(item) })} style={styles.locationRow} accessibilityRole="button" accessibilityLabel={(item.kind === "hospital" ? "Hospital " : "Base ") + item.name + ". " + item.address + ", " + item.district + ". " + locationFreshnessLabel(item, new Date(), policy) + (formatDistance(item.distanceMeters) ? ". " + formatDistance(item.distanceMeters) : "")}><View style={[styles.locationIcon, item.kind === "base" && styles.locationIconBase]}><MaterialCommunityIcons name={item.kind === "hospital" ? "hospital-building" : "ambulance"} size={18} color={colors.ink} /></View><View style={styles.resourceCopy}><Text style={styles.resourceTitle}>{item.shortName}</Text><Text style={styles.resourceMeta}>{item.kind === "hospital" ? "Hospital" : "Base"} · {item.district} · {item.id}</Text><Text style={styles.locationAddress}>{item.address}</Text>{formatDistance(item.distanceMeters) && <Text style={styles.locationDistance}>{formatDistance(item.distanceMeters)}</Text>}<Text style={styles.locationFreshness}>{locationFreshnessLabel(item, new Date(), policy)}</Text></View><MaterialCommunityIcons name="chevron-right" size={20} color={colors.inkMuted} /></Pressable>)}</View>
    <Text style={styles.mapNote}>Selecciona un punto para ver su ficha y transferirlo a la aplicación Mapas del dispositivo. No se calculan rutas ni tiempos de viaje dentro de Pulso abierto.</Text>
  </ScrollView></SafeAreaView>;
}

function LocationDetailScreen({ route, navigation }: NativeStackScreenProps<RootStackParamList, "Location">) {
  const { content } = useContent();
  const policy = locationSourcePolicy;
  const locations = useMemo(() => locationRecords(content, policy), [content, policy]);
  const location = resolveLocationRoute(locations, route.params.routeKey);
  if (!location) return <MissingResource title="Punto no disponible" detail="La ruta de ubicación no coincide con el paquete local actual. Vuelve al directorio para consultar otro punto." onRecover={() => navigation.goBack()} />;
  const openMaps = () => { void Linking.openURL(platformMapsUrl(location, Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : "web")); };
  return <SafeAreaView style={styles.screen} edges={["top"]}><ScrollView contentContainerStyle={styles.detailContent}>
    <View style={styles.detailTopbar}><Pressable onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Volver"><MaterialCommunityIcons name="arrow-left" size={24} color={colors.ink} /></Pressable><Text style={styles.detailTopbarLabel}>{location.kind === "hospital" ? "HOSPITAL" : "BASE"} · OFFLINE</Text><View style={{ width: 24 }} /></View>
    <Text style={styles.detailSection}>{location.kind === "hospital" ? "HOSPITAL" : "BASE"}</Text><Text style={styles.detailTitle}>{location.shortName}</Text><Text style={styles.detailMeta}>{location.name} · {location.address} · {location.district}</Text>
    <View style={styles.sourceNotice} accessibilityLabel="Fuente y frescura de la ubicación"><MaterialCommunityIcons name="clock-alert-outline" size={19} color={colors.amber} /><Text style={styles.sourceNoticeText}>{locationFreshnessLabel(location, new Date(), policy)}. No es una fuente operativa congelada.</Text></View>
    <View style={styles.infoBlock}><Text style={styles.infoLabel}>Identificador estable</Text><Text style={styles.infoValue}>{locationFavoriteId(location)}</Text></View>
    <View style={styles.infoBlock}><Text style={styles.infoLabel}>Coordenadas</Text><Text style={styles.infoValue}>{location.lat.toFixed(5)}, {location.lng.toFixed(5)} · solo distancia geométrica</Text></View>
    <Pressable onPress={openMaps} style={styles.primaryButton} accessibilityRole="link" accessibilityLabel={"Abrir " + location.name + " en Mapas"}><Text style={styles.primaryButtonText}>Abrir en Mapas</Text></Pressable>
    <Text style={styles.mapNote}>Se transfiere el punto a la aplicación Mapas del sistema. Pulso abierto no incorpora webviews, rutas ni tiempos de viaje.</Text>
  </ScrollView></SafeAreaView>;
}

function ProcedureScreen({ route, navigation }: NativeStackScreenProps<RootStackParamList, "Procedure">) {
  const { content, favorites, toggleFavorite, remember } = useContent();
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
    if (procedure) remember(procedure.id);
  }, [procedure, remember]);
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
  const favorite = favorites.includes(procedure.id);
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
    <View style={styles.detailTopbar}><Pressable onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Volver"><MaterialCommunityIcons name="arrow-left" size={24} color={colors.ink} /></Pressable><Text style={styles.detailTopbarLabel}>PROCEDIMIENTO {procedure.id}</Text><Pressable onPress={() => toggleFavorite(procedure.id)} accessibilityRole="button" accessibilityLabel={favorite ? "Quitar de favoritos" : "Guardar en favoritos"}><MaterialCommunityIcons name={favorite ? "star" : "star-outline"} size={25} color={favorite ? colors.amber : colors.ink} /></Pressable></View>
    <Text style={styles.detailSection}>{procedure.section.toUpperCase()}</Text><Text style={styles.detailTitle}>{procedure.title}</Text><Text style={styles.detailMeta}>Actualizado {procedure.updated || "sin fecha"} · {procedure.attachments.length} anexos</Text>
    <View style={styles.sourceNotice}><MaterialCommunityIcons name="information-outline" size={19} color={colors.red} /><Text style={styles.sourceNoticeText}>Consulta de referencia. Confirma siempre la versión operativa vigente.</Text></View>
    {headings.length > 0 && <View style={styles.contentsCard} accessibilityLabel="Contenido del procedimiento"><Text style={styles.contentsTitle}>CONTENIDO</Text>{headings.map((heading) => <Pressable key={heading.id} onPress={() => { const offset = sectionOffsets.current[heading.id]; if (typeof offset === "number") scrollRef.current?.scrollTo({ y: Math.max(0, offset - spacing.md), animated: true }); }} style={styles.contentsRow} accessibilityRole="button" accessibilityLabel={`Ir a ${heading.text}`}><Text style={[styles.contentsText, heading.level > 2 && styles.contentsTextNested]}>{heading.text}</Text><MaterialCommunityIcons name="chevron-down" size={16} color={colors.inkMuted} /></Pressable>)}</View>}
    <MarkdownContent sections={sections} onContainerLayout={(offset) => { markdownOrigin.current = offset; }} onSectionLayout={(id, offset) => { sectionOffsets.current[id] = markdownOrigin.current + offset; }} />
    <ProcedureEditorialBlocks blocks={procedure.editorialBlocks} onProcedure={(id) => navigation.push("Procedure", { id })} />
    {related.length > 0 && <><SectionHeading eyebrow="CONTEXTO DEL MANUAL" title="Referencias relacionadas" /><View style={styles.cardList}>{related.map((item) => <ProcedureRow key={`related-${item.id}`} procedure={item} onPress={() => navigation.push("Procedure", { id: item.id })} />)}</View></>}
    {unresolvedRelatedIds.length > 0 && <View style={styles.sourceNotice}><MaterialCommunityIcons name="link-variant-off" size={19} color={colors.red} /><Text style={styles.sourceNoticeText}>Algunas referencias ({unresolvedRelatedIds.join(", ")}) no están incluidas en este paquete local.</Text></View>}
    {procedure.updates.length > 0 && <><SectionHeading eyebrow="HISTORIAL EDITORIAL" title="Actualizaciones" /><View style={styles.updateList}>{procedure.updates.map((update, index) => <ProcedureUpdate key={index} update={update} />)}</View></>}
    {procedure.attachments.length > 0 && <><SectionHeading eyebrow="MATERIAL OFICIAL" title="Anexos" />{attachmentError && <View style={styles.sourceNotice}><MaterialCommunityIcons name="alert-circle-outline" size={19} color={colors.red} /><View style={styles.resourceCopy}><Text style={styles.sourceNoticeText}>{attachmentError}</Text>{attachmentRecovery && <Pressable onPress={() => void Linking.openURL(attachmentRecovery.sourceUrl)} accessibilityRole="link"><Text style={styles.sourceRecoveryLink}>Abrir fuente oficial</Text></Pressable>}</View></View>}<View style={styles.cardList}>{procedure.attachments.map((attachment) => { const record = attachmentRecords[attachment.id]; const status = record?.status ?? "not-downloaded"; const isActive = activeAttachmentId === attachment.id; const canOpen = isLocallyAvailable(record, attachment) && Boolean(record?.localUri); return <Pressable key={attachment.id} onPress={() => void openAttachment(attachment)} style={styles.attachmentRow} accessibilityRole="button" accessibilityLabel={`${canOpen ? "Abrir" : status === "downloading" ? "Cancelar descarga de" : "Descargar"} anexo ${attachment.filename}`}><MaterialCommunityIcons name={attachment.kind === "pdf" ? "file-pdf-box" : "image-outline"} size={23} color={colors.red} /><View style={styles.resourceCopy}><Text style={styles.resourceTitle} numberOfLines={2}>{attachment.filename}</Text><Text style={styles.resourceMeta}>{attachment.kind.toUpperCase()} · {isActive ? "descargando…" : canOpen ? attachmentStatusLabel("available") : attachmentStatusLabel(status)}</Text></View><MaterialCommunityIcons name={canOpen ? "open-in-new" : status === "downloading" ? "close-circle-outline" : status === "failed" || status === "cancelled" ? "refresh" : "download-outline"} size={18} color={colors.inkMuted} /></Pressable>; })}</View></>}
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
    return <View style={styles.doseCard} accessibilityLabel="Conversión de dosis no disponible"><View style={styles.doseHeader}><MaterialCommunityIcons name="calculator-variant-outline" size={22} color={colors.inkMuted} /><View style={styles.resourceCopy}><Text style={styles.doseTitle}>Conversión de dosis</Text><Text style={styles.resourceMeta}>No disponible para esta ficha</Text></View></View><Text style={styles.doseUnavailable}>{eligibility.reason ?? "Solo se calculan presentaciones estructuradas y aprobadas."}</Text><Text style={styles.doseDisclaimer}>No se interpreta ni transforma la dosis publicada en texto libre.</Text></View>;
  }

  return <View style={styles.doseCard} accessibilityLabel="Conversión de dosis local">
    <View style={styles.doseHeader}><MaterialCommunityIcons name="calculator-variant-outline" size={22} color={colors.red} /><View style={styles.resourceCopy}><Text style={styles.doseTitle}>Conversión de dosis</Text><Text style={styles.resourceMeta}>Cálculo local, sin guardar ni compartir</Text></View></View>
    <Text style={styles.doseLabel}>OPERACIÓN</Text>
    <View style={styles.doseChoiceRow} accessibilityRole="tablist">
      {(["amount-to-volume", "dose-rate-to-pump-rate"] as const).map((item) => <Pressable key={item} onPress={() => { setOperation(item); setResult(undefined); }} style={[styles.doseChoice, operation === item && styles.doseChoiceActive]} accessibilityRole="tab" accessibilityState={{ selected: operation === item }}><Text style={[styles.doseChoiceText, operation === item && styles.doseChoiceTextActive]}>{item === "amount-to-volume" ? "Cantidad → volumen" : "Dosis → bomba"}</Text></Pressable>)}
    </View>
    {operation === "amount-to-volume" ? <><Text style={styles.doseLabel}>CANTIDAD DE DOSIS</Text><View style={styles.doseInputRow}><TextInput value={amount} onChangeText={(value) => { setAmount(value); setResult(undefined); }} style={styles.doseInput} keyboardType="decimal-pad" accessibilityLabel="Cantidad de dosis"/><Text style={styles.doseUnit}>{amountUnit}</Text></View><View style={styles.doseChoiceRow}>{["mg", "g", "mcg", "mEq", "UI"].map((item) => <Pressable key={item} onPress={() => setAmountUnit(item)} style={[styles.doseUnitChoice, amountUnit === item && styles.doseUnitChoiceActive]} accessibilityRole="button"><Text style={[styles.doseUnitChoiceText, amountUnit === item && styles.doseUnitChoiceTextActive]}>{item}</Text></Pressable>)}</View></> : <><Text style={styles.doseLabel}>DOSIS POR TIEMPO</Text><View style={styles.doseInputRow}><TextInput value={doseRate} onChangeText={(value) => { setDoseRate(value); setResult(undefined); }} style={styles.doseInput} keyboardType="decimal-pad" accessibilityLabel="Dosis por tiempo"/><Text style={styles.doseUnit}>{doseRateUnit} / {timeUnit}</Text></View><View style={styles.doseChoiceRow}>{["mg", "g", "mcg", "mEq", "UI"].map((item) => <Pressable key={item} onPress={() => setDoseRateUnit(item)} style={[styles.doseUnitChoice, doseRateUnit === item && styles.doseUnitChoiceActive]} accessibilityRole="button"><Text style={[styles.doseUnitChoiceText, doseRateUnit === item && styles.doseUnitChoiceTextActive]}>{item}</Text></Pressable>)}{["min", "h", "day"].map((item) => <Pressable key={item} onPress={() => setTimeUnit(item)} style={[styles.doseUnitChoice, timeUnit === item && styles.doseUnitChoiceActive]} accessibilityRole="button"><Text style={[styles.doseUnitChoiceText, timeUnit === item && styles.doseUnitChoiceTextActive]}>{item}</Text></Pressable>)}</View><Pressable onPress={() => { setPerKg((value) => !value); setResult(undefined); }} style={styles.doseCheckRow} accessibilityRole="checkbox" accessibilityState={{ checked: perKg }}><MaterialCommunityIcons name={perKg ? "checkbox-marked" : "checkbox-blank-outline"} size={20} color={perKg ? colors.red : colors.inkMuted} /><Text style={styles.doseCheckText}>Dosis por kg de peso</Text></Pressable>{perKg && <TextInput value={weightKg} onChangeText={(value) => { setWeightKg(value); setResult(undefined); }} style={styles.doseInputStandalone} keyboardType="decimal-pad" placeholder="Peso (kg)" placeholderTextColor={colors.inkMuted} accessibilityLabel="Peso en kilogramos"/>}</>}
    <Text style={styles.doseLabel}>VÍA PUBLICADA</Text>
    <View style={styles.doseChoiceRow}>{routes.map((item) => <Pressable key={item} onPress={() => { setEnteredRoute(item); setRouteConfirmed(false); setResult(undefined); }} style={[styles.doseUnitChoice, enteredRoute === item && styles.doseUnitChoiceActive]} accessibilityRole="button"><Text style={[styles.doseUnitChoiceText, enteredRoute === item && styles.doseUnitChoiceTextActive]}>{item}</Text></Pressable>)}</View>
    <Pressable onPress={() => { setPresentationConfirmed((value) => !value); setResult(undefined); }} style={styles.doseCheckRow} accessibilityRole="checkbox" accessibilityState={{ checked: presentationConfirmed }}><MaterialCommunityIcons name={presentationConfirmed ? "checkbox-marked" : "checkbox-blank-outline"} size={20} color={presentationConfirmed ? colors.red : colors.inkMuted} /><Text style={styles.doseCheckText}>Confirmo la presentación publicada</Text></Pressable>
    <Pressable onPress={() => { setRouteConfirmed((value) => !value); setResult(undefined); }} style={styles.doseCheckRow} accessibilityRole="checkbox" accessibilityState={{ checked: routeConfirmed }}><MaterialCommunityIcons name={routeConfirmed ? "checkbox-marked" : "checkbox-blank-outline"} size={20} color={routeConfirmed ? colors.red : colors.inkMuted} /><Text style={styles.doseCheckText}>Confirmo la vía seleccionada</Text></Pressable>
    <Pressable onPress={() => { setSourceConfirmed((value) => !value); setResult(undefined); }} style={styles.doseCheckRow} accessibilityRole="checkbox" accessibilityState={{ checked: sourceConfirmed }}><MaterialCommunityIcons name={sourceConfirmed ? "checkbox-marked" : "checkbox-blank-outline"} size={20} color={sourceConfirmed ? colors.red : colors.inkMuted} /><Text style={styles.doseCheckText}>Confirmo la fuente clínica y su revisión</Text></Pressable>
    <Pressable onPress={calculate} style={styles.doseCalculateButton} accessibilityRole="button" accessibilityLabel="Calcular conversión de dosis"><Text style={styles.primaryButtonText}>Calcular</Text></Pressable>
    {result && (result.ok ? <View style={styles.doseResult} accessibilityLabel="Auditoría completa del resultado de dosis"><Text style={styles.doseResultLabel}>RESULTADO REDONDEADO</Text><Text style={styles.doseResultValue}>{result.display}</Text><Text style={styles.doseResultDetail}>Medicamento: {result.audit.medication.name} ({result.audit.medication.id})</Text><Text style={styles.doseResultDetail}>Presentación: {result.audit.presentation.label} ({result.audit.presentation.id})</Text><Text style={styles.doseResultDetail}>Fuente clínica: {result.audit.source.clinicianSource} · revisión {result.audit.source.revision} · {result.audit.source.date.slice(0, 10)}</Text><Text style={styles.doseResultDetail}>Entrada: {auditValueSummary(result.audit.inputs.entered)}</Text><Text style={styles.doseResultDetail}>Normalizado: {auditValueSummary(result.audit.inputs.normalized)}</Text><Text style={styles.doseResultDetail}>Fórmula: {result.audit.formula}</Text><Text style={styles.doseResultDetail}>Precisión completa: {result.audit.fullPrecision} {result.unit}</Text><Text style={styles.doseResultDetail}>Redondeo aprobado: {result.audit.rounding.mode} a {result.audit.rounding.increment} {result.audit.rounding.unit} → {result.audit.rounding.result} {result.audit.rounding.unit}</Text>{result.warnings.map((warning) => <Text key={warning} style={styles.doseWarning}>Aviso: {warning}</Text>)}</View> : <View style={styles.doseError}><MaterialCommunityIcons name="alert-circle-outline" size={19} color={colors.red} /><Text style={styles.doseErrorText}>{result.reason}</Text></View>)}
    <Text style={styles.doseDisclaimer}>Herramienta orientativa. Verifica la pauta, el paciente y la fuente operativa antes de administrar.</Text>
  </View>;
}

function auditValueSummary(values: Record<string, unknown>): string {
  return Object.entries(values).map(([key, value]) => `${key}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`).join(" · ");
}

function DrugScreen({ route, navigation }: NativeStackScreenProps<RootStackParamList, "Drug">) {
  const { content, snapshot } = useContent();
  const drug = content.drugs.find((item) => String(item.id) === route.params.id);
  if (!drug) return <MissingResource title="Fármaco no disponible" />;
  const fields = [["Función", "funcion"], ["Indicación", "indication"], ["Presentación publicada", "presentation"], ["Vía", "route"], ["Dosis publicada", "dose"], ["Contraindicaciones", "contraindications"], ["Efectos secundarios", "efectos_secundarios"], ["Notas", "notes"]] as const;
  const relatedIds = relatedProcedureIdsForDrug(content, drug).slice(0, 12);
  const packageRevision = typeof content.manual.manualVersionCurrent === "string" ? content.manual.manualVersionCurrent : snapshot.packageHash?.slice(0, 12) ?? "paquete local";
  const sourceUrl = typeof content.links.officialWebUrl === "string" && content.links.officialWebUrl ? content.links.officialWebUrl : content.links.sourceUrl;
  return <SafeAreaView style={styles.screen} edges={["top"]}><ScrollView contentContainerStyle={styles.detailContent}><Pressable onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Volver"><MaterialCommunityIcons name="arrow-left" size={24} color={colors.ink} /></Pressable><Text style={styles.detailSection}>VADEMÉCUM · FÁRMACO</Text><Text style={styles.detailTitle}>{String(drug.name ?? "Fármaco")}</Text><Text style={styles.detailMeta}>{String(drug.category ?? "")} · {String(drug.subcategory ?? "")}</Text><View style={styles.sourceNotice}><MaterialCommunityIcons name="database-check-outline" size={19} color={colors.green} /><Text style={styles.sourceNoticeText}>Referencia publicada en el paquete local {packageRevision}{sourceUrl ? ` · Fuente: ${sourceUrl}` : ""}</Text></View>{fields.map(([label, key]) => { const value = drug[key]; const display = Array.isArray(value) ? value.join(" · ") : value; return typeof display === "string" && display ? <View key={key} style={styles.infoBlock}><Text style={styles.infoLabel}>{label}</Text><Text style={styles.infoValue}>{display}</Text></View> : null; })}<DoseUtilityCard drug={drug} />{relatedIds.length > 0 && <><SectionHeading eyebrow="CONTEXTO DEL MANUAL" title="Procedimientos relacionados" /><View style={styles.cardList}>{relatedIds.map((id) => { const procedure = findProcedure(content, id); return procedure ? <ProcedureRow key={id} procedure={procedure} onPress={() => navigation.push("Procedure", { id })} /> : null; })}</View></>}</ScrollView></SafeAreaView>;
}

function VademecumReferenceScreen({ route, navigation }: NativeStackScreenProps<RootStackParamList, "Vademecum">) {
  const { content, snapshot } = useContent();
  const reference = resolveVademecumReference(content, route.params.routeKey);
  if (!reference) return <MissingResource title="Referencia de Vademécum no disponible" detail="Esta entrada no está incluida en el paquete local." onRecover={() => navigation.navigate("Tabs", { screen: "Buscar" })} />;
  const details = reference.detail ?? {};
  const fields = Object.entries(details).filter(([key, value]) => !["id", "drugId", "drug", "brandNames", "activeIngredient"].includes(key) && (typeof value === "string" || typeof value === "number" || Array.isArray(value))).slice(0, 12);
  const packageRevision = typeof content.manual.manualVersionCurrent === "string" ? content.manual.manualVersionCurrent : snapshot.packageHash?.slice(0, 12) ?? "paquete local";
  return <SafeAreaView style={styles.screen} edges={["top"]}><ScrollView contentContainerStyle={styles.detailContent}><Pressable onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Volver"><MaterialCommunityIcons name="arrow-left" size={24} color={colors.ink} /></Pressable><Text style={styles.detailSection}>VADEMÉCUM · {reference.kind.toUpperCase()}</Text><Text style={styles.detailTitle}>{reference.title}</Text><Text style={styles.detailMeta}>{reference.subtitle}</Text><View style={styles.sourceNotice}><MaterialCommunityIcons name="database-check-outline" size={19} color={colors.green} /><Text style={styles.sourceNoticeText}>Referencia local · revisión {packageRevision}</Text></View>{fields.map(([key, value]) => <View key={key} style={styles.infoBlock}><Text style={styles.infoLabel}>{key.replace(/([A-Z])/g, " $1")}</Text><Text style={styles.infoValue}>{Array.isArray(value) ? value.join(" · ") : String(value)}</Text></View>)}</ScrollView></SafeAreaView>;
}

function CodeScreen({ route, navigation }: NativeStackScreenProps<RootStackParamList, "Code">) {
  const { content, snapshot } = useContent();
  const reference = resolveCodeReference(content.codes, route.params.routeKey);
  if (!reference) return <MissingResource title="Código no disponible" detail="Este código no está incluido en el paquete local." onRecover={() => navigation.navigate("Tabs", { screen: "Buscar" })} />;
  const details = reference.detail ?? {};
  const description = typeof details.description === "string" ? details.description : "";
  const category = typeof details.category === "string" ? details.category : "";
  const packageRevision = typeof content.manual.manualVersionCurrent === "string" ? content.manual.manualVersionCurrent : snapshot.packageHash?.slice(0, 12) ?? "paquete local";
  const extraFields = Object.entries(details).filter(([key, value]) => !["code", "name", "title", "category", "description"].includes(key) && (typeof value === "string" || typeof value === "number" || Array.isArray(value))).slice(0, 8);
  return <SafeAreaView style={styles.screen} edges={["top"]}><ScrollView contentContainerStyle={styles.detailContent}><Pressable onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Volver"><MaterialCommunityIcons name="arrow-left" size={24} color={colors.ink} /></Pressable><Text style={styles.detailSection}>CÓDIGOS · {reference.sourceGroup?.toUpperCase() ?? "LOCAL"}</Text><Text style={styles.detailTitle}>{reference.badge ?? reference.title}</Text><Text style={styles.detailMeta}>{reference.title}</Text><View style={styles.sourceNotice}><MaterialCommunityIcons name="radio-handheld" size={19} color={colors.amber} /><Text style={styles.sourceNoticeText}>Taxonomía {reference.sourceGroup ?? "local"}{category ? ` · ${category}` : ""} · revisión {packageRevision}</Text></View>{description ? <View style={styles.infoBlock}><Text style={styles.infoLabel}>Descripción</Text><Text style={styles.infoValue}>{description}</Text></View> : null}{extraFields.map(([key, value]) => <View key={key} style={styles.infoBlock}><Text style={styles.infoLabel}>{key}</Text><Text style={styles.infoValue}>{Array.isArray(value) ? value.map((item) => typeof item === "object" ? JSON.stringify(item) : String(item)).join(" · ") : String(value)}</Text></View>)}<View style={styles.infoBlock}><Text style={styles.infoLabel}>Ruta estable</Text><Text style={styles.infoValue}>{reference.routeKey}</Text></View></ScrollView></SafeAreaView>;
}

function CodesScreen({ route, navigation }: NativeStackScreenProps<RootStackParamList, "Codes">) {
  const { content } = useContent();
  const [query, setQuery] = useState(route.params?.query ?? "");
  const codes = useMemo(() => searchCodes(content.codes, query, 2000), [content.codes, query]);
  return <SafeAreaView style={styles.screen} edges={["top"]}><FlatList data={codes} keyExtractor={(item) => item.id} contentContainerStyle={styles.listContent} ListHeaderComponent={<><Pressable onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Volver"><MaterialCommunityIcons name="arrow-left" size={24} color={colors.ink} /></Pressable><Text style={styles.pageTitle}>Códigos y claves</Text><Text style={styles.pageKicker}>RADIO · CONSULTA LOCAL</Text><View style={styles.detailSearch}><SearchBar value={query} onChangeText={setQuery} /></View></>} ListEmptyComponent={<EmptyState title="Sin coincidencias" detail="Prueba con el código, nombre, categoría o descripción." />} renderItem={({ item }) => <Pressable onPress={() => navigation.push("Code", { routeKey: item.routeKey })} style={styles.codeRow} accessibilityRole="button" accessibilityLabel={`Abrir código ${item.badge ?? item.title}`}><Text style={styles.codeValue}>{item.badge ?? "—"}</Text><View style={styles.resourceCopy}><Text style={styles.resourceTitle}>{item.title}</Text><Text style={styles.resourceMeta}>{item.subtitle}</Text></View><MaterialCommunityIcons name="chevron-right" size={20} color={colors.inkMuted} /></Pressable>} /></SafeAreaView>;
}

function AbbreviationsScreen({ route, navigation }: NativeStackScreenProps<RootStackParamList, "Abbreviations">) {
  const { content } = useContent();
  const [query, setQuery] = useState(route.params?.query ?? "");
  const entries = useMemo(() => searchAbbreviations(content.abbreviations, query, 1000), [content.abbreviations, query]);
  return <SafeAreaView style={styles.screen} edges={["top"]}><FlatList data={entries} keyExtractor={(item) => item.id} contentContainerStyle={styles.listContent} ListHeaderComponent={<><Pressable onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Volver"><MaterialCommunityIcons name="arrow-left" size={24} color={colors.ink} /></Pressable><Text style={styles.pageTitle}>Abreviaturas</Text><Text style={styles.pageKicker}>LENGUAJE OPERATIVO</Text><View style={styles.detailSearch}><SearchBar value={query} onChangeText={setQuery} /></View></>} ListEmptyComponent={<EmptyState title="Sin coincidencias" detail="Prueba con la abreviatura o su significado." />} renderItem={({ item }) => <View style={styles.abbreviationRow}><Text style={styles.abbreviation}>{item.title}</Text><View style={styles.resourceCopy}><Text style={styles.resourceTitle}>{item.subtitle}</Text><Text style={styles.resourceMeta}>Letra {item.badge ?? "—"}</Text></View></View>} /></SafeAreaView>;
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
  return <><SectionHeading eyebrow="NOTAS EDITORIALES" title="Puntos destacados" /><View style={styles.editorialList}>{usable.map((block, index) => { const items = Array.isArray(block.items) ? block.items : []; const assets = Array.isArray(block.assets) ? block.assets : []; return <View key={String(block.id ?? index)} style={styles.editorialBlock}><Text style={styles.infoLabel}>{String(block.label ?? block.type ?? "Nota")}</Text>{typeof block.title === "string" && <Text style={styles.editorialTitle}>{block.title}</Text>}{typeof block.content === "string" && <Text style={styles.infoValue}>{block.content}</Text>}{items.map((item, itemIndex) => { const itemId = typeof item === "string" && /^\d/.test(item) ? item : undefined; const itemText = typeof item === "string" ? item : String((item as Record<string, unknown>)?.label ?? (item as Record<string, unknown>)?.title ?? "Referencia"); return itemId && onProcedure ? <Pressable key={itemIndex} onPress={() => onProcedure(itemId)} style={styles.editorialLink} accessibilityRole="button" accessibilityLabel={`Abrir procedimiento ${itemId}`}><Text style={styles.markdownText}>• {itemText}</Text><MaterialCommunityIcons name="chevron-right" size={17} color={colors.inkMuted} /></Pressable> : <Text key={itemIndex} style={styles.markdownText}>• {itemText}</Text>; })}{assets.map((asset, assetIndex) => <Text key={assetIndex} style={styles.resourceMeta}>{String((asset as Record<string, unknown>)?.title ?? (asset as Record<string, unknown>)?.src ?? "Material editorial")}</Text>)}</View>; })}</View></>;
}

function ProcedureUpdate({ update }: { update: unknown }) {
  const value = update && typeof update === "object" ? update as Record<string, unknown> : {};
  const date = String(value.date ?? value.updatedAt ?? value.createdAt ?? "Fecha no indicada");
  const label = String(value.title ?? value.label ?? value.type ?? "Actualización del contenido");
  const detail = String(value.summary ?? value.description ?? value.message ?? "");
  return <View style={styles.updateRow}><Text style={styles.infoLabel}>{date.slice(0, 10)}</Text><Text style={styles.resourceTitle}>{label}</Text>{detail && <Text style={styles.resourceMeta}>{detail}</Text>}</View>;
}

function EmptyState({ title, detail }: { title: string; detail: string }) { return <View style={styles.emptyState}><MaterialCommunityIcons name="bookmark-off-outline" size={28} color={colors.inkMuted} /><Text style={styles.emptyTitle}>{title}</Text><Text style={styles.emptyDetail}>{detail}</Text></View>; }
function MissingResource({ title, detail, onRecover }: { title: string; detail?: string; onRecover?: () => void }) { return <SafeAreaView style={styles.screen}><View style={styles.emptyState}><MaterialCommunityIcons name="file-alert-outline" size={30} color={colors.red} /><Text style={styles.emptyTitle}>{title}</Text>{detail && <Text style={styles.emptyDetail}>{detail}</Text>}{onRecover && <Pressable onPress={onRecover} style={styles.primaryButton} accessibilityRole="button"><Text style={styles.primaryButtonText}>Buscar otro procedimiento</Text></Pressable>}</View></SafeAreaView>; }

function SettingsModal({ visible, onClose, onRefresh, onCancelRefresh, onResumeStaged, onDiscardStaged, onOpenAbbreviations, generatedAt, packageHash, isRefreshing, lastError, syncState, syncProgress, stagedPackage }: { visible: boolean; onClose: () => void; onRefresh: () => Promise<void>; onCancelRefresh: () => void; onResumeStaged: () => Promise<void>; onDiscardStaged: () => Promise<void>; onOpenAbbreviations: () => void; generatedAt: string; packageHash?: string; isRefreshing: boolean; lastError?: string; syncState: SyncState; syncProgress: SyncProgress; stagedPackage?: StagedPackage }) {
  const { appearance, setAppearance } = usePreferences();
  const appearanceLabels: Record<AppearancePreference, string> = { system: "Sistema", light: "Claro", dark: "Oscuro" };
  const presentation = syncPresentation(syncState, contentFreshness(generatedAt), syncProgress, stagedPackage?.packageHash);
  const progressPercent = syncProgress.totalBytes && syncProgress.downloadedBytes !== undefined ? Math.min(100, Math.round((syncProgress.downloadedBytes / syncProgress.totalBytes) * 100)) : undefined;
  return <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" allowSwipeDismissal onRequestClose={onClose}>
    <SafeAreaView style={styles.modal} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
        <View style={styles.modalHeader}><View><Text style={styles.modalTitle}>Información y ajustes</Text><Text style={styles.modalKicker}>PULSO ABIERTO</Text></View><Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Cerrar"><Text style={styles.modalClose}>Cerrar</Text></Pressable></View>
        <Text style={styles.settingsSectionTitle}>Contenido y sincronización</Text>
        <View style={styles.settingsCard} accessibilityLabel="Estado del contenido local">
          <MaterialCommunityIcons name={presentation.icon} size={25} color={presentation.color} />
          <View style={styles.resourceCopy}><Text style={styles.resourceTitle}>{presentation.title}</Text><Text style={styles.resourceMeta}>{lastError ?? `${generatedAt.slice(0, 10)} · rev ${packageHash?.slice(0, 10) ?? "—"} · ${presentation.detail}`}</Text>{progressPercent !== undefined && <View style={styles.progressTrack} accessibilityLabel={`Progreso de actualización ${progressPercent}%`}><View style={[styles.progressFill, { width: `${progressPercent}%` }]} /></View>}</View>
        </View>
        {isRefreshing ? <Pressable onPress={onCancelRefresh} disabled={syncState === "activating"} style={[styles.primaryButton, syncState === "activating" && styles.disabledButton]} accessibilityRole="button" accessibilityLabel={syncState === "activating" ? "Aplicando actualización" : "Cancelar actualización"}><Text style={styles.primaryButtonText}>{syncState === "activating" ? "Aplicando actualización…" : "Cancelar actualización"}</Text></Pressable> : <Pressable onPress={() => void onRefresh()} style={styles.primaryButton} accessibilityRole="button" accessibilityLabel="Buscar actualización"><Text style={styles.primaryButtonText}>Buscar actualización</Text></Pressable>}
        {stagedPackage && <View style={styles.recoveryActions}><Text style={styles.resourceMeta}>Hay un paquete descargado que no llegó a activarse. El contenido anterior sigue protegido.</Text><View style={styles.recoveryButtons}><Pressable onPress={() => void onResumeStaged()} disabled={isRefreshing} style={styles.recoveryButton} accessibilityRole="button"><Text style={styles.recoveryButtonText}>Reanudar</Text></Pressable><Pressable onPress={() => void onDiscardStaged()} disabled={isRefreshing} style={styles.recoveryButtonSecondary} accessibilityRole="button"><Text style={styles.recoveryButtonSecondaryText}>Descartar</Text></Pressable></View></View>}

        <Text style={styles.settingsSectionTitle}>Consulta rápida</Text>
        <Pressable onPress={onOpenAbbreviations} style={styles.settingsCard} accessibilityRole="button" accessibilityLabel="Abrir abreviaturas">
          <MaterialCommunityIcons name="format-letter-case" size={25} color={colors.green} />
          <View style={styles.resourceCopy}><Text style={styles.resourceTitle}>Abreviaturas</Text><Text style={styles.resourceMeta}>Búsqueda local por abreviatura o significado</Text></View>
          <MaterialCommunityIcons name="chevron-right" size={20} color={colors.inkMuted} />
        </Pressable>

        <Text style={styles.settingsSectionTitle}>Apariencia</Text>
        <View style={styles.appearanceControl} accessibilityRole="radiogroup" accessibilityLabel="Apariencia de la aplicación">
          {(Object.keys(appearanceLabels) as AppearancePreference[]).map((option) => <Pressable key={option} onPress={() => setAppearance(option)} style={[styles.appearanceOption, appearance === option && styles.appearanceOptionActive]} accessibilityRole="radio" accessibilityState={{ selected: appearance === option }}><MaterialCommunityIcons name={option === "system" ? "theme-light-dark" : option === "light" ? "white-balance-sunny" : "weather-night"} size={17} color={appearance === option ? colors.white : colors.inkMuted} /><Text style={[styles.appearanceText, appearance === option && styles.appearanceTextActive]}>{appearanceLabels[option]}</Text></Pressable>)}
        </View>

        <Text style={styles.settingsSectionTitle}>Aviso y alcance</Text>
        <View style={styles.infoPanel}><Text style={styles.infoPanelTitle}>Referencia independiente</Text><Text style={styles.infoPanelText}>Pulso abierto es una adaptación digital no oficial para consulta. No sustituye instrucciones, protocolos ni criterio profesional. Verifica siempre la versión operativa vigente con SAMUR-Protección Civil Madrid.</Text></View>
        <Text style={styles.settingsSectionTitle}>Privacidad y funcionamiento</Text>
        <Text style={styles.disclaimer}>No se solicitan cuentas ni datos de pacientes. Favoritos, recientes y preferencias permanecen en este dispositivo. No hay publicidad, pagos, analítica obligatoria, notificaciones push ni sincronización entre dispositivos.</Text>
        <Pressable onPress={() => void Linking.openURL("https://servpub.madrid.es/manualsamur/bin/view/Main/")} style={styles.linkRow} accessibilityRole="link"><Text style={styles.linkText}>Abrir fuente oficial del manual</Text><MaterialCommunityIcons name="open-in-new" size={17} color={colors.red} /></Pressable>
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
  const continueToApp = async () => { setIsSaving(true); await onContinue(); };
  return <Modal visible animationType="fade" presentationStyle="fullScreen" onRequestClose={() => undefined}><SafeAreaView style={styles.disclosureScreen}>
    <View style={styles.disclosureContent}><LogoMark /><Text style={styles.disclosureEyebrow}>ANTES DE EMPEZAR</Text><Text style={styles.disclosureTitle}>Una referencia abierta para la guardia.</Text><Text style={styles.disclosureBody}>Pulso abierto es una adaptación digital independiente y no oficial del ManualSAMUR. El contenido es de referencia: no sustituye protocolos, instrucciones ni criterio profesional.</Text><Text style={styles.disclosureBody}>El manual se consulta offline. No necesitas cuenta y no se recogen datos de pacientes.</Text></View>
    <View><Pressable onPress={() => void continueToApp()} disabled={isSaving} style={[styles.primaryButton, isSaving && styles.disabledButton]} accessibilityRole="button"><Text style={styles.primaryButtonText}>{isSaving ? "Preparando…" : "Entendido, abrir el manual"}</Text></Pressable><Text style={styles.disclosureFooter}>Puedes revisar este aviso, la fuente y la privacidad desde Información y ajustes.</Text></View>
  </SafeAreaView></Modal>;
}

function LocationModal({ location, onClose, onOpenMaps, policy = locationSourcePolicy }: { location?: LocationWithDistance; onClose: () => void; onOpenMaps?: (location: LocationRecord) => void; policy?: typeof locationSourcePolicy }) {
  if (!location) return null;
  const title = location.shortName || location.name;
  return <Modal visible animationType="slide" transparent onRequestClose={onClose}><Pressable style={styles.modalBackdrop} onPress={onClose}><Pressable style={styles.locationSheet} onPress={(event) => event.stopPropagation()}><View style={styles.sheetHandle} /><Text style={styles.detailSection}>{location.kind === "hospital" ? "HOSPITAL" : "BASE"}</Text><Text style={styles.sheetTitle}>{title}</Text><Text style={styles.resourceMeta}>{location.name} · {location.address} · {location.district}</Text><View style={styles.locationDetailBlock}><Text style={styles.infoLabel}>Identificador estable</Text><Text style={styles.infoValue}>{locationFavoriteId(location)} · ruta {locationRouteKey(location)}</Text><Text style={styles.infoLabel}>Fuente y frescura</Text><Text style={styles.infoValue}>{locationFreshnessLabel(location, new Date(), policy)}</Text><Text style={styles.infoLabel}>Coordenadas</Text><Text style={styles.infoValue}>{location.lat.toFixed(5)}, {location.lng.toFixed(5)} · distancia geométrica, sin ruta</Text></View>{onOpenMaps && <Pressable onPress={() => onOpenMaps(location)} style={styles.primaryButton} accessibilityRole="link" accessibilityLabel={"Abrir " + title + " en Mapas"}><Text style={styles.primaryButtonText}>Abrir en Mapas</Text></Pressable>}<Pressable onPress={onClose} style={styles.secondaryButton} accessibilityRole="button"><Text style={styles.secondaryButtonText}>Hecho</Text></Pressable></Pressable></Pressable></Modal>;
}

function TabIcon({ name, color }: { name: keyof typeof MaterialCommunityIcons.glyphMap; color: string }) { return <MaterialCommunityIcons name={name} size={23} color={color} />; }

function MainTabs() {
  return <Tabs.Navigator backBehavior="history" screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.red, tabBarInactiveTintColor: colors.inkMuted, tabBarLabelStyle: styles.tabLabel, tabBarStyle: styles.tabBar, tabBarHideOnKeyboard: true, tabBarAccessibilityLabel: "Navegación principal" }}>
    <Tabs.Screen name="Inicio" component={HomeScreen} options={{ tabBarIcon: ({ color }) => <TabIcon name="home-variant-outline" color={color} /> }} />
    <Tabs.Screen name="Buscar" component={SearchScreen} options={{ tabBarIcon: ({ color }) => <TabIcon name="magnify" color={color} /> }} />
    <Tabs.Screen name="Guardados" component={SavedScreen} options={{ tabBarIcon: ({ color }) => <TabIcon name="star-outline" color={color} /> }} />
    <Tabs.Screen name="Mapa" component={MapScreen} options={{ tabBarIcon: ({ color }) => <TabIcon name="map-outline" color={color} /> }} />
  </Tabs.Navigator>;
}

function AppNavigation() {
  return <NavigationContainer><Stack.Navigator screenOptions={{ headerShown: false, animation: "slide_from_right", gestureEnabled: true, fullScreenGestureEnabled: true, contentStyle: { backgroundColor: colors.paper } }}><Stack.Screen name="Tabs" component={MainTabs} /><Stack.Screen name="Procedure" component={ProcedureScreen} options={{ presentation: "card" }} /><Stack.Screen name="Location" component={LocationDetailScreen} options={{ presentation: "card" }} /><Stack.Screen name="Drug" component={DrugScreen} options={{ presentation: "card" }} /><Stack.Screen name="Vademecum" component={VademecumReferenceScreen} options={{ presentation: "card" }} /><Stack.Screen name="Codes" component={CodesScreen} options={{ presentation: "formSheet", gestureDirection: "vertical" }} /><Stack.Screen name="Code" component={CodeScreen} options={{ presentation: "card" }} /><Stack.Screen name="Abbreviations" component={AbbreviationsScreen} options={{ presentation: "formSheet", gestureDirection: "vertical" }} /></Stack.Navigator></NavigationContainer>;
}

function AppGate() {
  const { isHydrated, hasAcknowledgedFirstUse, acknowledgeFirstUse, appearance } = usePreferences();
  if (!isHydrated) return <LaunchScreen />;
  if (!hasAcknowledgedFirstUse) return <FirstUseDisclosure onContinue={acknowledgeFirstUse} />;
  return <><StatusBar style={appearance === "dark" ? "light" : "dark"} /><ContentProvider><AppNavigation /></ContentProvider></>;
}

export default function App() { return <SafeAreaProvider><PreferencesProvider><AppGate /></PreferencesProvider></SafeAreaProvider>; }

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  scrollContent: { padding: spacing.lg, paddingBottom: 40 },
  listContent: { padding: spacing.lg, paddingBottom: 40, gap: 8 },
  detailContent: { padding: spacing.lg, paddingBottom: 48 },
  brandHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.xl },
  brandLockup: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  logoMark: { width: 94, height: 94, borderRadius: 27, backgroundColor: colors.red, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  logoMarkSmall: { width: 38, height: 38, borderRadius: 11 },
  logoCrossVertical: { position: "absolute", width: 15, height: 60, backgroundColor: colors.white, borderRadius: 3 },
  logoCrossHorizontal: { position: "absolute", width: 60, height: 15, backgroundColor: colors.white, borderRadius: 3 },
  logoSmallBar: { width: 6, height: 24 }, logoSmallHorizontal: { width: 24, height: 6 },
  logoArrow: { position: "absolute", width: 36, height: 36, backgroundColor: colors.ink, transform: [{ rotate: "45deg" }], left: 20, top: 16, borderRadius: 4 },
  logoArrowSmall: { width: 16, height: 16, left: 8, top: 7, borderRadius: 2 },
  brandName: { color: colors.ink, fontSize: 18, fontWeight: "800", letterSpacing: -0.4 },
  brandSubline: { color: colors.red, fontSize: 9, fontWeight: "800", letterSpacing: 1.3, marginTop: 2 },
  iconButton: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  hero: { backgroundColor: colors.ink, borderRadius: radii.lg, padding: spacing.xl, minHeight: 190, flexDirection: "row", overflow: "hidden", marginBottom: spacing.lg },
  heroCopy: { flex: 1, zIndex: 1 },
  heroEyebrow: { color: "#B8C4D7", fontSize: 10, fontWeight: "800", letterSpacing: 1.2, marginBottom: spacing.md },
  heroTitle: { color: colors.white, fontSize: 29, lineHeight: 32, fontWeight: "800", letterSpacing: -1 },
  heroBody: { color: "#D7DEEA", fontSize: 13, lineHeight: 18, marginTop: spacing.md, maxWidth: 225 },
  searchBar: { height: 58, borderRadius: radii.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, gap: spacing.sm, marginBottom: spacing.xl },
  searchInput: { flex: 1, color: colors.ink, fontSize: 14, paddingVertical: 0 }, searchPlaceholder: { flex: 1, color: colors.inkMuted, fontSize: 14 },
  offlineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.green },
  sectionHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: spacing.md, marginBottom: spacing.md },
  eyebrow: { color: colors.red, fontSize: 10, letterSpacing: 1.3, fontWeight: "800", marginBottom: 4 },
  sectionTitle: { color: colors.ink, fontSize: 21, lineHeight: 25, fontWeight: "800", letterSpacing: -0.5 },
  sectionAction: { color: colors.red, fontSize: 12, fontWeight: "800", paddingBottom: 2 },
  actionGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.lg },
  actionCard: { width: "48%", minHeight: 126, padding: spacing.md, borderRadius: radii.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  actionIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.redWash, alignItems: "center", justifyContent: "center", marginBottom: spacing.sm },
  actionIconNavy: { backgroundColor: "#E7ECF5" }, actionIconAmber: { backgroundColor: colors.amberWash }, actionIconGreen: { backgroundColor: colors.greenWash },
  actionLabel: { fontSize: 15, fontWeight: "800", color: colors.ink }, actionDetail: { fontSize: 11, color: colors.inkMuted, marginTop: 3 },
  cardList: { backgroundColor: colors.surface, borderRadius: radii.md, borderWidth: 1, borderColor: colors.line, overflow: "hidden", marginBottom: spacing.xl },
  resourceRow: { minHeight: 70, padding: spacing.md, flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.line },
  resourceCode: { width: 42, height: 42, borderRadius: 12, backgroundColor: colors.redWash, alignItems: "center", justifyContent: "center" }, resourceCodeText: { fontSize: 11, fontWeight: "900", color: colors.red },
  drugCode: { backgroundColor: "#E7ECF5" }, resourceCopy: { flex: 1 }, resourceTitle: { color: colors.ink, fontSize: 14, lineHeight: 18, fontWeight: "700" }, resourceMeta: { color: colors.inkMuted, fontSize: 11, lineHeight: 16, marginTop: 3 },
  pressed: { opacity: 0.72 },
  syncCard: { backgroundColor: colors.greenWash, borderRadius: radii.md, padding: spacing.md, flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.lg }, syncIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.white, alignItems: "center", justifyContent: "center" }, syncCopy: { flex: 1 }, syncTitle: { color: colors.green, fontWeight: "800", fontSize: 13 }, syncDetail: { color: colors.inkMuted, fontSize: 11, marginTop: 2 }, syncAction: { color: colors.green, fontSize: 12, fontWeight: "800" }, progressTrack: { height: 4, borderRadius: 2, backgroundColor: colors.line, overflow: "hidden", marginTop: 7 }, progressFill: { height: 4, backgroundColor: colors.green },
  disclaimer: { color: colors.inkMuted, fontSize: 11, lineHeight: 16, textAlign: "center", marginVertical: spacing.md },
  searchScreenHeader: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.md }, pageTitle: { color: colors.ink, fontSize: 31, fontWeight: "800", letterSpacing: -1 }, pageKicker: { color: colors.red, fontSize: 10, fontWeight: "800", letterSpacing: 1.3, marginTop: 4 }, searchPadding: { paddingHorizontal: spacing.lg }, detailSearch: { marginTop: spacing.lg },
  filterRow: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, marginBottom: spacing.sm }, filterChip: { paddingVertical: 9, paddingHorizontal: 13, borderRadius: radii.pill, backgroundColor: colors.surfaceMuted }, filterChipActive: { backgroundColor: colors.ink }, filterText: { color: colors.inkMuted, fontSize: 12, fontWeight: "700" }, filterTextActive: { color: colors.white },
  emptyState: { alignItems: "center", padding: spacing.xl, gap: spacing.sm }, emptyTitle: { color: colors.ink, fontWeight: "800", fontSize: 16 }, emptyDetail: { color: colors.inkMuted, textAlign: "center", fontSize: 13, lineHeight: 18 },
  mapLegend: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.md }, mapLegendDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.green }, mapLegendText: { color: colors.inkMuted, fontSize: 12 }, locationPolicyNotice: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, backgroundColor: colors.amberWash, borderRadius: radii.md, padding: spacing.md, marginHorizontal: spacing.lg, marginBottom: spacing.md }, locationActions: { gap: spacing.sm, marginBottom: spacing.md }, locationActionButton: { minHeight: 48, borderRadius: radii.md, backgroundColor: colors.ink, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, paddingHorizontal: spacing.lg }, locationActionText: { color: colors.white, fontSize: 13, fontWeight: "800" }, nearestToggle: { flexDirection: "row", gap: spacing.sm }, nearestChoice: { flex: 1, minHeight: 42, borderRadius: radii.sm, backgroundColor: colors.surfaceMuted, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.sm }, nearestChoiceActive: { backgroundColor: colors.redWash, borderWidth: 1, borderColor: colors.red }, nearestChoiceText: { color: colors.inkMuted, fontSize: 11, fontWeight: "800", textAlign: "center" }, nearestChoiceTextActive: { color: colors.redDark }, locationFallback: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, backgroundColor: colors.amberWash, borderRadius: radii.md, padding: spacing.md, marginBottom: spacing.md }, locationFallbackText: { flex: 1, color: colors.ink, fontSize: 12, lineHeight: 17 }, accessibleEquivalent: { backgroundColor: colors.surfaceMuted, borderRadius: radii.md, padding: spacing.md, marginBottom: spacing.sm }, accessibleEquivalentTitle: { color: colors.ink, fontSize: 14, fontWeight: "800" }, accessibleEquivalentCopy: { color: colors.inkMuted, fontSize: 12, lineHeight: 17, marginTop: 3 },
  schematicMap: { height: 300, borderRadius: radii.lg, backgroundColor: "#E7ECF2", overflow: "hidden", position: "relative", marginBottom: spacing.xl, borderWidth: 1, borderColor: colors.line }, mapRoadOne: { position: "absolute", width: "150%", height: 42, backgroundColor: "#F7F8FA", transform: [{ rotate: "-24deg" }], top: 125, left: -50 }, mapRoadTwo: { position: "absolute", width: "120%", height: 20, backgroundColor: "#F7F8FA", transform: [{ rotate: "38deg" }], top: 64, left: -12 }, mapRoadThree: { position: "absolute", width: 18, height: "130%", backgroundColor: "#F7F8FA", transform: [{ rotate: "15deg" }], top: -20, left: 185 }, mapPin: { position: "absolute", width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.white }, mapPinRed: { backgroundColor: colors.red }, mapPinNavy: { backgroundColor: colors.ink }, mapCompass: { position: "absolute", top: 15, right: 15, alignItems: "center" }, mapCompassN: { fontSize: 11, color: colors.ink, fontWeight: "900" }, mapNote: { color: colors.inkMuted, fontSize: 11, lineHeight: 16, textAlign: "center", marginTop: -spacing.md, marginBottom: spacing.xl },
  locationRow: { minHeight: 66, padding: spacing.md, flexDirection: "row", alignItems: "center", gap: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.line }, locationIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.redWash, alignItems: "center", justifyContent: "center" }, locationIconBase: { backgroundColor: colors.amberWash }, locationAddress: { color: colors.ink, fontSize: 11, lineHeight: 16, marginTop: 2 }, locationDistance: { color: colors.green, fontSize: 11, fontWeight: "800", lineHeight: 16, marginTop: 2 }, locationFreshness: { color: colors.inkMuted, fontSize: 10, lineHeight: 14, marginTop: 2 },
  detailTopbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.xl }, detailTopbarLabel: { flex: 1, marginHorizontal: spacing.md, textAlign: "center", color: colors.inkMuted, fontSize: 10, fontWeight: "800", letterSpacing: 1.2 }, detailSection: { color: colors.red, fontSize: 11, fontWeight: "900", letterSpacing: 1.4, marginBottom: spacing.sm }, detailTitle: { color: colors.ink, fontSize: 30, lineHeight: 34, fontWeight: "800", letterSpacing: -0.8 }, detailMeta: { color: colors.inkMuted, fontSize: 12, marginTop: spacing.sm, marginBottom: spacing.lg }, sourceNotice: { flexDirection: "row", gap: spacing.sm, backgroundColor: colors.redWash, borderRadius: radii.md, padding: spacing.md, marginBottom: spacing.xl }, sourceNoticeText: { flex: 1, color: colors.redDark, fontSize: 12, lineHeight: 17 }, sourceRecoveryLink: { color: colors.redDark, fontSize: 12, fontWeight: "800", textDecorationLine: "underline", marginTop: spacing.sm }, contentsCard: { backgroundColor: colors.surfaceMuted, borderRadius: radii.md, padding: spacing.md, marginBottom: spacing.xl }, contentsTitle: { color: colors.red, fontSize: 10, fontWeight: "900", letterSpacing: 1.2, marginBottom: spacing.sm }, contentsRow: { minHeight: 38, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: colors.line }, contentsText: { flex: 1, color: colors.ink, fontSize: 13, fontWeight: "700" }, contentsTextNested: { paddingLeft: spacing.md, fontWeight: "600", color: colors.inkMuted }, markdown: { gap: spacing.sm, marginBottom: spacing.xl }, markdownText: { color: colors.ink, fontSize: 15, lineHeight: 23 }, markdownH2: { color: colors.ink, fontSize: 22, lineHeight: 27, fontWeight: "800", marginTop: spacing.lg }, markdownH3: { color: colors.ink, fontSize: 17, lineHeight: 22, fontWeight: "800", marginTop: spacing.md }, markdownBullet: { flexDirection: "row", gap: spacing.sm, paddingLeft: spacing.sm }, bulletDot: { color: colors.red, fontSize: 18, lineHeight: 23 }, attachmentRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, minHeight: 66, borderBottomWidth: 1, borderBottomColor: colors.line }, editorialList: { backgroundColor: colors.surface, borderRadius: radii.md, borderWidth: 1, borderColor: colors.line, overflow: "hidden", marginBottom: spacing.xl }, editorialBlock: { padding: spacing.md, gap: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.line }, editorialLink: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, editorialTitle: { color: colors.ink, fontSize: 16, lineHeight: 21, fontWeight: "800" }, updateList: { backgroundColor: colors.surface, borderRadius: radii.md, borderWidth: 1, borderColor: colors.line, overflow: "hidden", marginBottom: spacing.xl }, updateRow: { padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.line },
  infoBlock: { borderTopWidth: 1, borderTopColor: colors.line, paddingVertical: spacing.md }, infoLabel: { color: colors.red, fontSize: 10, fontWeight: "900", letterSpacing: 1.1, textTransform: "uppercase", marginBottom: 5 }, infoValue: { color: colors.ink, fontSize: 15, lineHeight: 22 }, codeRow: { flexDirection: "row", gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.line }, codeValue: { minWidth: 55, color: colors.red, fontSize: 15, fontWeight: "900" }, codeResultCode: { backgroundColor: colors.amberWash }, abbreviationResultCode: { backgroundColor: colors.greenWash }, abbreviationRow: { flexDirection: "row", gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.line }, abbreviation: { width: 70, color: colors.red, fontWeight: "900", fontSize: 13 },
  doseCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radii.md, padding: spacing.lg, marginTop: spacing.lg, marginBottom: spacing.xl }, doseHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.md }, doseTitle: { color: colors.ink, fontSize: 16, fontWeight: "800" }, doseLabel: { color: colors.red, fontSize: 10, fontWeight: "900", letterSpacing: 1.1, marginTop: spacing.md, marginBottom: spacing.sm }, doseChoiceRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.sm }, doseChoice: { flex: 1, minWidth: 120, borderRadius: radii.sm, paddingVertical: 10, paddingHorizontal: spacing.sm, backgroundColor: colors.surfaceMuted, alignItems: "center" }, doseChoiceActive: { backgroundColor: colors.ink }, doseChoiceText: { color: colors.inkMuted, fontSize: 11, fontWeight: "800", textAlign: "center" }, doseChoiceTextActive: { color: colors.white }, doseInputRow: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.line, borderRadius: radii.sm, backgroundColor: colors.paper, minHeight: 48, paddingHorizontal: spacing.md }, doseInput: { flex: 1, color: colors.ink, fontSize: 17, paddingVertical: 8 }, doseInputStandalone: { borderWidth: 1, borderColor: colors.line, borderRadius: radii.sm, backgroundColor: colors.paper, minHeight: 48, paddingHorizontal: spacing.md, color: colors.ink, fontSize: 16, marginBottom: spacing.sm }, doseUnit: { color: colors.inkMuted, fontWeight: "800", fontSize: 12 }, doseUnitChoice: { borderRadius: radii.pill, paddingVertical: 7, paddingHorizontal: 11, backgroundColor: colors.surfaceMuted }, doseUnitChoiceActive: { backgroundColor: colors.ink }, doseUnitChoiceText: { color: colors.inkMuted, fontSize: 11, fontWeight: "800" }, doseUnitChoiceTextActive: { color: colors.white }, doseCheckRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 42 }, doseCheckText: { color: colors.ink, fontSize: 12, lineHeight: 17, flex: 1 }, doseCalculateButton: { backgroundColor: colors.red, borderRadius: radii.md, padding: spacing.md, alignItems: "center", marginTop: spacing.md }, doseResult: { backgroundColor: colors.greenWash, borderRadius: radii.sm, padding: spacing.md, marginTop: spacing.md }, doseResultLabel: { color: colors.green, fontSize: 10, fontWeight: "900", letterSpacing: 1.1 }, doseResultValue: { color: colors.ink, fontSize: 27, fontWeight: "900", marginVertical: 3 }, doseResultDetail: { color: colors.inkMuted, fontSize: 11, lineHeight: 16 }, doseWarning: { color: colors.ink, fontSize: 11, lineHeight: 16, marginTop: spacing.sm }, doseError: { flexDirection: "row", gap: spacing.sm, backgroundColor: colors.redWash, borderRadius: radii.sm, padding: spacing.md, marginTop: spacing.md }, doseErrorText: { color: colors.redDark, flex: 1, fontSize: 12, lineHeight: 17 }, doseUnavailable: { color: colors.ink, fontSize: 13, lineHeight: 18 }, doseDisclaimer: { color: colors.inkMuted, fontSize: 10, lineHeight: 15, marginTop: spacing.md },
  modal: { flex: 1, backgroundColor: colors.paper, padding: spacing.lg }, modalContent: { paddingBottom: spacing.xxl }, modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.xl }, modalTitle: { color: colors.ink, fontSize: 24, fontWeight: "800" }, modalKicker: { color: colors.red, fontSize: 10, fontWeight: "900", letterSpacing: 1.2, marginTop: 4 }, modalClose: { color: colors.red, fontWeight: "800", padding: spacing.sm }, settingsSectionTitle: { color: colors.ink, fontSize: 17, fontWeight: "800", marginTop: spacing.lg, marginBottom: spacing.sm }, settingsCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, borderRadius: radii.md, padding: spacing.lg, marginBottom: spacing.sm }, recoveryActions: { backgroundColor: colors.amberWash, borderRadius: radii.md, padding: spacing.md, marginTop: spacing.sm }, recoveryButtons: { flexDirection: "row", gap: spacing.sm }, recoveryButton: { marginTop: spacing.sm, backgroundColor: colors.ink, borderRadius: radii.sm, paddingVertical: 10, paddingHorizontal: spacing.lg }, recoveryButtonText: { color: colors.white, fontSize: 12, fontWeight: "800" }, recoveryButtonSecondary: { marginTop: spacing.sm, borderColor: colors.ink, borderWidth: 1, borderRadius: radii.sm, paddingVertical: 10, paddingHorizontal: spacing.lg }, recoveryButtonSecondaryText: { color: colors.ink, fontSize: 12, fontWeight: "800" }, primaryButton: { backgroundColor: colors.red, borderRadius: radii.md, padding: spacing.lg, alignItems: "center", marginTop: spacing.md }, secondaryButton: { borderColor: colors.ink, borderWidth: 1, borderRadius: radii.md, padding: spacing.lg, alignItems: "center", marginTop: spacing.sm }, secondaryButtonText: { color: colors.ink, fontWeight: "800", fontSize: 14 }, locationDetailBlock: { backgroundColor: colors.surfaceMuted, borderRadius: radii.md, padding: spacing.md, marginTop: spacing.lg }, disabledButton: { opacity: 0.55 }, primaryButtonText: { color: colors.white, fontWeight: "800", fontSize: 14 }, appearanceControl: { flexDirection: "row", backgroundColor: colors.surfaceMuted, borderRadius: radii.md, padding: 4, gap: 4 }, appearanceOption: { flex: 1, minHeight: 45, borderRadius: radii.sm, alignItems: "center", justifyContent: "center", gap: 3 }, appearanceOptionActive: { backgroundColor: colors.ink }, appearanceText: { color: colors.inkMuted, fontSize: 11, fontWeight: "800" }, appearanceTextActive: { color: colors.white }, infoPanel: { backgroundColor: colors.redWash, padding: spacing.lg, borderRadius: radii.md }, infoPanelTitle: { color: colors.redDark, fontWeight: "900", fontSize: 14, marginBottom: spacing.sm }, infoPanelText: { color: colors.redDark, fontSize: 13, lineHeight: 19 }, linkRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.line }, linkText: { color: colors.red, fontSize: 13, fontWeight: "800" }, legalText: { color: colors.inkMuted, fontSize: 11, lineHeight: 16, marginTop: spacing.lg }, modalBackdrop: { flex: 1, backgroundColor: "rgba(19,35,61,0.35)", justifyContent: "flex-end" }, locationSheet: { backgroundColor: colors.paper, padding: spacing.xl, borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg }, sheetHandle: { width: 42, height: 5, borderRadius: 3, backgroundColor: colors.line, alignSelf: "center", marginBottom: spacing.xl }, sheetTitle: { color: colors.ink, fontSize: 24, lineHeight: 28, fontWeight: "800", marginBottom: spacing.sm },
  launchScreen: { flex: 1, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" }, launchTitle: { color: colors.white, fontSize: 30, fontWeight: "900", letterSpacing: -0.8, marginTop: spacing.lg }, launchSubtitle: { color: "#B8C4D7", fontSize: 10, fontWeight: "900", letterSpacing: 1.2, marginTop: spacing.sm }, disclosureScreen: { flex: 1, backgroundColor: colors.paper, padding: spacing.lg, justifyContent: "space-between" }, disclosureContent: { alignItems: "flex-start", paddingTop: spacing.xxl }, disclosureEyebrow: { color: colors.red, fontSize: 10, fontWeight: "900", letterSpacing: 1.3, marginTop: spacing.xxl, marginBottom: spacing.md }, disclosureTitle: { color: colors.ink, fontSize: 30, lineHeight: 35, fontWeight: "900", letterSpacing: -0.8, marginBottom: spacing.lg }, disclosureBody: { color: colors.ink, fontSize: 16, lineHeight: 23, marginBottom: spacing.md }, disclosureFooter: { color: colors.inkMuted, fontSize: 11, lineHeight: 16, textAlign: "center", marginTop: spacing.md, marginBottom: spacing.sm },
  tabBar: { height: Platform.OS === "ios" ? 84 : 64, paddingTop: 7, paddingBottom: Platform.OS === "ios" ? 20 : 7, backgroundColor: colors.surface, borderTopColor: colors.line }, tabLabel: { fontSize: 10, fontWeight: "700" },
});

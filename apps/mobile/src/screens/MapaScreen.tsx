import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as ExpoLocation from "expo-location";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useColorScheme, type DimensionValue } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { radii, spacing } from "@manual-samur/design-tokens";
import { accessibilityHints, accessibilityTargetStyle, resolveAdaptivePalette, type AdaptivePalette } from "../accessibility";
import { useContent } from "../content";
import { usePreferences } from "../preferences";
import {
  filterLocations,
  locationRecords,
  locationRouteKey,
  locationSourcePolicy,
  locationStaleNotice,
  schematicNodes,
  sortLocationsByDistance,
  type LocationCoordinate,
  type LocationFilter,
  type LocationKind,
  type LocationRecord,
} from "../location-logic";
import { formatDistanceLabel, mapCameraTargetFor, nearestLocationOfKind, type LocationWithDistance } from "../mapa-logic";
import {
  APPROVED_ONLINE_MAP_POLICY,
  initialOnlineMapState,
  onlineMapFallbackLabel,
  transitionOnlineMapState,
  type OnlineMapRequest,
  type OnlineMapState,
} from "../online-map-logic";
import { classifyOnlineMapFailure, createMapLibreOnlineMapProvider, MAPLIBRE_CARTO_STYLE_URLS } from "../online-map-runtime";
import { OnlineMapView, ONLINE_MAP_ATTRIBUTION_TEXT, type OnlineMapViewRef } from "../online-map-view";
import { downloadMadridOfflinePack, isMadridOfflinePackReady } from "../offline-map-pack-runtime";
import {
  initialOfflineMapPackState,
  offlineMapPackCanDownload,
  offlineMapPackIsReady,
  offlineMapPackLabel,
  transitionOfflineMapPackState,
  type OfflineMapPackState,
} from "../offline-map-pack-logic";
import type { RootStackParamList, TabsParamList } from "../navigation-types";

/** Geographic center of Madrid, used as the map's default camera before any hospital, base or user location has been focused. */
const MADRID_MAP_CENTER: [longitude: number, latitude: number] = [-3.7038, 40.4168];

function useActivePalette(): AdaptivePalette {
  const scheme = useColorScheme();
  const { appearance } = usePreferences();
  return resolveAdaptivePalette(appearance === "system" ? scheme : appearance);
}

function mapPercent(value: number): DimensionValue {
  return (`${value}%`) as DimensionValue;
}

/**
 * Mapa (T5e). The owner's explicit redirect: this must open on a full-screen map, not
 * a directory list, with the hospital-nearest / Status 4 / list-and-filter controls
 * floating over it. `nav-shell.tsx`'s glass tab bar and search capsule both float at
 * the *bottom* of the screen, so every floating control here lives near the top and
 * never has to fight them for space.
 *
 * Before the online map is activated (see online-map-logic.ts — activation is always
 * an explicit user action, permission is never requested on load) the full-bleed base
 * layer is the offline vector schematic, which already needs no network. That keeps
 * the screen "a map first" honestly even before the owner's online map is turned on,
 * and it is the same fallback surface every online-map failure mode already drops back
 * to.
 */
export function MapaScreen({ navigation }: BottomTabScreenProps<TabsParamList, "Mapa">) {
  const { content } = useContent();
  const palette = useActivePalette();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const policy = locationSourcePolicy;
  const mapPolicy = APPROVED_ONLINE_MAP_POLICY;
  const styleUrl = scheme === "dark" ? MAPLIBRE_CARTO_STYLE_URLS.dark : MAPLIBRE_CARTO_STYLE_URLS.light;

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<LocationFilter>("all");
  const [origin, setOrigin] = useState<LocationCoordinate>();
  const [permission, setPermission] = useState<"idle" | "requesting" | "granted" | "denied" | "unavailable">("idle");
  const [mapState, setMapState] = useState<OnlineMapState>(() => initialOnlineMapState(mapPolicy));
  const [sheetOpen, setSheetOpen] = useState(false);
  const [nearestBanner, setNearestBanner] = useState<{ kind: LocationKind; location: LocationWithDistance } | undefined>();
  const [offlinePack, setOfflinePack] = useState<OfflineMapPackState>(initialOfflineMapPackState);
  const lastSnapshotRef = useRef(false);
  const mapRef = useRef<OnlineMapViewRef>(null);
  const pendingFocusRef = useRef<[longitude: number, latitude: number] | undefined>(undefined);

  const locations = useMemo(() => locationRecords(content, policy), [content, policy]);
  const mapProvider = useMemo(
    () => createMapLibreOnlineMapProvider(locations, styleUrl, () => isMadridOfflinePackReady(styleUrl)),
    [locations, styleUrl],
  );
  const visibleLocations = useMemo(() => {
    const filtered = filterLocations(locations, query, filter);
    return origin ? sortLocationsByDistance(filtered, origin) : (filtered as LocationWithDistance[]);
  }, [filter, locations, origin, query]);
  const schematic = useMemo(() => schematicNodes(locations), [locations]);

  const requestLocation = useCallback(async (): Promise<"granted" | "denied" | "unavailable" | "requesting"> => {
    if (permission === "requesting") return "requesting";
    setPermission("requesting");
    try {
      const response = await ExpoLocation.requestForegroundPermissionsAsync();
      if (response.status !== ExpoLocation.PermissionStatus.GRANTED) {
        setOrigin(undefined);
        setPermission("denied");
        return "denied";
      }
      const position = await ExpoLocation.getCurrentPositionAsync({ accuracy: ExpoLocation.Accuracy.Low });
      setOrigin({ lat: position.coords.latitude, lng: position.coords.longitude });
      setPermission("granted");
      return "granted";
    } catch {
      setOrigin(undefined);
      setPermission("unavailable");
      return "unavailable";
    }
  }, [permission]);

  const loadOnlineMap = useCallback(async (request: OnlineMapRequest) => {
    setMapState((previous) => transitionOnlineMapState(previous, { type: "request", request }, mapPolicy));
    try {
      const snapshot = await mapProvider.fetch(request);
      lastSnapshotRef.current = true;
      setMapState((previous) => transitionOnlineMapState(previous, { type: "success", snapshot }, mapPolicy));
    } catch (error) {
      const reason = classifyOnlineMapFailure(error, lastSnapshotRef.current);
      setMapState((previous) => transitionOnlineMapState(previous, { type: "failure", reason }, mapPolicy));
    }
  }, [mapPolicy, mapProvider]);

  // Explicit user action only: nothing here fires on mount. Pressing "Mostrar mapa en
  // vivo" is what may first ask for location permission (to center the map), and only
  // then fetches the online basemap. A denial stops before any network request. When
  // the Madrid offline pack is already downloaded for this style, `mapProvider.fetch`
  // skips the network reachability probe entirely (see online-map-runtime.ts) — this
  // is what makes the map genuinely usable with no signal.
  const activateOnlineMap = useCallback(async () => {
    let effectivePermission = permission;
    if (permission === "idle") effectivePermission = await requestLocation();
    if (effectivePermission === "denied") {
      setMapState((previous) => transitionOnlineMapState(previous, { type: "failure", reason: "permission-denied" }, mapPolicy));
      return;
    }
    await loadOnlineMap({ query, filter, currentLocation: origin });
  }, [filter, loadOnlineMap, mapPolicy, origin, permission, query, requestLocation]);

  const retryOnlineMap = () => { void loadOnlineMap({ query, filter, currentLocation: origin }); };

  // Once the map comes online, run any camera move a tap queued up while it was still
  // the offline schematic (e.g. "hospital más cercano" pressed before the first
  // activation) — see focusLocation below.
  useEffect(() => {
    if (mapState.status === "online" && pendingFocusRef.current) {
      mapRef.current?.moveTo(pendingFocusRef.current);
      pendingFocusRef.current = undefined;
    }
  }, [mapState.status]);

  const focusLocation = useCallback((location: Pick<LocationRecord, "lat" | "lng">) => {
    const target = mapCameraTargetFor(location);
    if (mapState.status === "online") {
      mapRef.current?.moveTo(target);
    } else {
      pendingFocusRef.current = target;
      void activateOnlineMap();
    }
  }, [activateOnlineMap, mapState.status]);

  const openLocationDetail = (routeKey: string) => {
    navigation.getParent<NativeStackNavigationProp<RootStackParamList>>()?.navigate("Location", { routeKey });
  };

  // `requestLocation` stores the resolved coordinate in `origin` state asynchronously;
  // this effect reacts to that instead of threading the coordinate back through a
  // promise chain, so it also covers the case where `origin` was already set from an
  // earlier "Usar mi ubicación" tap and no new permission request is needed at all.
  const [pendingNearestKind, setPendingNearestKind] = useState<LocationKind>();
  useEffect(() => {
    if (!pendingNearestKind || !origin) return;
    const nearest = nearestLocationOfKind(locations, origin, pendingNearestKind);
    setPendingNearestKind(undefined);
    if (!nearest) return;
    setNearestBanner({ kind: pendingNearestKind, location: nearest });
    focusLocation(nearest);
  }, [focusLocation, locations, origin, pendingNearestKind]);

  const onPressNearest = async (kind: LocationKind) => {
    let effectivePermission = permission;
    if (permission === "idle") effectivePermission = await requestLocation();
    if (effectivePermission === "denied" || effectivePermission === "unavailable") {
      setNearestBanner(undefined);
      setMapState((previous) => transitionOnlineMapState(previous, { type: "failure", reason: "permission-denied" }, mapPolicy));
      return;
    }
    setPendingNearestKind(kind);
  };

  const checkOfflinePack = useCallback(async () => {
    setOfflinePack((previous) => transitionOfflineMapPackState(previous, { type: "check-start" }));
    try {
      const ready = await isMadridOfflinePackReady(styleUrl);
      setOfflinePack((previous) => transitionOfflineMapPackState(previous, ready ? { type: "check-found-ready" } : { type: "check-found-absent" }));
    } catch (error) {
      setOfflinePack((previous) => transitionOfflineMapPackState(previous, { type: "check-error", message: error instanceof Error ? error.message : "error desconocido" }));
    }
  }, [styleUrl]);

  // Checking whether a pack already exists reads the local offline database — no
  // network — so this is safe to run once the list/filter sheet (where the control
  // lives) opens, without violating the "no network on load" rule for the screen
  // itself.
  useEffect(() => {
    if (sheetOpen) void checkOfflinePack();
  }, [checkOfflinePack, sheetOpen]);

  const downloadOfflinePack = async () => {
    setOfflinePack((previous) => transitionOfflineMapPackState(previous, { type: "download-start" }));
    try {
      await downloadMadridOfflinePack(
        styleUrl,
        (percentage) => setOfflinePack((previous) => transitionOfflineMapPackState(previous, { type: "progress", percentage })),
        (message) => setOfflinePack((previous) => transitionOfflineMapPackState(previous, { type: "download-error", message })),
      );
      setOfflinePack((previous) => transitionOfflineMapPackState(previous, { type: "download-complete" }));
    } catch (error) {
      setOfflinePack((previous) => transitionOfflineMapPackState(previous, { type: "download-error", message: error instanceof Error ? error.message : "error desconocido" }));
    }
  };

  return (
    <View style={styles.fill}>
      {mapState.status === "online" ? (
        <OnlineMapView
          ref={mapRef}
          dark={scheme === "dark"}
          pins={mapState.snapshot.pins}
          center={origin ? [origin.lng, origin.lat] : MADRID_MAP_CENTER}
          onPinPress={(pin) => openLocationDetail(pin.locationRouteKey)}
          onLoadError={() => setMapState((previous) => transitionOnlineMapState(previous, { type: "failure", reason: "provider-error" }, mapPolicy))}
          markerColor={palette.red}
          markerColorBase={palette.ink}
        />
      ) : (
        <View style={styles.schematicFill} accessible={false} accessibilityLabel={`Esquema offline con ${schematic.length} puntos; consulta la Vista accesible en Lista y filtro`}>
          <View style={styles.mapRoadOne} />
          <View style={styles.mapRoadTwo} />
          <View style={styles.mapRoadThree} />
          {schematic.map((item, index) => (
            <Pressable
              key={`${item.kind}-${item.id}`}
              onPress={() => focusLocation(item)}
              style={[styles.mapPin, item.kind === "hospital" ? styles.mapPinRed : styles.mapPinNavy, { left: mapPercent(6 + ((index * 31) % 86)), top: mapPercent(14 + ((index * 47) % 68)) }]}
              accessibilityRole="button"
              accessibilityLabel={`${item.kind === "hospital" ? "Hospital " : "Base "}${item.name}`}
              accessibilityHint={accessibilityHints.openDetail}
            >
              <MaterialCommunityIcons name={item.kind === "hospital" ? "hospital-building" : "ambulance"} size={13} color={palette.white} />
            </Pressable>
          ))}
          <View style={styles.mapCompass}><Text style={styles.mapCompassN}>N</Text><MaterialCommunityIcons name="navigation" size={18} color={palette.red} /></View>
        </View>
      )}

      <View pointerEvents="box-none" style={[styles.topOverlay, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.titleRow} pointerEvents="none">
          <Text style={styles.pageTitle}>Mapa</Text>
          <Text style={styles.pageKicker}>MADRID · OFFLINE + ONLINE</Text>
        </View>

        {mapState.status === "disabled" && (
          <View style={styles.banner} accessibilityLiveRegion="polite" accessibilityLabel="Mapa online desactivado">
            <MaterialCommunityIcons name="map-marker-off-outline" size={18} color={palette.amber} />
            <Text style={styles.bannerText}>Mapa online no habilitado. El directorio y el esquema accesible siguen disponibles.</Text>
          </View>
        )}
        {(mapState.status === "idle" || mapState.status === "fallback") && (
          <Pressable onPress={() => void activateOnlineMap()} style={styles.primaryPill} accessibilityRole="button" accessibilityLabel="Mostrar mapa online" accessibilityHint="Activa el mapa en vivo con MapLibre y CARTO sobre OpenStreetMap. Puede solicitar permiso de ubicación.">
            <MaterialCommunityIcons name="map-outline" size={18} color={palette.white} />
            <Text style={styles.primaryPillText}>Mostrar mapa online</Text>
          </Pressable>
        )}
        {mapState.status === "loading" && (
          <View style={styles.banner} accessibilityLiveRegion="polite">
            <MaterialCommunityIcons name="map-clock-outline" size={18} color={palette.inkMuted} />
            <Text style={styles.bannerText}>Cargando mapa online…</Text>
          </View>
        )}
        {mapState.status === "fallback" && (
          <View style={styles.banner} accessibilityLiveRegion="polite">
            <MaterialCommunityIcons name="map-marker-path" size={18} color={palette.amber} />
            <Text style={styles.bannerText}>{onlineMapFallbackLabel(mapState.reason)}</Text>
          </View>
        )}
        {permission === "denied" && (
          <View style={styles.banner} accessibilityLiveRegion="polite">
            <MaterialCommunityIcons name="map-marker-off-outline" size={18} color={palette.amber} />
            <Text style={styles.bannerText}>Permiso de ubicación denegado. El directorio sigue disponible; puedes abrir un punto en Mapas.</Text>
          </View>
        )}
        {nearestBanner && (
          <Pressable onPress={() => openLocationDetail(locationRouteKey(nearestBanner.location))} style={styles.nearestBanner} accessibilityRole="button" accessibilityLabel={`${nearestBanner.kind === "hospital" ? "Hospital" : "Base"} más cercano: ${nearestBanner.location.shortName}. ${formatDistanceLabel(nearestBanner.location.distanceMeters) ?? ""}`} accessibilityHint={accessibilityHints.openDetail}>
            <MaterialCommunityIcons name={nearestBanner.kind === "hospital" ? "hospital-building" : "ambulance"} size={18} color={palette.ink} />
            <View style={styles.nearestBannerCopy}>
              <Text style={styles.nearestBannerTitle}>{nearestBanner.location.shortName}</Text>
              <Text style={styles.nearestBannerMeta}>{formatDistanceLabel(nearestBanner.location.distanceMeters)}</Text>
            </View>
            <Pressable onPress={() => setNearestBanner(undefined)} hitSlop={10} style={styles.minimumTarget} accessibilityRole="button" accessibilityLabel="Cerrar aviso de punto más cercano">
              <MaterialCommunityIcons name="close" size={18} color={palette.inkMuted} />
            </Pressable>
          </Pressable>
        )}
      </View>

      <View pointerEvents="box-none" style={styles.controlsRow}>
        <Pressable onPress={() => void onPressNearest("hospital")} style={[styles.controlButton, accessibilityTargetStyle()]} accessibilityRole="button" accessibilityLabel="Hospital más cercano" accessibilityHint="Calcula el hospital más cercano por distancia en línea recta y centra el mapa en él.">
          <MaterialCommunityIcons name="hospital-building" size={20} color={palette.ink} />
          <Text style={styles.controlButtonText}>Hospital cercano</Text>
        </Pressable>
        <Pressable onPress={() => navigation.getParent<NativeStackNavigationProp<RootStackParamList>>()?.navigate("Status4")} style={[styles.controlButton, accessibilityTargetStyle()]} accessibilityRole="button" accessibilityLabel="Hoja de referencia Status 4" accessibilityHint="Abre la hoja de referencia Status 4 con los hospitales de destino automático.">
          <MaterialCommunityIcons name="alert-decagram-outline" size={20} color={palette.ink} />
          <Text style={styles.controlButtonText}>Status 4</Text>
        </Pressable>
        <Pressable onPress={() => setSheetOpen(true)} style={[styles.controlButton, accessibilityTargetStyle()]} accessibilityRole="button" accessibilityLabel="Lista y filtro de hospitales y bases" accessibilityHint="Abre la lista de hospitales y bases con búsqueda, filtro y el mapa offline de Madrid.">
          <MaterialCommunityIcons name="format-list-bulleted" size={20} color={palette.ink} />
          <Text style={styles.controlButtonText}>Lista y filtro</Text>
        </Pressable>
      </View>

      {mapState.status === "online" && (
        <View style={styles.onlineMapAttribution} pointerEvents="none">
          <Text style={styles.onlineMapAttributionText}>{ONLINE_MAP_ATTRIBUTION_TEXT}</Text>
        </View>
      )}
      {mapState.status === "online" && (
        <Pressable onPress={retryOnlineMap} style={styles.onlineMapRefresh} accessibilityRole="button" accessibilityLabel="Actualizar mapa online">
          <MaterialCommunityIcons name="refresh" size={16} color={palette.white} />
        </Pressable>
      )}

      <Modal visible={sheetOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSheetOpen(false)}>
        <SafeAreaView style={styles.sheetScreen} edges={["top", "bottom"]}>
          <View style={styles.sheetTopbar}>
            <Text style={styles.sheetTitle}>Hospitales y bases</Text>
            <Pressable onPress={() => setSheetOpen(false)} style={styles.minimumTarget} accessibilityRole="button" accessibilityLabel="Cerrar lista y filtro">
              <MaterialCommunityIcons name="close" size={24} color={palette.ink} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.sheetContent}>
            <View style={styles.locationPolicyNotice} accessibilityLabel="Estado de la fuente de ubicaciones">
              <MaterialCommunityIcons name="check-decagram-outline" size={20} color={palette.green} />
              <Text style={styles.bannerText}>Fuente oficial del SAMUR · paquete del {policy.sourceDate}. El directorio funciona sin red.</Text>
            </View>

            <View style={styles.offlinePackCard} accessibilityLiveRegion="polite">
              <View style={styles.offlinePackHeader}>
                <MaterialCommunityIcons name={offlineMapPackIsReady(offlinePack) ? "cloud-check-outline" : "cloud-download-outline"} size={20} color={offlineMapPackIsReady(offlinePack) ? palette.green : palette.inkMuted} />
                <Text style={styles.offlinePackTitle}>Mapa offline de Madrid</Text>
              </View>
              <Text style={styles.bannerText}>{offlineMapPackLabel(offlinePack)}</Text>
              {offlineMapPackCanDownload(offlinePack) && (
                <Pressable onPress={() => void downloadOfflinePack()} style={styles.secondaryPill} accessibilityRole="button" accessibilityLabel="Descargar mapa offline de Madrid" accessibilityHint="Descarga las teselas del mapa de Madrid para poder usar el mapa sin cobertura.">
                  <Text style={styles.secondaryPillText}>Descargar</Text>
                </Pressable>
              )}
            </View>

            <View style={styles.searchBar}>
              <MaterialCommunityIcons name="magnify" size={18} color={palette.inkMuted} />
              <TextInput style={styles.searchInput} value={query} onChangeText={setQuery} placeholder="Buscar hospitales, bases o direcciones" placeholderTextColor={palette.inkMuted} accessibilityLabel="Buscar hospitales, bases o direcciones" />
            </View>
            <View style={styles.filterRow} accessibilityRole="tablist">
              {(["all", "hospital", "base"] as const).map((item) => (
                <Pressable key={item} onPress={() => setFilter(item)} style={[styles.filterChip, filter === item && styles.filterChipActive]} accessibilityRole="tab" accessibilityLabel={`Filtrar por ${item === "all" ? "todos" : item === "hospital" ? "hospitales" : "bases"}`} accessibilityState={{ selected: filter === item }}>
                  <Text style={[styles.filterText, filter === item && styles.filterTextActive]}>{item === "all" ? "Todos" : item === "hospital" ? "Hospitales" : "Bases"}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable onPress={() => void requestLocation()} disabled={permission === "requesting"} style={styles.locationActionButton} accessibilityRole="button" accessibilityLabel="Usar mi ubicación para ordenar lugares cercanos" accessibilityHint="Solicita permiso de ubicación solo después de activar esta acción." accessibilityState={{ busy: permission === "requesting" }}>
              <MaterialCommunityIcons name="crosshairs-gps" size={18} color={palette.white} />
              <Text style={styles.locationActionText}>{permission === "requesting" ? "Solicitando…" : "Usar mi ubicación"}</Text>
            </Pressable>
            {permission === "unavailable" && (
              <View style={styles.banner}>
                <MaterialCommunityIcons name="crosshairs-off" size={18} color={palette.amber} />
                <Text style={styles.bannerText}>La ubicación no está disponible en este dispositivo. El directorio local no necesita permiso.</Text>
              </View>
            )}

            <View style={styles.accessibleEquivalent} accessible accessibilityLabel="Vista accesible del directorio">
              <Text style={styles.accessibleEquivalentTitle}>Vista accesible</Text>
              <Text style={styles.bannerText}>Esta lista contiene los mismos puntos que el mapa, con nombre, dirección y distrito.</Text>
            </View>
            <View style={styles.cardList}>
              {visibleLocations.map((item) => {
                const stale = locationStaleNotice(item, new Date(), policy);
                return (
                  <View key={`${item.kind}-${item.id}`} style={styles.locationRow}>
                    <Pressable
                      onPress={() => { setSheetOpen(false); focusLocation(item); }}
                      style={styles.locationRowMain}
                      accessibilityRole="button"
                      accessibilityLabel={`${item.kind === "hospital" ? "Hospital " : "Base "}${item.name}. ${item.address}, ${item.district}${formatDistanceLabel(item.distanceMeters) ? `. ${formatDistanceLabel(item.distanceMeters)}` : ""}`}
                      accessibilityHint="Centra el mapa en este punto."
                    >
                      <View style={[styles.locationIcon, item.kind === "base" && styles.locationIconBase]}>
                        <MaterialCommunityIcons name={item.kind === "hospital" ? "hospital-building" : "ambulance"} size={18} color={palette.ink} />
                      </View>
                      <View style={styles.resourceCopy}>
                        <Text style={styles.resourceTitle}>{item.shortName}</Text>
                        <Text style={styles.resourceMeta}>{item.kind === "hospital" ? "Hospital" : "Base"} · {item.district}</Text>
                        <Text style={styles.locationAddress}>{item.address}</Text>
                        {formatDistanceLabel(item.distanceMeters) && <Text style={styles.locationDistance}>{formatDistanceLabel(item.distanceMeters)}</Text>}
                        {stale && <Text style={styles.locationStale}>{stale}</Text>}
                      </View>
                    </Pressable>
                    <Pressable onPress={() => { setSheetOpen(false); openLocationDetail(locationRouteKey(item)); }} style={styles.minimumTarget} accessibilityRole="button" accessibilityLabel={`Abrir ficha de ${item.shortName}`} accessibilityHint={accessibilityHints.openDetail}>
                      <MaterialCommunityIcons name="chevron-right" size={20} color={palette.inkMuted} />
                    </Pressable>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

function createStyles(palette: AdaptivePalette) {
  return StyleSheet.create({
    fill: { flex: 1, backgroundColor: palette.paper },
    minimumTarget: accessibilityTargetStyle(),
    schematicFill: { flex: 1, backgroundColor: palette.surfaceMuted, overflow: "hidden", position: "relative" },
    mapRoadOne: { position: "absolute", width: "180%", height: 60, backgroundColor: palette.paper, transform: [{ rotate: "-24deg" }], top: "22%", left: "-50%" },
    mapRoadTwo: { position: "absolute", width: "150%", height: 30, backgroundColor: palette.paper, transform: [{ rotate: "38deg" }], top: "10%", left: "-20%" },
    mapRoadThree: { position: "absolute", width: 26, height: "160%", backgroundColor: palette.paper, transform: [{ rotate: "15deg" }], top: "-30%", left: "42%" },
    mapPin: { position: "absolute", width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: palette.white },
    mapPinRed: { backgroundColor: palette.red },
    mapPinNavy: { backgroundColor: palette.ink },
    mapCompass: { position: "absolute", top: 15, right: 15, alignItems: "center" },
    mapCompassN: { fontSize: 11, color: palette.ink, fontWeight: "900" },
    topOverlay: { position: "absolute", top: 0, left: 0, right: 0, paddingHorizontal: spacing.lg, gap: spacing.sm },
    titleRow: { marginBottom: spacing.xs },
    pageTitle: { color: palette.ink, fontSize: 26, fontWeight: "800", letterSpacing: -0.7, textShadowColor: palette.paper, textShadowRadius: 8, textShadowOffset: { width: 0, height: 0 } },
    pageKicker: { color: palette.red, fontSize: 10, fontWeight: "800", letterSpacing: 1.2, marginTop: 2 },
    banner: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, backgroundColor: palette.surface, borderRadius: radii.md, borderWidth: 1, borderColor: palette.line, padding: spacing.md },
    bannerText: { flex: 1, color: palette.ink, fontSize: 12, lineHeight: 17 },
    primaryPill: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 44, borderRadius: radii.pill, backgroundColor: palette.ink, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
    primaryPillText: { color: palette.white, fontSize: 13, fontWeight: "800" },
    secondaryPill: { alignSelf: "flex-start", minHeight: 40, borderRadius: radii.pill, borderWidth: 1, borderColor: palette.ink, paddingHorizontal: spacing.lg, alignItems: "center", justifyContent: "center", marginTop: spacing.sm },
    secondaryPillText: { color: palette.ink, fontSize: 12, fontWeight: "800" },
    nearestBanner: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: palette.surface, borderRadius: radii.md, borderWidth: 1, borderColor: palette.line, padding: spacing.md },
    nearestBannerCopy: { flex: 1 },
    nearestBannerTitle: { color: palette.ink, fontSize: 13, fontWeight: "800" },
    nearestBannerMeta: { color: palette.green, fontSize: 11, fontWeight: "700", marginTop: 2 },
    controlsRow: { position: "absolute", left: spacing.lg, right: spacing.lg, bottom: 132, flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" },
    controlButton: { flex: 1, minHeight: 56, borderRadius: radii.md, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line, alignItems: "center", justifyContent: "center", gap: 4, paddingHorizontal: 4 },
    controlButtonText: { color: palette.ink, fontSize: 10, fontWeight: "800", textAlign: "center" },
    // Sits ABOVE the floating controls row (bottom 132 + its height), not on top of it:
    // at bottom 136 the credit was drawn over the "Status 4" and "Lista y filtro"
    // buttons and made both unreadable. Attribution is a licensing obligation, so it
    // has to stay legible, and so do the controls it was covering.
    onlineMapAttribution: { position: "absolute", right: spacing.lg, bottom: 196, backgroundColor: "rgba(255,255,255,0.82)", borderRadius: radii.sm, paddingHorizontal: 6, paddingVertical: 2 },
    onlineMapAttributionText: { fontSize: 10, color: "#13233D" },
    onlineMapRefresh: { position: "absolute", top: 60, right: spacing.lg, width: 36, height: 36, borderRadius: 18, backgroundColor: palette.ink, alignItems: "center", justifyContent: "center" },
    sheetScreen: { flex: 1, backgroundColor: palette.paper },
    sheetTopbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
    sheetTitle: { color: palette.ink, fontSize: 20, fontWeight: "800" },
    sheetContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
    locationPolicyNotice: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, backgroundColor: palette.amberWash, borderRadius: radii.md, padding: spacing.md },
    offlinePackCard: { backgroundColor: palette.surfaceMuted, borderRadius: radii.md, padding: spacing.md, gap: 4 },
    offlinePackHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    offlinePackTitle: { color: palette.ink, fontSize: 13, fontWeight: "800" },
    searchBar: { minHeight: 50, borderRadius: radii.md, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line, flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.md, gap: spacing.sm },
    searchInput: { flex: 1, color: palette.ink, fontSize: 14, paddingVertical: 0 },
    filterRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    filterChip: { minHeight: 40, justifyContent: "center", paddingVertical: 8, paddingHorizontal: 13, borderRadius: radii.pill, backgroundColor: palette.surfaceMuted },
    filterChipActive: { backgroundColor: palette.ink },
    filterText: { color: palette.inkMuted, fontSize: 12, fontWeight: "700" },
    filterTextActive: { color: palette.white },
    locationActionButton: { minHeight: 46, borderRadius: radii.md, backgroundColor: palette.ink, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, paddingHorizontal: spacing.lg },
    locationActionText: { color: palette.white, fontSize: 13, fontWeight: "800" },
    accessibleEquivalent: { backgroundColor: palette.surfaceMuted, borderRadius: radii.md, padding: spacing.md },
    accessibleEquivalentTitle: { color: palette.ink, fontSize: 14, fontWeight: "800", marginBottom: 3 },
    cardList: { backgroundColor: palette.surface, borderRadius: radii.md, borderWidth: 1, borderColor: palette.line, overflow: "hidden" },
    locationRow: { minHeight: 66, paddingHorizontal: spacing.md, flexDirection: "row", alignItems: "center", gap: spacing.sm, borderBottomWidth: 1, borderBottomColor: palette.line },
    locationRowMain: { flex: 1, minHeight: 66, paddingVertical: spacing.md, flexDirection: "row", alignItems: "center", gap: spacing.md },
    locationIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: palette.redWash, alignItems: "center", justifyContent: "center" },
    locationIconBase: { backgroundColor: palette.amberWash },
    resourceCopy: { flex: 1 },
    resourceTitle: { color: palette.ink, fontSize: 14, lineHeight: 18, fontWeight: "700" },
    resourceMeta: { color: palette.inkMuted, fontSize: 11, lineHeight: 16, marginTop: 3 },
    locationAddress: { color: palette.ink, fontSize: 11, lineHeight: 16, marginTop: 2 },
    locationDistance: { color: palette.green, fontSize: 11, fontWeight: "800", lineHeight: 16, marginTop: 2 },
    locationStale: { color: palette.amber, fontSize: 10, lineHeight: 14, marginTop: 2 },
  });
}

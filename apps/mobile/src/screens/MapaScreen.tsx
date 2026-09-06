import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as ExpoLocation from "expo-location";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View, useColorScheme } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { radii, spacing, TAB_BAR_INSET, typography } from "@manual-samur/design-tokens";
import { accessibilityHints, accessibilityTargetStyle, type AdaptivePalette } from "../accessibility";
import { useTheme } from "../theme";
import { useContent } from "../content";
import {
  filterLocations,
  locationRecords,
  locationRouteKey,
  locationSourcePolicy,
  sortLocationsByDistance,
  type LocationCoordinate,
  type LocationFilter,
  type LocationKind,
  type LocationRecord,
} from "../location-logic";
import { formatDistanceLabel, mapCameraTargetFor, nearestLocationOfKind, type LocationWithDistance } from "../mapa-logic";
import { LocationDirectory, PageHeader } from "../components";
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
  MADRID_OFFLINE_PACK_BOUNDS,
  MADRID_OFFLINE_PACK_MAX_ZOOM,
  MADRID_OFFLINE_PACK_MIN_ZOOM,
} from "../offline-map-pack-logic";
import type { RootStackParamList, TabsParamList } from "../navigation-types";

/** Geographic center of Madrid, used as the map's default camera before any hospital, base or user location has been focused. */
const MADRID_MAP_CENTER: [longitude: number, latitude: number] = [-3.7038, 40.4168];

/**
 * The camera is clamped to the same box the offline pack downloads, and to the same zoom
 * range, so the two can never disagree about what "Madrid" means: panning to a region the
 * pack never cached would show blank tiles with no signal, and this app's whole directory
 * is inside this box anyway.
 */
const MADRID_CAMERA_BOUNDS = MADRID_OFFLINE_PACK_BOUNDS;

/** What `requestLocation` resolves to: the outcome, plus the coordinate when there is one. */
type LocationRequestResult =
  | { status: "granted"; coordinate: LocationCoordinate }
  | { status: "denied" | "unavailable" | "requesting" };

/**
 * Mapa. Opens on a live, full-screen map of Madrid, with the hospital-nearest / Status 4
 * / list-and-filter controls floating over it. `nav-shell.tsx`'s glass tab bar floats at
 * the *bottom*, so every floating control here lives near the top and never fights it.
 *
 * The map used to require a "Mostrar mapa online" tap, which meant the map tab opened on
 * a *list*. It now loads on mount — but note precisely what did and did not change:
 *
 *  - The basemap is still gated on `APPROVED_ONLINE_MAP_POLICY`. An unapproved policy
 *    still renders nothing but the directory.
 *  - Location permission is still requested only from an explicit action ("Usar mi
 *    ubicación", "Hospital más cercano"). Auto-activation centres on Madrid, which needs
 *    no permission and reveals nothing about the user. This is the guarantee that
 *    mattered; "the user must tap before any tile loads" was never the point.
 *  - Every failure mode still falls back to the same offline directory.
 *
 * Tiles for the city are cached in the background after the first successful load (see
 * `cacheMadridInBackground`) so the map keeps working with no signal. That used to be a
 * card in the sheet asking the user to decide; it is not a decision worth interrupting
 * someone mid-shift for.
 */
export function MapaScreen({ navigation }: BottomTabScreenProps<TabsParamList, "Mapa">) {
  const { content } = useContent();
  const palette = useTheme();
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
  const cachingRef = useRef(false);
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

  const requestLocation = useCallback(async (): Promise<LocationRequestResult> => {
    if (permission === "requesting") return { status: "requesting" };
    setPermission("requesting");
    try {
      const response = await ExpoLocation.requestForegroundPermissionsAsync();
      if (response.status !== ExpoLocation.PermissionStatus.GRANTED) {
        setOrigin(undefined);
        setPermission("denied");
        return { status: "denied" };
      }
      const position = await ExpoLocation.getCurrentPositionAsync({ accuracy: ExpoLocation.Accuracy.Low });
      const coordinate = { lat: position.coords.latitude, lng: position.coords.longitude };
      setOrigin(coordinate);
      setPermission("granted");
      return { status: "granted", coordinate };
    } catch {
      setOrigin(undefined);
      setPermission("unavailable");
      return { status: "unavailable" };
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

  // Loads the basemap. Deliberately does NOT ask for location: the camera starts on
  // Madrid, which needs no permission, and permission is requested only by the controls
  // that genuinely need to know where the user is. When the Madrid pack is already
  // downloaded for this style, `mapProvider.fetch` skips the network reachability probe
  // entirely (see online-map-runtime.ts) — this is what makes the map usable with no signal.
  const activateOnlineMap = useCallback(async () => {
    await loadOnlineMap({ query, filter, currentLocation: origin });
  }, [filter, loadOnlineMap, origin, query]);

  // Map-first: the tab opens on the map, not on a list waiting for a tap. Kicked off from
  // a task rather than synchronously in the effect body so the first state transition does
  // not cascade a render during mount.
  useEffect(() => {
    let cancelled = false;
    const start = setTimeout(() => { if (!cancelled) void activateOnlineMap(); }, 0);
    return () => { cancelled = true; clearTimeout(start); };
    // Mount only. Re-running this on every query/filter keystroke would refetch the
    // basemap while the user types; `retryOnlineMap` is the deliberate refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  /**
   * "Centrar en mi ubicación". The permission is requested here and nowhere else on
   * mount: the camera opens on Madrid, which needs no permission, so nothing asks until
   * the reader taps a control that genuinely needs to know where they are.
   *
   * A refusal does NOT fire the state machine's `permission-denied` failure the way
   * `onPressNearest` does. That transition drops the map for the offline directory, which
   * is the right answer when the whole point of the tap was a distance calculation, but
   * here it would take the map away as a punishment for declining. The denied banner
   * above says what happened and the list sheet keeps the offline directory one tap away.
   */
  const onPressCenterOnMe = async () => {
    const result = origin ? ({ status: "granted", coordinate: origin } as const) : await requestLocation();
    if (result.status !== "granted") return;
    focusLocation(result.coordinate);
  };

  const onPressNearest = async (kind: LocationKind) => {
    // The coordinate comes back from the request itself. It used to be read out of
    // `origin` by an effect watching for the state to land, which meant a setState
    // cascade on every permission grant for no gain.
    let coordinate = origin;
    if (!coordinate) {
      const result = await requestLocation();
      if (result.status === "requesting") return;
      if (result.status !== "granted") {
        setNearestBanner(undefined);
        setMapState((previous) => transitionOnlineMapState(previous, { type: "failure", reason: "permission-denied" }, mapPolicy));
        return;
      }
      coordinate = result.coordinate;
    }
    const nearest = nearestLocationOfKind(locations, coordinate, kind);
    if (!nearest) return;
    setNearestBanner({ kind, location: nearest });
    focusLocation(nearest);
  };

  /**
   * Cache the city's tiles once, in the background, after the map has actually come
   * online. Failures are swallowed on purpose: the map already works, and there is
   * nothing the user could do about a caching error that is worth a banner.
   */
  const cacheMadridInBackground = useCallback(async () => {
    if (cachingRef.current) return;
    cachingRef.current = true;
    try {
      if (await isMadridOfflinePackReady(styleUrl)) return;
      await downloadMadridOfflinePack(styleUrl, () => undefined, () => undefined);
    } catch {
      cachingRef.current = false;
    }
  }, [styleUrl]);

  useEffect(() => {
    if (mapState.status === "online") void cacheMadridInBackground();
  }, [cacheMadridInBackground, mapState.status]);

  const online = mapState.status === "online";
  return (
    <View style={styles.fill}>
      {online && (
        <OnlineMapView
          ref={mapRef}
          dark={scheme === "dark"}
          pins={mapState.status === "online" ? mapState.snapshot.pins : []}
          center={origin ? [origin.lng, origin.lat] : MADRID_MAP_CENTER}
          bounds={MADRID_CAMERA_BOUNDS}
          minZoom={MADRID_OFFLINE_PACK_MIN_ZOOM}
          maxZoom={MADRID_OFFLINE_PACK_MAX_ZOOM}
          userLocation={origin ? [origin.lng, origin.lat] : undefined}
          onPinPress={(pin) => openLocationDetail(pin.locationRouteKey)}
          onLoadError={() => setMapState((previous) => transitionOnlineMapState(previous, { type: "failure", reason: "provider-error" }, mapPolicy))}
          markerColor={palette.primary}
          markerColorBase={palette.ink}
        />
      )}
      <View pointerEvents="box-none" style={[online ? styles.topOverlay : styles.topStack, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.titleRow} pointerEvents="none">
          <Text style={styles.pageTitle}>Mapa</Text>
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
            <Text style={styles.primaryPillText} numberOfLines={1} maxFontSizeMultiplier={1.6}>Mostrar mapa online</Text>
          </Pressable>
        )}
        {!online && (
          <Pressable onPress={() => navigation.getParent<NativeStackNavigationProp<RootStackParamList>>()?.navigate("Status4")} style={styles.secondaryPill} accessibilityRole="button" accessibilityLabel="Hoja de referencia Status 4" accessibilityHint="Abre la hoja de referencia Status 4 con los hospitales de destino automático.">
            <MaterialCommunityIcons name="alert-decagram-outline" size={16} color={palette.ink} />
            <Text style={styles.secondaryPillText} numberOfLines={1} maxFontSizeMultiplier={1.6}>Status 4</Text>
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

      {!online && (
        // With the online map off there is nothing geographic to draw, so the tab
        // shows what it actually has: the directory. The previous fallback laid
        // ~60 identical pins at `(index * 31) % 86` percent of the viewport —
        // positions generated from list order, not coordinates. It read as a map
        // of Madrid and was not one, and its own accessibility label already sent
        // users to the list instead.
        <LocationDirectory
          locations={visibleLocations}
          query={query}
          onQueryChange={setQuery}
          filter={filter}
          onFilterChange={setFilter}
          policy={policy}
          palette={palette}
          hasDistances={Boolean(origin)}
          onOpen={(item) => openLocationDetail(locationRouteKey(item))}
        />
      )}

      {online && <View pointerEvents="box-none" style={styles.controlsRow}>
        <Pressable onPress={() => void onPressCenterOnMe()} disabled={permission === "requesting"} style={[styles.controlButton, accessibilityTargetStyle()]} accessibilityRole="button" accessibilityLabel="Centrar en mi ubicación" accessibilityHint="Solicita permiso de ubicación solo al pulsar y centra el mapa en tu posición." accessibilityState={{ busy: permission === "requesting", disabled: permission === "requesting" }}>
          <MaterialCommunityIcons name="crosshairs-gps" size={20} color={permission === "granted" ? palette.primary : palette.ink} />
          <Text style={styles.controlButtonText} numberOfLines={2} maxFontSizeMultiplier={1.5}>Mi ubicación</Text>
        </Pressable>
        <Pressable onPress={() => void onPressNearest("hospital")} style={[styles.controlButton, accessibilityTargetStyle()]} accessibilityRole="button" accessibilityLabel="Hospital más cercano" accessibilityHint="Calcula el hospital más cercano por distancia directa y centra el mapa en él.">
          <MaterialCommunityIcons name="hospital-building" size={20} color={palette.ink} />
          <Text style={styles.controlButtonText} numberOfLines={2} maxFontSizeMultiplier={1.5}>Hospital cercano</Text>
        </Pressable>
        <Pressable onPress={() => navigation.getParent<NativeStackNavigationProp<RootStackParamList>>()?.navigate("Status4")} style={[styles.controlButton, accessibilityTargetStyle()]} accessibilityRole="button" accessibilityLabel="Hoja de referencia Status 4" accessibilityHint="Abre la hoja de referencia Status 4 con los hospitales de destino automático.">
          <MaterialCommunityIcons name="alert-decagram-outline" size={20} color={palette.ink} />
          <Text style={styles.controlButtonText} numberOfLines={2} maxFontSizeMultiplier={1.5}>Status 4</Text>
        </Pressable>
        <Pressable onPress={() => setSheetOpen(true)} style={[styles.controlButton, accessibilityTargetStyle()]} accessibilityRole="button" accessibilityLabel="Lista y filtro de hospitales y bases" accessibilityHint="Abre la lista de hospitales y bases con búsqueda, filtro y el mapa offline de Madrid.">
          <MaterialCommunityIcons name="format-list-bulleted" size={20} color={palette.ink} />
          <Text style={styles.controlButtonText} numberOfLines={2} maxFontSizeMultiplier={1.5}>Lista y filtro</Text>
        </Pressable>
      </View>}

      {mapState.status === "online" && (
        <View style={styles.onlineMapAttribution} pointerEvents="none">
          <Text style={styles.onlineMapAttributionText} numberOfLines={1} maxFontSizeMultiplier={1.2}>{ONLINE_MAP_ATTRIBUTION_TEXT}</Text>
        </View>
      )}
      {mapState.status === "online" && (
        <Pressable onPress={retryOnlineMap} style={styles.onlineMapRefresh} accessibilityRole="button" accessibilityLabel="Actualizar mapa online">
          <MaterialCommunityIcons name="refresh" size={16} color={palette.white} />
        </Pressable>
      )}

      <Modal visible={sheetOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSheetOpen(false)}>
        <SafeAreaView style={styles.sheetScreen} edges={["top", "bottom"]}>
          {/*
            The sheet used to hand-roll its own search field, its own three filter pills
            and its own row layout — all of which `LocationDirectory` already draws for
            the offline fallback, three metres up the same file. One list, one set of
            filters, one row anatomy.
          */}
          <PageHeader
            title="Hospitales y bases"
            trailing={
              <Pressable onPress={() => setSheetOpen(false)} style={styles.minimumTarget} accessibilityRole="button" accessibilityLabel="Cerrar lista y filtro" accessibilityHint={accessibilityHints.dismiss}>
                <MaterialCommunityIcons name="close" size={24} color={palette.ink} />
              </Pressable>
            }
          />
          <View style={styles.sheetTop}>
            <View style={styles.locationPolicyNotice} accessibilityLabel="Estado de la fuente de ubicaciones">
              <MaterialCommunityIcons name="check-decagram-outline" size={20} color={palette.green} />
              <Text style={styles.bannerText}>Fuente oficial del SAMUR · paquete del {policy.sourceDate}.</Text>
            </View>
            <Pressable onPress={() => void requestLocation()} disabled={permission === "requesting"} style={styles.locationActionButton} accessibilityRole="button" accessibilityLabel="Usar mi ubicación para ordenar lugares cercanos" accessibilityHint="Solicita permiso de ubicación solo después de activar esta acción." accessibilityState={{ busy: permission === "requesting" }}>
              <MaterialCommunityIcons name="crosshairs-gps" size={18} color={palette.paper} />
              <Text style={styles.locationActionText}>{permission === "requesting" ? "Solicitando…" : "Usar mi ubicación"}</Text>
            </Pressable>
            {permission === "unavailable" && (
              <View style={styles.banner}>
                <MaterialCommunityIcons name="crosshairs-off" size={18} color={palette.amber} />
                <Text style={styles.bannerText}>La ubicación no está disponible en este dispositivo. El directorio local no necesita permiso.</Text>
              </View>
            )}
          </View>
          <LocationDirectory
            locations={visibleLocations}
            query={query}
            onQueryChange={setQuery}
            filter={filter}
            onFilterChange={setFilter}
            policy={policy}
            palette={palette}
            hasDistances={Boolean(origin)}
            onOpen={(item) => { setSheetOpen(false); focusLocation(item); }}
          />
        </SafeAreaView>
      </Modal>
    </View>
  );
}

function createStyles(palette: AdaptivePalette) {
  return StyleSheet.create({
    fill: { flex: 1, backgroundColor: palette.paper },
    minimumTarget: accessibilityTargetStyle(),
    topOverlay: { position: "absolute", top: 0, left: 0, right: 0, paddingHorizontal: spacing.lg, gap: spacing.sm },
    titleRow: { marginBottom: spacing.xs },
    pageTitle: { color: palette.ink, fontSize: typography.largeTitle.fontSize, lineHeight: typography.largeTitle.lineHeight, fontWeight: "700", letterSpacing: -0.8, textShadowColor: palette.paper, textShadowRadius: 8, textShadowOffset: { width: 0, height: 0 } },
    banner: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, backgroundColor: palette.surface, borderRadius: radii.md, borderWidth: 1, borderColor: palette.line, padding: spacing.md },
    bannerText: { flex: 1, color: palette.ink, fontSize: 12, lineHeight: 17 },
    primaryPill: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 44, borderRadius: radii.pill, backgroundColor: palette.ink, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
    primaryPillText: { color: palette.paper, fontSize: 13, fontWeight: "800" },
    secondaryPill: { alignSelf: "flex-start", minHeight: 40, borderRadius: radii.pill, borderWidth: 1, borderColor: palette.ink, paddingHorizontal: spacing.lg, alignItems: "center", justifyContent: "center", marginTop: spacing.sm },
    secondaryPillText: { color: palette.ink, fontSize: 12, fontWeight: "800" },
    nearestBanner: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: palette.surface, borderRadius: radii.md, borderWidth: 1, borderColor: palette.line, padding: spacing.md },
    nearestBannerCopy: { flex: 1 },
    nearestBannerTitle: { color: palette.ink, fontSize: 13, fontWeight: "800" },
    nearestBannerMeta: { color: palette.green, fontSize: 11, fontWeight: "700", marginTop: 2 },
    topStack: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, gap: spacing.sm, alignItems: "flex-start" },
    controlsRow: { position: "absolute", left: spacing.lg, right: spacing.lg, bottom: TAB_BAR_INSET + spacing.sm, flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" },
    controlButton: { flex: 1, minHeight: 56, borderRadius: radii.md, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.lineStrong, alignItems: "center", justifyContent: "center", gap: 4, paddingHorizontal: 4 },
    controlButtonText: { color: palette.ink, fontSize: 12, fontWeight: "600", textAlign: "center" },
    // Sits ABOVE the floating controls row (bottom 132 + its height), not on top of it:
    // at bottom 136 the credit was drawn over the "Status 4" and "Lista y filtro"
    // buttons and made both unreadable. Attribution is a licensing obligation, so it
    // has to stay legible, and so do the controls it was covering.
    onlineMapAttribution: { position: "absolute", right: spacing.lg, bottom: TAB_BAR_INSET + 52, backgroundColor: "rgba(255,255,255,0.82)", borderRadius: radii.sm, paddingHorizontal: 6, paddingVertical: 2 },
    onlineMapAttributionText: { fontSize: 10, color: "#13233D" },
    onlineMapRefresh: { position: "absolute", top: 60, right: spacing.lg, width: 36, height: 36, borderRadius: 18, backgroundColor: palette.ink, alignItems: "center", justifyContent: "center" },
    sheetScreen: { flex: 1, backgroundColor: palette.paper },
    sheetTop: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: spacing.sm },
    locationPolicyNotice: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, backgroundColor: palette.amberWash, borderRadius: radii.md, padding: spacing.md },
    locationActionButton: { minHeight: 46, borderRadius: radii.md, backgroundColor: palette.ink, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, paddingHorizontal: spacing.lg },
    locationActionText: { color: palette.paper, fontSize: 13, fontWeight: "800" },
  });
}

import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Camera, Map, Marker, type CameraRef } from "@maplibre/maplibre-react-native";
import { useReduceMotion } from "./hooks/motion.ts";
import { useImperativeHandle, useRef, type Ref } from "react";
import { StyleSheet, View } from "react-native";
import type { AdaptivePalette } from "@manual-samur/design-tokens";
import { locationVisual } from "./location-logic.ts";
import type { OnlineMapPin } from "./online-map-logic.ts";
import { MAPLIBRE_CARTO_STYLE_URLS } from "./online-map-runtime.ts";

/**
 * Text shown alongside the native attribution control so the OSM + CARTO credit is
 * legible without the viewer having to tap anything — a licensing obligation, not a
 * nicety. Kept as a plain, always-rendered row rather than relying solely on
 * MapLibre's tap-to-reveal attribution button.
 */
export const ONLINE_MAP_ATTRIBUTION_TEXT = "© OpenStreetMap contributors · © CARTO";

export interface OnlineMapViewProps {
  dark: boolean;
  pins: OnlineMapPin[];
  center: [longitude: number, latitude: number];
  zoom?: number;
  /**
   * Camera clamp, `[west, south, east, north]`. The directory only covers Madrid, so a
   * map that pans to the Atlantic is a map showing nothing this app can answer for.
   */
  bounds?: [west: number, south: number, east: number, north: number];
  minZoom?: number;
  maxZoom?: number;
  /**
   * The reader's own position, `[longitude, latitude]`, once they have granted permission
   * from the "Mi ubicación" control. Undefined until then — the map never plots a dot the
   * reader did not ask for.
   */
  userLocation?: [longitude: number, latitude: number];
  palette: AdaptivePalette;
  onPinPress: (pin: OnlineMapPin) => void;
  onLoadError: () => void;
  ref?: Ref<OnlineMapViewRef>;
}

/**
 * Imperative escape hatch for "tapping a hospital moves the map to its position" (T5e):
 * the declarative `center` prop only sets the *initial* camera, so a caller that wants
 * to re-center an already-mounted map (from the floating "hospital más cercano" button
 * or the list/filter sheet) calls `moveTo` instead of remounting the map.
 */
export interface OnlineMapViewRef {
  moveTo(coordinate: [longitude: number, latitude: number], zoom?: number): void;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  markerDot: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  userDot: { width: 18, height: 18, borderRadius: 9, borderWidth: 3, borderColor: "#FFFFFF", backgroundColor: "#1D4ED8" },
});

/**
 * The actual MapLibre-rendered surface. Deliberately dumb: it only draws the style,
 * camera and pins it is handed, and reports style-load failures upward via
 * `onLoadError` so the screen can classify and fall back. No routing, no
 * turn-by-turn, no travel-time claims, no offline cartography — the online map only
 * ever shows the same offline location directory as pins on a live basemap.
 */
/**
 * Mas largo que cualquier duracion de `motion`, y a proposito: la camara recorre
 * kilometros de mapa y el usuario necesita ver por donde va para no perder el
 * sitio. Un salto de 240 ms desorienta.
 */
const CAMERA_EASE_MS = 650;

export function OnlineMapView({ dark, pins, center, zoom = 11, bounds, minZoom, maxZoom, userLocation, palette, onPinPress, onLoadError, ref }: OnlineMapViewProps) {
  const cameraRef = useRef<CameraRef>(null);
  const reduceMotion = useReduceMotion();
  useImperativeHandle(ref, () => ({
    moveTo(coordinate, targetZoom) {
      // El vuelo de camara tambien es movimiento: con Reduce Motion la camara salta
      // al destino en vez de recorrer el mapa. El resultado es el mismo encuadre.
      cameraRef.current?.easeTo({ center: coordinate, zoom: targetZoom ?? 15, duration: reduceMotion ? 0 : CAMERA_EASE_MS });
    },
  }), [reduceMotion]);
  return (
    <View style={styles.fill}>
      <Map style={styles.fill} mapStyle={dark ? MAPLIBRE_CARTO_STYLE_URLS.dark : MAPLIBRE_CARTO_STYLE_URLS.light} attribution attributionPosition={{ bottom: 6, left: 6 }} logo={false} onDidFailLoadingMap={onLoadError}>
        <Camera ref={cameraRef} initialViewState={{ center, zoom }} maxBounds={bounds} minZoom={minZoom} maxZoom={maxZoom} />
        {pins.map((pin) => {
          const visual = locationVisual(pin, palette);
          return <Marker key={pin.id} id={pin.id} lngLat={[pin.coordinate.lng, pin.coordinate.lat]} onPress={() => onPinPress(pin)}>
            <View style={[styles.markerDot, { backgroundColor: visual.color }]} accessibilityRole="button" accessibilityLabel={`${visual.label} ${pin.title}`} accessibilityHint="Abre los detalles de esta ubicación.">
              <MaterialCommunityIcons name={visual.icon} size={13} color={palette.paper} />
            </View>
          </Marker>;
        })}
        {userLocation && (
          <Marker id="user-location" lngLat={userLocation}>
            <View style={styles.userDot} accessibilityLabel="Tu ubicación" />
          </Marker>
        )}
      </Map>
    </View>
  );
}

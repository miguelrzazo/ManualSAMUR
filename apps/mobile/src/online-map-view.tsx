import { Camera, Map, Marker } from "@maplibre/maplibre-react-native";
import { StyleSheet, View } from "react-native";
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
  onPinPress: (pin: OnlineMapPin) => void;
  onLoadError: () => void;
  markerColor: string;
  markerColorBase: string;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  markerDot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: "#FFFFFF" },
});

/**
 * The actual MapLibre-rendered surface. Deliberately dumb: it only draws the style,
 * camera and pins it is handed, and reports style-load failures upward via
 * `onLoadError` so the screen can classify and fall back. No routing, no
 * turn-by-turn, no travel-time claims, no offline cartography — the online map only
 * ever shows the same offline location directory as pins on a live basemap.
 */
export function OnlineMapView({ dark, pins, center, zoom = 11, onPinPress, onLoadError, markerColor, markerColorBase }: OnlineMapViewProps) {
  return (
    <View style={styles.fill}>
      <Map style={styles.fill} mapStyle={dark ? MAPLIBRE_CARTO_STYLE_URLS.dark : MAPLIBRE_CARTO_STYLE_URLS.light} attribution attributionPosition={{ bottom: 6, left: 6 }} logo={false} onDidFailLoadingMap={onLoadError}>
        <Camera initialViewState={{ center, zoom }} />
        {pins.map((pin) => (
          <Marker key={pin.id} id={pin.id} lngLat={[pin.coordinate.lng, pin.coordinate.lat]} onPress={() => onPinPress(pin)}>
            <View style={[styles.markerDot, { backgroundColor: pin.kind === "hospital" ? markerColor : markerColorBase }]} />
          </Marker>
        ))}
      </Map>
    </View>
  );
}

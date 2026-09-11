import { filterLocations, sortLocationsByDistance, type LocationCoordinate, type LocationKind, type LocationRecord } from "./location-logic.ts";
import { MADRID_OFFLINE_PACK_BOUNDS } from "./offline-map-pack-logic.ts";

/**
 * Pure helpers for the full-screen Mapa (T5e). Kept apart from React Native and
 * MapLibre imports so they stay testable under plain Node, matching the pattern
 * `codigos-logic.ts` and `manual-tree-logic.ts` already use for their screens.
 */

export type LocationWithDistance = LocationRecord & { distanceMeters?: number };

/** MapLibre coordinate order is [longitude, latitude] — the opposite of `LocationRecord`'s lat/lng fields. Centralising the flip here keeps every camera-move call site from re-deriving it (and getting it backwards). */
export function mapCameraTargetFor(location: Pick<LocationRecord, "lat" | "lng">): [longitude: number, latitude: number] {
  return [location.lng, location.lat];
}

/**
 * ¿Cae la coordenada dentro de la caja que ya usan tanto la cámara del mapa online
 * (`maxBounds` en `OnlineMapView`) como el paquete offline de Madrid? MapLibre
 * recorta la cámara a esa caja EN SILENCIO: si no comprobamos esto antes de pedir
 * un `moveTo`, un usuario fuera de Madrid ve la cámara saltar al borde de la
 * ciudad sin explicación, y su punto de ubicación se dibuja pinzado a esa caja.
 *
 * Única fuente de verdad de la caja: `MADRID_OFFLINE_PACK_BOUNDS`. No se declara
 * aquí una segunda constante de límites.
 */
export function isWithinMadridBounds(coordinate: LocationCoordinate): boolean {
  const [west, south, east, north] = MADRID_OFFLINE_PACK_BOUNDS;
  return coordinate.lng >= west && coordinate.lng <= east && coordinate.lat >= south && coordinate.lat <= north;
}

/**
 * The "hospital más cercano" (or "base más cercana") floating control: straight-line
 * nearest match of the given kind, or `undefined` when there is no origin yet or the
 * directory has no location of that kind. Never falls back to a different kind — a
 * responder pressing "hospital más cercano" must never silently receive a base.
 *
 * Y, para hospitales, tampoco cualquier hospital. La cercanía en línea recta ordenaba
 * los veintiún registros del directorio sin distinguir: el más próximo a una
 * intervención podía ser una clínica privada, el Niño Jesús (pediátrico) o Getafe
 * (fuera del municipio), y ninguno de los tres es el destino. `autoDestination` marca
 * en `content/data/hospitals.json` cuáles sí lo son.
 *
 * El directorio completo no se toca: se sigue pudiendo buscar y abrir cualquiera de
 * los veintiuno. Lo que se acota es a dónde te manda un botón sin preguntarte.
 */
export function nearestLocationOfKind(locations: LocationRecord[], origin: LocationCoordinate | undefined, kind: LocationKind): LocationWithDistance | undefined {
  if (!origin) return undefined;
  const candidates = filterLocations(locations, "", kind)
    .filter((location) => kind !== "hospital" || location.autoDestination === true);
  return sortLocationsByDistance(candidates, origin)[0];
}

/**
 * Distances are still straight-line — `sortLocationsByDistance` has no routing and this
 * app deliberately makes no travel-time claim. The phrase "en línea recta" is gone from
 * the label because it repeated on every row of a sixty-row directory to qualify a number
 * nobody was reading as a driving distance. The qualification now lives once, in the
 * accessibility hint of the control that computes it.
 */
export function formatDistanceLabel(distanceMeters?: number): string | undefined {
  if (distanceMeters === undefined || !Number.isFinite(distanceMeters)) return undefined;
  if (distanceMeters < 1000) return `${Math.round(distanceMeters)} m`;
  return `${(distanceMeters / 1000).toFixed(1).replace(".", ",")} km`;
}

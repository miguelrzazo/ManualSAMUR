import { filterLocations, sortLocationsByDistance, type LocationCoordinate, type LocationKind, type LocationRecord } from "./location-logic.ts";

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
 * The "hospital más cercano" (or "base más cercana") floating control: straight-line
 * nearest match of the given kind, or `undefined` when there is no origin yet or the
 * directory has no location of that kind. Never falls back to a different kind — a
 * responder pressing "hospital más cercano" must never silently receive a base.
 */
export function nearestLocationOfKind(locations: LocationRecord[], origin: LocationCoordinate | undefined, kind: LocationKind): LocationWithDistance | undefined {
  if (!origin) return undefined;
  const candidates = filterLocations(locations, "", kind);
  return sortLocationsByDistance(candidates, origin)[0];
}

export function formatDistanceLabel(distanceMeters?: number): string | undefined {
  if (distanceMeters === undefined || !Number.isFinite(distanceMeters)) return undefined;
  return distanceMeters < 1000 ? `${Math.round(distanceMeters)} m en línea recta` : `${(distanceMeters / 1000).toFixed(1)} km en línea recta`;
}

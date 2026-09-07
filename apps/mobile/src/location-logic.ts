import type { MobileContent } from "../../../packages/manual-content/src/index.ts";
import { adaptivePalette, type AdaptivePalette } from "../../../packages/design-tokens/src/index.ts";

export type LocationKind = "hospital" | "base";
export type LocationFilter = "all" | LocationKind;
export type HospitalOwnership = "public" | "private";
export type LocationIcon = "hospital-building" | "hospital-marker" | "ambulance";

export interface LocationVisual {
  label: "Hospital público" | "Hospital privado" | "Hospital" | "Base SAMUR";
  icon: LocationIcon;
  color: string;
  wash: string;
}

export interface LocationRecord {
  id: string;
  kind: LocationKind;
  name: string;
  shortName: string;
  address: string;
  district: string;
  /** Número oficial del distrito de Madrid (1 Centro … 21 Barajas). Ausente fuera del municipio. */
  districtNumber?: number;
  /** Número de base SAMUR. 0 es la Sede Central, que no se llama "Base 0". */
  baseNumber?: number;
  lat: number;
  lng: number;
  hospitalOwnership?: HospitalOwnership;
  /** Date the packaged location data was generated (see LocationSourcePolicy.sourceDate). */
  sourceDate: string;
  sourcePolicyApproved: boolean;
  emergency?: boolean;
  status4?: number;
}

export interface LocationCoordinate {
  lat: number;
  lng: number;
}

export interface LocationSourcePolicy {
  version: number;
  approved: boolean;
  frozen: boolean;
  sourceUrl: string;
  sourceDate: string;
  hospitalScope: string;
  freshnessDays: number;
}

/**
 * MUST stay in sync with ../location-source-policy.json (the canonical, owner-approved
 * policy record). Not derived via a JSON import: a plain JSON import needs the ESM "with
 * { type: 'json' }" attribute under plain Node (used by scripts/check-location-release.ts
 * and the test suite), and it is unverified whether this project's Metro/Babel config
 * parses that syntax for the React Native bundle — the risk of a silent bundle break was
 * judged worse than duplication. tests/mobile-locations.test.ts asserts these two files
 * are identical field-for-field, so any future edit to one without the other fails CI.
 */
export const locationSourcePolicy: LocationSourcePolicy = {
  version: 1,
  approved: true,
  frozen: true,
  sourceUrl: "https://servpub.madrid.es/manualsamur/bin/view/Menu/Cabecera%20principal/",
  sourceDate: "2026-09-01",
  hospitalScope: "Cubre los 21 hospitales de referencia útil de Madrid recogidos en content/data/hospitals.json y las bases SAMUR incluidas en el paquete de contenido; no incluye hospitales fuera de esa lista, centros de salud, ni datos en tiempo real de disponibilidad o rutas de tráfico.",
  freshnessDays: 30,
};

export function locationPolicyReady(policy: LocationSourcePolicy = locationSourcePolicy): boolean {
  return policy.approved && policy.frozen && policy.sourceUrl.length > 0 && policy.sourceDate.length > 0 && policy.hospitalScope.length > 0;
}

export function locationPolicyStatus(policy: LocationSourcePolicy = locationSourcePolicy): "unapproved" | "unfrozen" | "ready" {
  if (!policy.approved) return "unapproved";
  if (!policy.frozen) return "unfrozen";
  return "ready";
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function coordinate(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function normalizeHospitalOwnership(value: unknown): HospitalOwnership | undefined {
  return value === "public" || value === "private" ? value : undefined;
}

export function hasHospitalOwnership(value: unknown, ownership: HospitalOwnership): boolean {
  return normalizeHospitalOwnership(value) === ownership;
}

export function locationVisual(location: Pick<LocationRecord, "kind" | "hospitalOwnership">, palette: AdaptivePalette = adaptivePalette.light): LocationVisual {
  if (location.kind === "base") {
    return { label: "Base SAMUR", icon: "ambulance", color: palette.green, wash: palette.greenWash };
  }
  if (location.hospitalOwnership === "private") {
    return { label: "Hospital privado", icon: "hospital-marker", color: palette.amber, wash: palette.amberWash };
  }
  if (location.hospitalOwnership === "public") {
    return { label: "Hospital público", icon: "hospital-building", color: palette.primary, wash: palette.primaryWash };
  }
  return { label: "Hospital", icon: "hospital-building", color: palette.inkMuted, wash: palette.surfaceMuted };
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/**
 * Cómo se llama una base en la lista.
 *
 * Las bases se conocen por su número —"Base 12"—, no por el barrio donde están.
 * La lista enseñaba el barrio ("El Espinillo"), que es justo lo que nadie usa por
 * radio. El barrio no se pierde: baja al subtítulo.
 *
 * La base 0 es la Sede Central y no se llama "Base 0", así que conserva su nombre.
 */
export function locationDisplayName(location: Pick<LocationRecord, "kind" | "shortName" | "baseNumber">): string {
  if (location.kind !== "base") return location.shortName;
  return location.baseNumber ? `Base ${location.baseNumber}` : location.shortName;
}

/**
 * Subtítulo de una fila: dirección, y el distrito con su número oficial.
 *
 * Para una base se antepone el barrio, que es lo que el título acaba de dejar
 * libre. Getafe no es distrito de Madrid y no tiene número: se escribe sin él en
 * lugar de inventar uno.
 */
export function locationSubtitle(
  location: Pick<LocationRecord, "kind" | "shortName" | "baseNumber" | "address" | "district" | "districtNumber">,
): string {
  const district = location.districtNumber ? `${location.district} (${location.districtNumber})` : location.district;
  const named = location.kind === "base" && location.baseNumber ? [location.shortName] : [];
  return [...named, location.address, district].filter(Boolean).join(" · ");
}

function normalizeText(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es");
}

export function locationRecords(content: Pick<MobileContent, "hospitals" | "bases">, policy: LocationSourcePolicy = locationSourcePolicy): LocationRecord[] {
  const hospitals = content.hospitals.flatMap((raw) => {
    const item = raw as Record<string, unknown>;
    const lat = coordinate(item.lat);
    const lng = coordinate(item.lng);
    const id = stringValue(item.id, "");
    if (!id || lat === undefined || lng === undefined) return [];
    return [{
      id,
      kind: "hospital" as const,
      name: stringValue(item.name, id),
      shortName: stringValue(item.shortName, stringValue(item.name, id)),
      address: stringValue(item.address, "Dirección no indicada"),
      district: stringValue(item.district, "Madrid"),
      districtNumber: numberValue(item.districtNumber),
      lat,
      lng,
      hospitalOwnership: normalizeHospitalOwnership(item.type),
      sourceDate: policy.sourceDate,
      sourcePolicyApproved: policy.approved,
      emergency: item.emergency === true,
      status4: typeof item.status4 === "number" ? item.status4 : undefined,
    } satisfies LocationRecord];
  });
  const bases = content.bases.flatMap((raw) => {
    const item = raw as Record<string, unknown>;
    const lat = coordinate(item.lat);
    const lng = coordinate(item.lng);
    const id = stringValue(item.id, "");
    if (!id || lat === undefined || lng === undefined) return [];
    return [{
      id,
      kind: "base" as const,
      name: stringValue(item.name, id),
      shortName: stringValue(item.name, id),
      address: stringValue(item.address, "Dirección no indicada"),
      district: stringValue(item.district, "Madrid"),
      districtNumber: numberValue(item.districtNumber),
      baseNumber: numberValue(item.number),
      lat,
      lng,
      sourceDate: policy.sourceDate,
      sourcePolicyApproved: policy.approved,
    } satisfies LocationRecord];
  });
  return [...hospitals, ...bases];
}

export function filterLocations(locations: LocationRecord[], query: string, filter: LocationFilter = "all"): LocationRecord[] {
  const normalizedQuery = normalizeText(query.trim());
  return locations.filter((location) => {
    if (filter !== "all" && location.kind !== filter) return false;
    if (!normalizedQuery) return true;
    return [location.id, location.name, location.shortName, location.address, location.district]
      .some((value) => normalizeText(value).includes(normalizedQuery));
  });
}

export function locationRouteKey(location: Pick<LocationRecord, "kind" | "id">): string {
  return `location:${location.kind}:${location.id}`;
}

export function parseLocationRouteKey(routeKey: string): { kind: LocationKind; id: string } | undefined {
  const match = /^location:(hospital|base):([^:]+)$/.exec(routeKey);
  if (!match) return undefined;
  return { kind: match[1] as LocationKind, id: match[2] };
}

export function resolveLocationRoute(locations: LocationRecord[], routeKey: string): LocationRecord | undefined {
  const parsed = parseLocationRouteKey(routeKey);
  return parsed ? locations.find((location) => location.kind === parsed.kind && location.id === parsed.id) : undefined;
}

export function locationFavoriteId(location: Pick<LocationRecord, "kind" | "id">): string {
  return locationRouteKey(location);
}

export function isLocationStale(sourceDate: string, now = new Date(), policy: LocationSourcePolicy = locationSourcePolicy): boolean {
  const timestamp = Date.parse(`${sourceDate}T00:00:00.000Z`);
  if (!Number.isFinite(timestamp)) return true;
  const age = now.getTime() - timestamp;
  return age < 0 || age > policy.freshnessDays * 24 * 60 * 60 * 1000;
}

/**
 * Freshness is a silent property: the normal case says nothing, because a location
 * record either is or isn't current and repeating "vigente según política local" on
 * every single row taught nobody anything. This only produces text once the record is
 * actually stale (`isLocationStale`), so the UI can surface a real warning instead of
 * routine noise. Returns `undefined` in the normal case — callers should render nothing.
 */
export function locationStaleNotice(location: Pick<LocationRecord, "sourceDate">, now = new Date(), policy: LocationSourcePolicy = locationSourcePolicy): string | undefined {
  if (!isLocationStale(location.sourceDate, now, policy)) return undefined;
  return `Datos desactualizados (paquete del ${location.sourceDate}). Confirma con la fuente oficial del SAMUR antes de usarlos.`;
}

export function haversineDistanceMeters(origin: LocationCoordinate, destination: LocationCoordinate): number {
  const earthRadiusMeters = 6_371_000;
  const toRadians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDelta = toRadians(destination.lat - origin.lat);
  const longitudeDelta = toRadians(destination.lng - origin.lng);
  const originLatitude = toRadians(origin.lat);
  const destinationLatitude = toRadians(destination.lat);
  const a = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(originLatitude) * Math.cos(destinationLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * earthRadiusMeters * Math.asin(Math.sqrt(Math.min(1, a)));
}

export function sortLocationsByDistance(locations: LocationRecord[], origin?: LocationCoordinate): Array<LocationRecord & { distanceMeters?: number }> {
  if (!origin) return [...locations];
  return locations
    .map((location) => ({ ...location, distanceMeters: haversineDistanceMeters(origin, location) }))
    .sort((left, right) => (left.distanceMeters ?? Number.POSITIVE_INFINITY) - (right.distanceMeters ?? Number.POSITIVE_INFINITY));
}

export function schematicNodes(locations: LocationRecord[]): Array<Pick<LocationRecord, "id" | "kind" | "name" | "shortName" | "address" | "district" | "lat" | "lng" | "sourceDate" | "sourcePolicyApproved" | "hospitalOwnership">> {
  return locations.map(({ id, kind, name, shortName, address, district, lat, lng, sourceDate, sourcePolicyApproved, hospitalOwnership }) => ({ id, kind, name, shortName, address, district, lat, lng, sourceDate, sourcePolicyApproved, hospitalOwnership }));
}

export function platformMapsUrl(location: Pick<LocationRecord, "name" | "lat" | "lng">, platform: "ios" | "android" | "web" = "ios"): string {
  const label = encodeURIComponent(location.name);
  if (platform === "ios") return `http://maps.apple.com/?ll=${location.lat},${location.lng}&q=${label}`;
  if (platform === "android") return `geo:${location.lat},${location.lng}?q=${location.lat},${location.lng}(${label})`;
  return `https://www.google.com/maps/search/?api=1&query=${location.lat},${location.lng}`;
}

import type { LocationCoordinate, LocationFilter, LocationKind, LocationRecord } from "./location-logic";

/** Provider-neutral seam. Keep online map policy and fallbacks free of SDK imports. */
export const ONLINE_MAP_POLICY_SCHEMA = "samur-manual.online-map-policy" as const;
export const ONLINE_MAP_POLICY_VERSION = 1 as const;

export type OnlineMapPolicyGate = "owner-approval" | "provider" | "license" | "offline-scope" | "os-floor" | "size-budget";

export interface OnlineMapProviderConfig {
  id: string;
  displayName: string;
  attribution: string;
  minimumOS: { ios: number; android: number };
  estimatedInstalledBytes: number;
}

export interface OnlineMapReleasePolicy {
  schema: typeof ONLINE_MAP_POLICY_SCHEMA;
  version: typeof ONLINE_MAP_POLICY_VERSION;
  approved: boolean;
  provider: OnlineMapProviderConfig | null;
  providerApproved: boolean;
  licenseApproved: boolean;
  offlineScopeApproved: boolean;
  osFloorApproved: boolean;
  sizeBudgetApproved: boolean;
  sizeBudgetBytes: number;
  approvalReference?: string;
  notes?: string;
}

/** Deliberately disabled until the owner supplies a provider decision and evidence. */
export const DEFAULT_ONLINE_MAP_POLICY: OnlineMapReleasePolicy = {
  schema: ONLINE_MAP_POLICY_SCHEMA,
  version: ONLINE_MAP_POLICY_VERSION,
  approved: false,
  provider: null,
  providerApproved: false,
  licenseApproved: false,
  offlineScopeApproved: false,
  osFloorApproved: false,
  sizeBudgetApproved: false,
  sizeBudgetBytes: 0,
};

/**
 * Owner-approved policy (issue #65): MapLibre rendering CARTO's Positron/Dark Matter
 * basemap styles over OpenStreetMap data — the same stack the web app already uses
 * (see `components/ui/map.tsx`). MUST stay in sync with
 * ../online-map-provider-policy.json field-for-field; tests/mobile-online-map.test.ts
 * asserts the two are identical. Not a plain JSON import for the same reason
 * `locationSourcePolicy` in location-logic.ts isn't: this file is bundled by both
 * Metro (the app) and plain Node (release-gate scripts and tests), and only the TS
 * constant is verified safe across both.
 */
export const APPROVED_ONLINE_MAP_POLICY: OnlineMapReleasePolicy = {
  schema: ONLINE_MAP_POLICY_SCHEMA,
  version: ONLINE_MAP_POLICY_VERSION,
  approved: true,
  provider: {
    id: "maplibre-carto-osm",
    displayName: "MapLibre GL Native + CARTO (Positron / Dark Matter) sobre datos de OpenStreetMap",
    attribution: "© OpenStreetMap contributors · © CARTO",
    minimumOS: { ios: 16.4, android: 24 },
    estimatedInstalledBytes: 9_270_265,
  },
  providerApproved: true,
  licenseApproved: true,
  offlineScopeApproved: true,
  osFloorApproved: true,
  sizeBudgetApproved: true,
  sizeBudgetBytes: 15_000_000,
  approvalReference: "issue-65-owner-decision-2026-09-05",
  notes: "estimatedInstalledBytes es MEDIDO, no estimado: dos builds Release de iOS (con y sin @maplibre/maplibre-react-native@11.3.8), comparando únicamente la porción arm64 (lipo -thin arm64, para descartar la mitad x86_64 del binario fat de simulador) de MapLibre.framework (7.671.568 bytes), el delta del ejecutable principal Pulsoabierto por enlazar el framework (4.618.992 - 3.156.672 = 1.462.320 bytes) y el delta de main.jsbundle por el wrapper JS de maplibre-react-native, sus dependencias @turf/* y el código propio de online-map-view.tsx/online-map-runtime.ts (12.993.081 - 12.856.704 = 136.377 bytes). Suma: 9.270.265 bytes (~8,8 MB). Todas las demás frameworks (Expo*, hermesvm, React, ReactNativeDependencies) tienen el mismo tamaño arm64 en ambos builds, confirmando que el delta es atribuible solo a MapLibre. Advertencia: es un build de simulador sin firmar (Release, sin thinning de arquitectura única de dispositivo real ni post-procesado de App Store); el tamaño real de descarga en un dispositivo puede diferir. sizeBudgetBytes (15 MB) deja margen por esa incertidumbre sin ocultar el número medido.",
};

export interface OnlineMapRequest {
  query: string;
  filter: LocationFilter;
  viewport?: { center: LocationCoordinate; zoom: number };
  currentLocation?: LocationCoordinate;
}

export interface OnlineMapPin {
  id: string;
  kind: LocationKind;
  title: string;
  coordinate: LocationCoordinate;
  source: "offline" | "online";
  locationRouteKey: string;
}

export interface OnlineMapSnapshot {
  fetchedAt: string;
  pins: OnlineMapPin[];
}

export interface OnlineMapProviderAdapter {
  readonly providerId: string;
  fetch(request: OnlineMapRequest): Promise<OnlineMapSnapshot>;
}

export const disabledOnlineMapProvider: OnlineMapProviderAdapter = {
  providerId: "unconfigured",
  async fetch() {
    throw new Error("El proveedor de mapas online no está configurado ni aprobado");
  },
};

export function onlineMapPolicyGates(policy: OnlineMapReleasePolicy = DEFAULT_ONLINE_MAP_POLICY): OnlineMapPolicyGate[] {
  const gates: OnlineMapPolicyGate[] = [];
  if (!policy.approved) gates.push("owner-approval");

  const provider = policy.provider;
  const hasProviderIdentity = Boolean(provider?.id.trim() && provider?.displayName.trim());
  if (!policy.providerApproved || !hasProviderIdentity) gates.push("provider");

  const hasAttribution = Boolean(provider?.attribution.trim());
  if (!policy.licenseApproved || !hasAttribution) gates.push("license");

  if (!policy.offlineScopeApproved) gates.push("offline-scope");

  const hasValidOSMatrix = Boolean(provider
    && Number.isFinite(provider.minimumOS.ios) && provider.minimumOS.ios > 0
    && Number.isFinite(provider.minimumOS.android) && provider.minimumOS.android > 0);
  if (!policy.osFloorApproved || !hasValidOSMatrix) gates.push("os-floor");

  const hasValidSizeEvidence = Boolean(provider
    && Number.isFinite(provider.estimatedInstalledBytes)
    && provider.estimatedInstalledBytes >= 0
    && Number.isFinite(policy.sizeBudgetBytes)
    && policy.sizeBudgetBytes > 0
    && provider.estimatedInstalledBytes <= policy.sizeBudgetBytes);
  if (!policy.sizeBudgetApproved || !hasValidSizeEvidence) gates.push("size-budget");
  return gates;
}

export function onlineMapPolicyReady(policy: OnlineMapReleasePolicy = DEFAULT_ONLINE_MAP_POLICY): boolean {
  return policy.approved && onlineMapPolicyGates(policy).length === 0;
}

export type OnlineMapFallbackReason = "network-unavailable" | "provider-error" | "stale-data" | "permission-denied";

export type OnlineMapState =
  | { status: "disabled"; gate: OnlineMapPolicyGate; fallback: "offline-directory-and-schematic" }
  | { status: "idle" }
  | { status: "loading"; request: OnlineMapRequest }
  | { status: "online"; snapshot: OnlineMapSnapshot }
  | { status: "fallback"; reason: OnlineMapFallbackReason; fallback: "offline-directory-and-schematic" };

export type OnlineMapEvent =
  | { type: "enable" }
  | { type: "request"; request: OnlineMapRequest }
  | { type: "success"; snapshot: OnlineMapSnapshot }
  | { type: "failure"; reason: OnlineMapFallbackReason };

export function initialOnlineMapState(policy: OnlineMapReleasePolicy = DEFAULT_ONLINE_MAP_POLICY): OnlineMapState {
  const gate = onlineMapPolicyGates(policy)[0];
  return gate ? { status: "disabled", gate, fallback: "offline-directory-and-schematic" } : { status: "idle" };
}

export function transitionOnlineMapState(state: OnlineMapState, event: OnlineMapEvent, policy: OnlineMapReleasePolicy = DEFAULT_ONLINE_MAP_POLICY): OnlineMapState {
  const gate = onlineMapPolicyGates(policy)[0];
  if (!onlineMapPolicyReady(policy) && gate) return { status: "disabled", gate, fallback: "offline-directory-and-schematic" };
  switch (event.type) {
    case "enable": return state.status === "disabled" ? { status: "idle" } : state;
    case "request": return { status: "loading", request: event.request };
    case "success": return { status: "online", snapshot: event.snapshot };
    case "failure": return { status: "fallback", reason: event.reason, fallback: "offline-directory-and-schematic" };
  }
}

export function mapPinsFromLocations(locations: LocationRecord[], source: OnlineMapPin["source"] = "offline"): OnlineMapPin[] {
  return locations.map((location) => ({
    id: location.id,
    kind: location.kind,
    title: location.shortName || location.name,
    coordinate: { lat: location.lat, lng: location.lng },
    source,
    locationRouteKey: `location:${location.kind}:${location.id}`,
  }));
}

export function onlineMapFallbackLabel(reason: OnlineMapFallbackReason): string {
  switch (reason) {
    case "network-unavailable": return "Sin conexión: se muestra el directorio y esquema offline.";
    case "provider-error": return "El proveedor no responde: se muestra el directorio y esquema offline.";
    case "stale-data": return "Los datos online están desactualizados: se muestra el directorio local.";
    case "permission-denied": return "Ubicación no autorizada: el directorio local sigue disponible.";
  }
}

export interface OnlineMapReleaseIssue { gate: OnlineMapPolicyGate; detail: string }
export interface OnlineMapReleaseReport { ready: boolean; issues: OnlineMapReleaseIssue[] }

export function evaluateOnlineMapRelease(policy: OnlineMapReleasePolicy = DEFAULT_ONLINE_MAP_POLICY): OnlineMapReleaseReport {
  const issues = onlineMapPolicyGates(policy).map((gate): OnlineMapReleaseIssue => ({
    gate,
    detail: gate === "provider"
      ? "Falta seleccionar y aprobar un proveedor de mapas online."
      : gate === "license"
        ? "Falta evidencia de licencia, atribución y términos de uso aprobados."
        : gate === "offline-scope"
          ? "Falta aprobar el alcance de datos y el fallback offline."
          : gate === "os-floor"
            ? "Falta aprobar el OS floor y la matriz de plataformas."
            : "Falta aprobar el presupuesto de tamaño instalado del mapa online.",
  }));
  return { ready: issues.length === 0, issues };
}

export function assertOnlineMapReleaseReady(report: OnlineMapReleaseReport): void {
  if (!report.ready) throw new Error(`La integración de mapas online está bloqueada: ${report.issues.map((issue) => issue.detail).join(" ")}`);
}

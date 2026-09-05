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

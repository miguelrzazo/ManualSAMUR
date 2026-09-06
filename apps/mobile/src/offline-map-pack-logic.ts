/**
 * Provider-neutral state machine for the offline Madrid basemap pack (T5e). Kept free
 * of MapLibre imports, same rationale as online-map-logic.ts: this module must stay
 * testable under plain Node and importable without pulling in native modules.
 *
 * The full-screen map is only safe as the owner's new default destination if it keeps
 * working with no signal — that's the entire point of downloading this pack. See
 * offline-map-pack-runtime.ts for the MapLibre OfflineManager wiring, and
 * online-map-runtime.ts's `createMapLibreOnlineMapProvider` for how a ready pack lets
 * activation skip the network reachability probe.
 */

/** West, south, east, north — a generous box around the Madrid municipality, covering every hospital and base in the packaged directory with margin. */
export const MADRID_OFFLINE_PACK_BOUNDS: [west: number, south: number, east: number, north: number] = [-3.9, 40.31, -3.52, 40.56];

/** City-wide overview down to street-level detail, matching the zoom range the app's default camera and hospital-focus camera moves actually use. */
export const MADRID_OFFLINE_PACK_MIN_ZOOM = 9;
export const MADRID_OFFLINE_PACK_MAX_ZOOM = 15;

/** Stable identifier stored in the pack's metadata so the runtime can find "the" Madrid pack instead of matching on bounds/zoom coincidence. */
export const MADRID_OFFLINE_PACK_ID = "madrid-samur-basemap";

export type OfflineMapPackStatus = "unknown" | "checking" | "absent" | "downloading" | "ready" | "error";

export interface OfflineMapPackState {
  status: OfflineMapPackStatus;
  percentage: number;
  errorMessage?: string;
}

export const initialOfflineMapPackState: OfflineMapPackState = { status: "unknown", percentage: 0 };

export type OfflineMapPackEvent =
  | { type: "check-start" }
  | { type: "check-found-ready" }
  | { type: "check-found-absent" }
  | { type: "check-error"; message: string }
  | { type: "download-start" }
  | { type: "progress"; percentage: number }
  | { type: "download-complete" }
  | { type: "download-error"; message: string };

export function transitionOfflineMapPackState(state: OfflineMapPackState, event: OfflineMapPackEvent): OfflineMapPackState {
  switch (event.type) {
    case "check-start": return { status: "checking", percentage: 0 };
    case "check-found-ready": return { status: "ready", percentage: 100 };
    case "check-found-absent": return { status: "absent", percentage: 0 };
    case "check-error": return { status: "error", percentage: 0, errorMessage: event.message };
    case "download-start": return { status: "downloading", percentage: 0 };
    case "progress": return { status: "downloading", percentage: Math.max(0, Math.min(100, event.percentage)) };
    case "download-complete": return { status: "ready", percentage: 100 };
    case "download-error": return { status: "error", percentage: state.percentage, errorMessage: event.message };
  }
}

export function offlineMapPackIsReady(state: OfflineMapPackState): boolean {
  return state.status === "ready";
}

/** Whether an explicit "descargar" action should be offered to the user right now. */
export function offlineMapPackCanDownload(state: OfflineMapPackState): boolean {
  return state.status === "absent" || state.status === "error" || state.status === "unknown";
}

export function offlineMapPackLabel(state: OfflineMapPackState): string {
  switch (state.status) {
    case "unknown": return "Comprobando el mapa offline de Madrid…";
    case "checking": return "Comprobando el mapa offline de Madrid…";
    case "absent": return "Mapa offline de Madrid no descargado. El directorio y el esquema local funcionan sin él.";
    case "downloading": return `Descargando el mapa offline de Madrid… ${Math.round(state.percentage)}%`;
    case "ready": return "Mapa offline de Madrid listo: el mapa funciona sin cobertura.";
    case "error": return `No se pudo descargar el mapa offline de Madrid${state.errorMessage ? `: ${state.errorMessage}` : "."}`;
  }
}

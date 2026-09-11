import type { LocationRecord } from "./location-logic.ts";
import {
  mapPinsFromLocations,
  type OnlineMapFallbackReason,
  type OnlineMapProviderAdapter,
  type OnlineMapSnapshot,
} from "./online-map-logic.ts";

/**
 * The style URLs actually served to the map (CARTO basemaps over OpenStreetMap data),
 * matching the web app's `components/ui/map.tsx` `defaultStyles` exactly so both
 * surfaces stay on the same visual and licensing basis.
 */
export const MAPLIBRE_CARTO_STYLE_URLS = {
  light: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
  dark: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
} as const;

const PROBE_TIMEOUT_MS = 8_000;

/**
 * Confirms the basemap style is actually reachable before the UI commits to an
 * "online" state. A style.json that fails to load (offline, DNS failure, CARTO outage,
 * non-2xx response) must land the caller back on the offline directory + schematic —
 * never a map surface with missing tiles.
 */
async function probeStyleReachable(styleUrl: string): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const response = await fetch(styleUrl, { method: "GET", signal: controller.signal });
    if (!response.ok) throw new Error(`El estilo de mapa respondió con estado ${response.status}`);
  } catch (error) {
    console.warn("[online-map] probeStyleReachable failed", error instanceof Error ? `${error.name}: ${error.message}` : error);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Provider-neutral seam (`OnlineMapProviderAdapter`) backed by the real MapLibre + CARTO
 * stack. `fetch` never renders anything itself — it only verifies the basemap is
 * reachable and hands back the pins the map should show, reusing the same offline
 * location records the directory and schematic already use (see `mapPinsFromLocations`).
 * Any failure — network unavailable, CARTO error response, timeout — rejects, so the
 * caller can classify it into a fallback reason and drop back to the offline directory.
 */
/**
 * `isOfflinePackReady` lets a caller (the Mapa screen) skip the live network probe once
 * the Madrid offline pack (see offline-map-pack-runtime.ts) has already downloaded the
 * tiles for this exact style — MapLibre's native layer then serves them from its local
 * database with no network request at all. Defaults to "never ready" so every existing
 * caller (and every test in tests/mobile-online-map.test.ts) keeps probing exactly as
 * before; only the Mapa screen wires the real offline-pack check in.
 */
export function createMapLibreOnlineMapProvider(
  locations: readonly LocationRecord[],
  styleUrl: string = MAPLIBRE_CARTO_STYLE_URLS.light,
  isOfflinePackReady: () => Promise<boolean> = async () => false,
): OnlineMapProviderAdapter {
  return {
    providerId: "maplibre-carto-osm",
    async fetch(): Promise<OnlineMapSnapshot> {
      const offlineReady = await isOfflinePackReady().catch(() => false);
      if (!offlineReady) await probeStyleReachable(styleUrl);
      return {
        fetchedAt: new Date().toISOString(),
        pins: mapPinsFromLocations([...locations], "online"),
      };
    },
  };
}

/**
 * Turns a raw error from the provider adapter into one of the fixed fallback reasons
 * the UI already knows how to render. A previously-loaded snapshot takes priority —
 * if the map was already showing data and a background refresh fails, that is stale
 * data, not "no network", even when the underlying cause is a network error.
 */
export function classifyOnlineMapFailure(error: unknown, hadPreviousSnapshot: boolean): OnlineMapFallbackReason {
  if (hadPreviousSnapshot) return "stale-data";
  if (error instanceof Error) {
    if (error.name === "AbortError") return "network-unavailable";
    // React Native's fetch (both the JSC/Hermes native module and any XHR-backed
    // polyfill) does not reliably throw a TypeError for connectivity failures the
    // way web fetch does — it throws a plain Error whose message names the failure.
    // Match on that message rather than the constructor.
    if (/network request failed|network unavailable|offline|could not connect|the internet connection appears to be offline/i.test(error.message)) return "network-unavailable";
  }
  if (error instanceof TypeError) return "network-unavailable";
  return "provider-error";
}

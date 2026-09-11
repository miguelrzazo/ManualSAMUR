import { OfflineManager, type OfflinePack, type OfflinePackErrorListener, type OfflinePackProgressListener } from "@maplibre/maplibre-react-native";
import {
  MADRID_OFFLINE_PACK_BOUNDS,
  MADRID_OFFLINE_PACK_ID,
  MADRID_OFFLINE_PACK_MAX_ZOOM,
  MADRID_OFFLINE_PACK_MIN_ZOOM,
} from "./offline-map-pack-logic.ts";

/**
 * Offline packs are tied to the exact style URL they were downloaded for (light vs.
 * dark CARTO basemap) — a pack downloaded for Positron does not serve Dark Matter
 * tiles offline. Metadata records both the app-level pack id and which style this
 * particular pack covers, so `findMadridOfflinePack` can tell "no pack yet" apart from
 * "a pack exists, but for the other theme".
 */
function packMatches(pack: OfflinePack, styleUrl: string): boolean {
  return pack.metadata?.id === MADRID_OFFLINE_PACK_ID && pack.metadata?.styleUrl === styleUrl;
}

export async function findMadridOfflinePack(styleUrl: string): Promise<OfflinePack | null> {
  const packs = await OfflineManager.getPacks();
  return packs.find((pack) => packMatches(pack, styleUrl)) ?? null;
}

/**
 * True only once the pack for this exact style is fully downloaded. Used by the Mapa
 * screen to decide whether activating the online map may skip the live network
 * reachability probe (see `createMapLibreOnlineMapProvider` in online-map-runtime.ts) —
 * the entire reason the offline pack exists is to let the map open with no signal.
 */
export async function isMadridOfflinePackReady(styleUrl: string): Promise<boolean> {
  try {
    const pack = await findMadridOfflinePack(styleUrl);
    if (!pack) return false;
    const status = await pack.status();
    return status.state === "complete";
  } catch {
    return false;
  }
}

/**
 * Starts (or resumes) the Madrid offline pack download for the given style. Never
 * called on screen load — only from an explicit user action in the Mapa list/filter
 * sheet, matching the same "no unapproved network request" contract the online map
 * activation already holds itself to (see online-map-logic.ts).
 *
 * Resolves only when a progress event actually reports `state === "complete"` — NOT
 * when `OfflineManager.createPack`'s own promise settles. That promise resolves as
 * soon as the pack is registered, while the tiles keep downloading in the background;
 * treating it as "done" made the UI report 100% and get stuck there, never flipping to
 * "listo", because completion is only ever announced through the progress listener.
 */
export function downloadMadridOfflinePack(
  styleUrl: string,
  onProgress: (percentage: number) => void,
  onError: (message: string) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const progressListener: OfflinePackProgressListener = (_pack, status) => {
      onProgress(status.percentage);
      if (status.state === "complete" && !settled) {
        settled = true;
        resolve();
      }
    };
    const errorListener: OfflinePackErrorListener = (_pack, error) => {
      onError(error.message);
      if (!settled) {
        settled = true;
        reject(new Error(error.message));
      }
    };
    void (async () => {
      try {
        const existing = await findMadridOfflinePack(styleUrl);
        if (existing) {
          const status = await existing.status();
          if (status.state === "complete") {
            onProgress(100);
            settled = true;
            resolve();
            return;
          }
          await OfflineManager.addListener(existing.id, progressListener, errorListener);
          await existing.resume();
          return;
        }
        await OfflineManager.createPack(
          {
            mapStyle: styleUrl,
            bounds: MADRID_OFFLINE_PACK_BOUNDS,
            minZoom: MADRID_OFFLINE_PACK_MIN_ZOOM,
            maxZoom: MADRID_OFFLINE_PACK_MAX_ZOOM,
            metadata: { id: MADRID_OFFLINE_PACK_ID, styleUrl },
          },
          progressListener,
          errorListener,
        );
      } catch (error) {
        if (!settled) {
          settled = true;
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      }
    })();
  });
}

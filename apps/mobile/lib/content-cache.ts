import { File, Paths } from "expo-file-system";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { hasValidContentHash, isContentSnapshot, shouldReplaceCachedSnapshot } from "@/lib/content-validation";
import type { ContentSnapshot } from "@/lib/types";

const CACHE_DIRECTORY = new File(Paths.document, "samur-manual", "placeholder").parentDirectory;
const CACHE_POINTER_KEY = "samur-manual.content-v1.current";

export { isContentSnapshot } from "@/lib/content-validation";

export async function readCachedSnapshot(): Promise<ContentSnapshot | null> {
  try {
    const hash = await AsyncStorage.getItem(CACHE_POINTER_KEY);
    if (!hash) return null;
    const file = new File(CACHE_DIRECTORY, `content-v1-${hash}.json`);
    if (!file.exists) return null;
    const parsed: unknown = JSON.parse(await file.text());
    return isContentSnapshot(parsed) && await hasValidContentHash(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function replaceCachedSnapshot(snapshot: ContentSnapshot): Promise<void> {
  if (!isContentSnapshot(snapshot) || !await hasValidContentHash(snapshot)) throw new Error("La actualización de contenido no es válida.");
  if (!CACHE_DIRECTORY.exists) CACHE_DIRECTORY.create({ idempotent: true, intermediates: true });
  const file = new File(CACHE_DIRECTORY, `content-v1-${snapshot.hash}.json`);
  if (!file.exists) file.write(JSON.stringify(snapshot));
  // The small pointer is only published after the complete, validated file exists.
  await AsyncStorage.setItem(CACHE_POINTER_KEY, snapshot.hash);
}

export async function fetchContentUpdate(baseUrl: string, currentHash?: string): Promise<ContentSnapshot | null> {
  const metadataResponse = await fetch(`${baseUrl}/api/mobile/content/metadata`);
  if (!metadataResponse.ok) throw new Error("No se pudo consultar el estado del contenido.");
  const metadata: unknown = await metadataResponse.json();
  if (!metadata || typeof metadata !== "object") throw new Error("El estado remoto no es válido.");
  const remote = metadata as Pick<ContentSnapshot, "schema" | "version" | "hash">;
  if (remote.schema !== "samur-manual.mobile-content" || remote.version !== 1 || typeof remote.hash !== "string") {
    throw new Error("La versión remota no es compatible.");
  }
  if (remote.hash === currentHash) return null;

  const snapshotResponse = await fetch(`${baseUrl}/api/mobile/content/v1`);
  if (!snapshotResponse.ok) throw new Error("No se pudo descargar el contenido.");
  const snapshot: unknown = await snapshotResponse.json();
  if (!await shouldReplaceCachedSnapshot(currentHash, snapshot, remote.hash)) {
    throw new Error("La descarga no superó la validación.");
  }
  return snapshot as ContentSnapshot;
}

import {
  isMobileContentPackage,
  isMobileContentSnapshot,
  type MobileAttachmentManifest,
  type MobileSnapshot,
} from "../index.ts";
import {
  readTransactionMetadata,
  type ContentStorage,
  type TransactionReadResult,
} from "./content-transaction.ts";

export interface ContentBootResult {
  /** The snapshot that can be rendered without waiting for integrity hashing. */
  snapshot: MobileSnapshot;
  transaction: TransactionReadResult;
}

/**
 * Fast local-first boot. An activated pointer is already protected by the
 * strict validation performed before activation, so launch only performs
 * pointer/envelope and structural checks. The bundled artifact is the final
 * fallback when persisted storage is absent or malformed.
 */
export async function readContentBoot(
  storage: ContentStorage,
  bundledSnapshot: MobileSnapshot,
): Promise<ContentBootResult> {
  const transaction = await readTransactionMetadata(storage);
  return {
    snapshot: transaction.snapshot ?? bundledSnapshot,
    transaction,
  };
}

const validationCache = new WeakMap<object, Map<string, Promise<boolean>>>();

/** Deduplicate concurrent checks without trusting hashes or later object mutations. */
export function validateSnapshotOnce(
  candidate: unknown,
  expectedManifest?: MobileAttachmentManifest,
): Promise<boolean> {
  if (!candidate || typeof candidate !== "object") return Promise.resolve(false);
  if (expectedManifest) return Promise.resolve(isMobileContentPackage(candidate, expectedManifest));
  const key = "snapshot";
  let entries = validationCache.get(candidate);
  if (!entries) { entries = new Map(); validationCache.set(candidate, entries); }
  const cached = entries.get(key);
  if (cached) return cached;
  const validation = Promise.resolve(isMobileContentSnapshot(candidate));
  entries.set(key, validation);
  void validation.then(() => entries?.delete(key), () => entries?.delete(key));
  return validation;
}

/**
 * Verify an activated snapshot after the first frame, retaining the bundled
 * artifact if persisted storage was tampered with or partially corrupted.
 */
export async function validateBootSnapshot(
  candidate: unknown,
  fallback: MobileSnapshot,
): Promise<MobileSnapshot> {
  return await validateSnapshotOnce(candidate) ? candidate as MobileSnapshot : fallback;
}

/** Schedule non-critical compatibility work after the first native frame. */
export function scheduleAfterFirstFrame(task: () => void): void {
  const afterFrame = () => setTimeout(task, 0);
  if (typeof globalThis.requestAnimationFrame === "function") {
    globalThis.requestAnimationFrame(afterFrame);
  } else {
    setTimeout(task, 0);
  }
}

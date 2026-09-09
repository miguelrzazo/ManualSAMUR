import {
  isMobileContentPackage,
  isMobileContentSnapshot,
  type MobileAttachmentManifest,
  type MobileSnapshot,
} from "../../../packages/manual-content/src/index.ts";
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

const validationCache = new Map<string, Promise<boolean>>();

function validationKey(candidate: unknown, expectedManifest?: MobileAttachmentManifest): string | undefined {
  if (!candidate || typeof candidate !== "object") return undefined;
  const value = candidate as Partial<MobileSnapshot>;
  const hash = value.packageHash ?? value.hash;
  if (typeof hash !== "string" || !hash) return undefined;
  // Include the declared content hash as a collision guard. A caller can hand
  // us a tampered object that retains an old packageHash; that object must not
  // inherit a prior successful validation from the immutable package cache.
  return `${expectedManifest ? "package" : "snapshot"}:${hash}:${value.hash ?? ""}:${expectedManifest?.packageHash ?? ""}`;
}

/**
 * Strict validation adapter used by refresh, staging, and activation. Keeping
 * the promise by package hash prevents read/recovery/activation from hashing
 * the same immutable package more than once in a process.
 */
export function validateSnapshotOnce(
  candidate: unknown,
  expectedManifest?: MobileAttachmentManifest,
): Promise<boolean> {
  const key = validationKey(candidate, expectedManifest);
  if (key) {
    const cached = validationCache.get(key);
    if (cached) return cached;
  }

  const validation = Promise.resolve(
    expectedManifest
      ? isMobileContentPackage(candidate, expectedManifest)
      : isMobileContentSnapshot(candidate),
  );
  if (key) validationCache.set(key, validation);
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

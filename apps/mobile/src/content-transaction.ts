import type { MobileSnapshot } from "./data/schema";

/**
 * The pointer is the only record changed during activation. Content packages
 * are immutable, content-addressed records; a process dying while writing one
 * can therefore never damage the package currently being read.
 */
export const CONTENT_STORAGE_SCHEMA = "samur-manual.mobile-content-storage" as const;
export const CONTENT_STORAGE_VERSION = 1 as const;
export const ACTIVE_POINTER_KEY = "manualsamur.content.active-pointer.v1";
export const STAGED_PACKAGE_KEY = "manualsamur.content.staged.v1";
export const LEGACY_SNAPSHOT_KEY = "manualsamur.content.snapshot.v2";
const PACKAGE_KEY_PREFIX = "manualsamur.content.package.v1.";
export const CONTENT_FRESHNESS_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export type TransactionPhase = "staged" | "failed";

export interface ContentStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface PackageEnvelope {
  schema: typeof CONTENT_STORAGE_SCHEMA;
  version: typeof CONTENT_STORAGE_VERSION;
  packageHash: string;
  snapshot: MobileSnapshot;
}

export interface ActivePointer {
  schema: typeof CONTENT_STORAGE_SCHEMA;
  version: typeof CONTENT_STORAGE_VERSION;
  packageHash: string;
  packageKey: string;
  activatedAt: string;
}

export interface StagedPackage {
  schema: typeof CONTENT_STORAGE_SCHEMA;
  version: typeof CONTENT_STORAGE_VERSION;
  packageHash: string;
  packageKey: string;
  phase: TransactionPhase;
  startedAt: string;
  updatedAt: string;
  downloadedBytes?: number;
  totalBytes?: number;
  error?: string;
}

export interface TransactionReadResult {
  active?: ActivePointer;
  snapshot?: MobileSnapshot;
  staged?: StagedPackage;
  stagedSnapshot?: MobileSnapshot;
  warning?: string;
}

export interface StageProgress {
  downloadedBytes?: number;
  totalBytes?: number;
}

export type SnapshotValidator = (candidate: unknown) => Promise<boolean>;

export class ContentUpdateCancelledError extends Error {
  constructor() {
    super("Actualización cancelada; el contenido anterior permanece activo");
    this.name = "ContentUpdateCancelledError";
  }
}

export function throwIfCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) throw new ContentUpdateCancelledError();
}

export type ContentFreshness = "fresh" | "stale" | "unknown";

export function contentFreshness(generatedAt: string, now = new Date()): ContentFreshness {
  const generated = new Date(generatedAt).getTime();
  if (!Number.isFinite(generated)) return "unknown";
  const age = now.getTime() - generated;
  return age >= 0 && age <= CONTENT_FRESHNESS_WINDOW_MS ? "fresh" : "stale";
}

function isHash(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function packageKey(packageHash: string): string {
  if (!isHash(packageHash)) throw new Error("El paquete no tiene un hash válido");
  return `${PACKAGE_KEY_PREFIX}${packageHash}`;
}

function parseJson<T>(value: string | null): T | undefined {
  if (!value) return undefined;
  try { return JSON.parse(value) as T; } catch { return undefined; }
}

export function isPackageEnvelope(value: unknown): value is PackageEnvelope {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PackageEnvelope>;
  return candidate.schema === CONTENT_STORAGE_SCHEMA
    && candidate.version === CONTENT_STORAGE_VERSION
    && isHash(candidate.packageHash)
    && Boolean(candidate.snapshot)
    && (candidate.snapshot as MobileSnapshot).packageHash === candidate.packageHash;
}

export function isActivePointer(value: unknown): value is ActivePointer {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ActivePointer>;
  return candidate.schema === CONTENT_STORAGE_SCHEMA
    && candidate.version === CONTENT_STORAGE_VERSION
    && isHash(candidate.packageHash)
    && candidate.packageKey === packageKey(candidate.packageHash)
    && typeof candidate.activatedAt === "string"
    && candidate.activatedAt.length > 0;
}

export function isStagedPackage(value: unknown): value is StagedPackage {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<StagedPackage>;
  return candidate.schema === CONTENT_STORAGE_SCHEMA
    && candidate.version === CONTENT_STORAGE_VERSION
    && isHash(candidate.packageHash)
    && candidate.packageKey === packageKey(candidate.packageHash)
    && (candidate.phase === "staged" || candidate.phase === "failed")
    && typeof candidate.startedAt === "string"
    && typeof candidate.updatedAt === "string"
    && (candidate.downloadedBytes === undefined || Number.isFinite(candidate.downloadedBytes))
    && (candidate.totalBytes === undefined || Number.isFinite(candidate.totalBytes));
}

export async function readTransaction(
  storage: ContentStorage,
  validate: SnapshotValidator,
): Promise<TransactionReadResult> {
  const result: TransactionReadResult = {};
  const pointer = parseJson<unknown>(await storage.getItem(ACTIVE_POINTER_KEY));
  if (isActivePointer(pointer)) {
    result.active = pointer;
    const envelope = parseJson<unknown>(await storage.getItem(pointer.packageKey));
    if (isPackageEnvelope(envelope) && envelope.packageHash === pointer.packageHash && await validate(envelope.snapshot)) {
      result.snapshot = envelope.snapshot;
    } else {
      result.warning = "El paquete activo no supera la validación; se conserva el último contenido conocido.";
    }
  }

  const staged = parseJson<unknown>(await storage.getItem(STAGED_PACKAGE_KEY));
  if (isStagedPackage(staged)) {
    result.staged = staged;
    const envelope = parseJson<unknown>(await storage.getItem(staged.packageKey));
    if (isPackageEnvelope(envelope) && envelope.packageHash === staged.packageHash && await validate(envelope.snapshot)) {
      result.stagedSnapshot = envelope.snapshot;
    } else {
      result.staged = { ...staged, phase: "failed", error: "El paquete en recuperación no supera la validación" };
    }
  }
  return result;
}

/** Stage a fully validated package. The active pointer is deliberately untouched. */
export async function stagePackage(
  storage: ContentStorage,
  snapshot: MobileSnapshot,
  validate: SnapshotValidator,
  now = new Date().toISOString(),
  progress: StageProgress = {},
  signal?: AbortSignal,
): Promise<StagedPackage> {
  throwIfCancelled(signal);
  if (!await validate(snapshot)) throw new Error("El paquete no supera la validación de integridad");
  throwIfCancelled(signal);
  if (!isHash(snapshot.packageHash)) throw new Error("El paquete no tiene packageHash compatible");
  const packageHash = snapshot.packageHash;
  const packageKeyValue = packageKey(packageHash);
  const envelope: PackageEnvelope = {
    schema: CONTENT_STORAGE_SCHEMA,
    version: CONTENT_STORAGE_VERSION,
    packageHash,
    snapshot,
  };
  // Content is written before its tiny recovery record. Neither write can
  // alter the package selected by the active pointer.
  await storage.setItem(packageKeyValue, JSON.stringify(envelope));
  throwIfCancelled(signal);
  const staged: StagedPackage = {
    schema: CONTENT_STORAGE_SCHEMA,
    version: CONTENT_STORAGE_VERSION,
    packageHash,
    packageKey: packageKeyValue,
    phase: "staged",
    startedAt: now,
    updatedAt: now,
    ...(progress.downloadedBytes === undefined ? {} : { downloadedBytes: progress.downloadedBytes }),
    ...(progress.totalBytes === undefined ? {} : { totalBytes: progress.totalBytes }),
  };
  await storage.setItem(STAGED_PACKAGE_KEY, JSON.stringify(staged));
  return staged;
}

export async function updateStagedProgress(
  storage: ContentStorage,
  progress: StageProgress,
  now = new Date().toISOString(),
): Promise<StagedPackage | undefined> {
  const current = parseJson<unknown>(await storage.getItem(STAGED_PACKAGE_KEY));
  if (!isStagedPackage(current)) return undefined;
  const next: StagedPackage = {
    ...current,
    updatedAt: now,
    ...(progress.downloadedBytes === undefined ? {} : { downloadedBytes: progress.downloadedBytes }),
    ...(progress.totalBytes === undefined ? {} : { totalBytes: progress.totalBytes }),
  };
  await storage.setItem(STAGED_PACKAGE_KEY, JSON.stringify(next));
  return next;
}

/**
 * Commit only the pointer. If this write fails the old pointer remains intact
 * and the staged package is intentionally left resumable.
 */
export async function activateStagedPackage(
  storage: ContentStorage,
  staged: StagedPackage,
  validate: SnapshotValidator,
  now = new Date().toISOString(),
  signal?: AbortSignal,
): Promise<ActivePointer> {
  throwIfCancelled(signal);
  const envelope = parseJson<unknown>(await storage.getItem(staged.packageKey));
  if (!isPackageEnvelope(envelope) || envelope.packageHash !== staged.packageHash || !await validate(envelope.snapshot)) {
    const failed: StagedPackage = { ...staged, phase: "failed", updatedAt: now, error: "El paquete staged no supera la validación" };
    await storage.setItem(STAGED_PACKAGE_KEY, JSON.stringify(failed));
    throw new Error(failed.error);
  }
  // Cancellation is intentionally checked immediately before the only write
  // that changes what the reader considers active. Once this point is reached
  // the UI disables Cancel while the tiny pointer commit completes.
  throwIfCancelled(signal);
  const pointer: ActivePointer = {
    schema: CONTENT_STORAGE_SCHEMA,
    version: CONTENT_STORAGE_VERSION,
    packageHash: staged.packageHash,
    packageKey: staged.packageKey,
    activatedAt: now,
  };
  await storage.setItem(ACTIVE_POINTER_KEY, JSON.stringify(pointer));
  // Cleanup is best effort. A process death here is harmless: the active
  // pointer already selects a valid package and the staged record is resumable.
  try { await storage.removeItem(STAGED_PACKAGE_KEY); } catch { /* retry cleanup on next refresh */ }
  return pointer;
}

export async function resumeStagedPackage(
  storage: ContentStorage,
  validate: SnapshotValidator,
  now = new Date().toISOString(),
): Promise<{ pointer: ActivePointer; snapshot: MobileSnapshot } | undefined> {
  const staged = parseJson<unknown>(await storage.getItem(STAGED_PACKAGE_KEY));
  if (!isStagedPackage(staged)) return undefined;
  const pointer = await activateStagedPackage(storage, staged, validate, now);
  const envelope = parseJson<unknown>(await storage.getItem(pointer.packageKey));
  if (!isPackageEnvelope(envelope)) throw new Error("El paquete activado no está disponible");
  return { pointer, snapshot: envelope.snapshot };
}

export async function discardStagedPackage(storage: ContentStorage): Promise<void> {
  const staged = parseJson<unknown>(await storage.getItem(STAGED_PACKAGE_KEY));
  if (isStagedPackage(staged)) {
    try { await storage.removeItem(staged.packageKey); } catch { /* stale package is harmless */ }
  }
  await storage.removeItem(STAGED_PACKAGE_KEY);
}

/** Migrate the pre-transaction raw snapshot without ever replacing an active pointer. */
export async function migrateLegacySnapshot(
  storage: ContentStorage,
  validate: SnapshotValidator,
  now = new Date().toISOString(),
): Promise<MobileSnapshot | undefined> {
  const legacy = parseJson<unknown>(await storage.getItem(LEGACY_SNAPSHOT_KEY));
  if (!legacy || !await validate(legacy)) return undefined;
  await stagePackage(storage, legacy as MobileSnapshot, validate, now);
  const recovered = await resumeStagedPackage(storage, validate, now);
  return recovered?.snapshot;
}

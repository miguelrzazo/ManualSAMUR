import {
  buildCodeRelationsIndex,
  MOBILE_SNAPSHOT_SCHEMA,
  MOBILE_SNAPSHOT_VERSION,
  type MobileCodeReferenceSource,
  type MobileContent,
  type MobileSnapshot,
} from "../../../packages/manual-content/src/index.ts";

/**
 * Client side of the Cloudflare public data API (docs/backend/public-api.md).
 *
 * Pure and dependency-free so the whole sync decision can be unit tested under
 * plain Node: no React Native, AsyncStorage or fetch globals are touched here.
 */
export const PUBLIC_MANIFEST_SCHEMA = "samur-manual.public-manifest" as const;
/** The only manifest major version this build understands. */
export const PUBLIC_MANIFEST_VERSION = 1 as const;
export const MANIFEST_PATH = "/api/public/manifest";

const HASH = /^[a-f0-9]{64}$/;
const DATASET_NAME = /^[a-z0-9-]{1,64}$/;

export interface PublicDatasetEntry {
  url: string;
  immutableUrl: string;
  sha256: string;
  bytes: number;
  count: number | null;
}

export interface PublicManifest {
  schema: typeof PUBLIC_MANIFEST_SCHEMA;
  version: number;
  releaseId: string;
  publishedAt: string | null;
  generatedAt: string;
  contentHash: string;
  packageHash: string | null;
  manualVersion: string | null;
  snapshot: { url: string; immutableUrl: string };
  datasets: Record<string, PublicDatasetEntry>;
}

/**
 * What the app remembers about the release it is showing. It is stored inside
 * the immutable package envelope, so it can never describe a different
 * release from the snapshot it travels with.
 */
export interface ReleaseInfo {
  releaseId: string;
  publishedAt: string | null;
  generatedAt: string;
  contentHash: string;
  packageHash: string;
  manualVersion: string | null;
  /** Only the datasets this build knows how to apply; used to diff the next manifest. */
  datasets: Record<string, { sha256: string; bytes: number }>;
}

export type ManifestProblem = "invalid" | "incompatible";

export class ManifestError extends Error {
  readonly problem: ManifestProblem;
  constructor(problem: ManifestProblem, message: string) {
    super(message);
    this.name = "ManifestError";
    this.problem = problem;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isRelativeApiPath(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("/api/public/") && !value.includes("..") && !value.includes("//");
}

/**
 * Parse a manifest defensively. A different `schema` or a higher `version` is
 * an incompatible publication (the app needs an update); anything else that is
 * malformed is an invalid response. Dataset entries with names we do not
 * recognise are still parsed here and simply ignored later.
 */
export function parsePublicManifest(value: unknown): PublicManifest {
  if (!isRecord(value)) throw new ManifestError("invalid", "El manifiesto publicado no es un objeto JSON");
  if (value.schema !== PUBLIC_MANIFEST_SCHEMA) throw new ManifestError("incompatible", "El manifiesto usa un esquema desconocido");
  if (typeof value.version !== "number" || value.version !== PUBLIC_MANIFEST_VERSION) {
    throw new ManifestError("incompatible", `El manifiesto usa la versión ${String(value.version)}; la aplicación admite la ${PUBLIC_MANIFEST_VERSION}`);
  }
  if (typeof value.releaseId !== "string" || !value.releaseId) throw new ManifestError("invalid", "El manifiesto no tiene releaseId");
  if (typeof value.contentHash !== "string" || !HASH.test(value.contentHash)) throw new ManifestError("invalid", "El manifiesto no tiene un contentHash válido");
  if (value.packageHash !== null && (typeof value.packageHash !== "string" || !HASH.test(value.packageHash))) throw new ManifestError("invalid", "El manifiesto no tiene un packageHash válido");
  if (typeof value.generatedAt !== "string" || !Number.isFinite(Date.parse(value.generatedAt))) throw new ManifestError("invalid", "El manifiesto no tiene generatedAt");
  if (value.publishedAt !== null && value.publishedAt !== undefined && typeof value.publishedAt !== "string") throw new ManifestError("invalid", "El manifiesto tiene un publishedAt no válido");
  if (value.manualVersion !== null && value.manualVersion !== undefined && typeof value.manualVersion !== "string") throw new ManifestError("invalid", "El manifiesto tiene un manualVersion no válido");
  const snapshot = value.snapshot;
  if (!isRecord(snapshot) || !isRelativeApiPath(snapshot.url) || !isRelativeApiPath(snapshot.immutableUrl)) throw new ManifestError("invalid", "El manifiesto no enlaza un snapshot válido");
  if (!isRecord(value.datasets)) throw new ManifestError("invalid", "El manifiesto no lista conjuntos de datos");
  const datasets: Record<string, PublicDatasetEntry> = {};
  for (const [name, entry] of Object.entries(value.datasets)) {
    // A malformed entry for a name we would ignore anyway must not block sync;
    // a malformed entry for a name we use is caught when planning.
    if (!DATASET_NAME.test(name) || !isRecord(entry)) continue;
    if (!isRelativeApiPath(entry.url) || !isRelativeApiPath(entry.immutableUrl)) continue;
    if (typeof entry.sha256 !== "string" || !HASH.test(entry.sha256)) continue;
    if (typeof entry.bytes !== "number" || !Number.isSafeInteger(entry.bytes) || entry.bytes < 0) continue;
    datasets[name] = {
      url: entry.url,
      immutableUrl: entry.immutableUrl,
      sha256: entry.sha256,
      bytes: entry.bytes,
      count: typeof entry.count === "number" ? entry.count : null,
    };
  }
  return {
    schema: PUBLIC_MANIFEST_SCHEMA,
    version: value.version,
    releaseId: value.releaseId,
    publishedAt: typeof value.publishedAt === "string" ? value.publishedAt : null,
    generatedAt: value.generatedAt,
    contentHash: value.contentHash,
    packageHash: typeof value.packageHash === "string" ? value.packageHash : null,
    manualVersion: typeof value.manualVersion === "string" ? value.manualVersion : null,
    snapshot: { url: snapshot.url, immutableUrl: snapshot.immutableUrl },
    datasets,
  };
}

/** `MobileContent` keys fed by each public dataset. Mirrors scripts/backend/public-datasets.ts. */
const CONTENT_FIELDS: Record<string, Exclude<keyof MobileContent, "codes" | "relationsIndex">> = {
  procedures: "procedures",
  vademecum: "drugs",
  "vademecum-comerciales": "commercialNames",
  perfusiones: "perfusions",
  fluidos: "fluids",
  abreviaturas: "abbreviations",
  hospitals: "hospitals",
  bases: "bases",
  status4: "status4",
  "manual-updates": "updates",
  "main-links": "links",
  manual: "manual",
};

/** `content.codes` groups fed by each code dataset. Mirrors scripts/backend/core.ts `codeFiles`. */
const CODE_GROUPS: Record<string, string> = {
  "codigos-incidente": "incidente",
  "codigos-sva": "sva",
  "codigos-svb": "svb",
  "codigos-upsi": "upsi",
  "codigos-upsq": "upsq",
  "codigos-icao": "icao",
  "codigos-indicativos": "indicativos",
  "codigos-pc": "claves",
  "codigos-lima": "lima",
  "codigos-cheatsheet": "cheatsheet",
};

/** Every dataset the app needs to rebuild a snapshot. Unknown names are ignored. */
export const KNOWN_DATASETS: readonly string[] = [...Object.keys(CONTENT_FIELDS), ...Object.keys(CODE_GROUPS)];

export function isKnownDataset(name: string): boolean {
  return Object.hasOwn(CONTENT_FIELDS, name) || Object.hasOwn(CODE_GROUPS, name);
}

export function releaseInfoFromManifest(manifest: PublicManifest, packageHashValue: string): ReleaseInfo {
  const datasets: ReleaseInfo["datasets"] = {};
  for (const name of KNOWN_DATASETS) {
    const entry = manifest.datasets[name];
    if (entry) datasets[name] = { sha256: entry.sha256, bytes: entry.bytes };
  }
  return {
    releaseId: manifest.releaseId,
    publishedAt: manifest.publishedAt,
    generatedAt: manifest.generatedAt,
    contentHash: manifest.contentHash,
    packageHash: packageHashValue,
    manualVersion: manifest.manualVersion,
    datasets,
  };
}

export function isReleaseInfo(value: unknown): value is ReleaseInfo {
  if (!isRecord(value)) return false;
  return typeof value.releaseId === "string" && value.releaseId.length > 0
    && (value.publishedAt === null || typeof value.publishedAt === "string")
    && typeof value.generatedAt === "string"
    && typeof value.contentHash === "string" && HASH.test(value.contentHash)
    && typeof value.packageHash === "string" && HASH.test(value.packageHash)
    && (value.manualVersion === null || typeof value.manualVersion === "string")
    && isRecord(value.datasets)
    && Object.values(value.datasets).every((entry) => isRecord(entry) && typeof entry.sha256 === "string" && HASH.test(entry.sha256) && typeof entry.bytes === "number");
}

export type SyncPlan =
  | { kind: "up-to-date" }
  | { kind: "datasets"; changed: string[]; bytes: number }
  | { kind: "snapshot"; reason: "seed" | "no-release-record" | "missing-dataset" };

/**
 * Decide how to reach `manifest` from what is active.
 *
 * - The bundled seed is never "up to date" and never a base for a partial
 *   update: the first successful sync always replaces it with a full release.
 * - A downloaded release with a recorded dataset map only fetches the datasets
 *   whose sha256 changed; unchanged ones are reused from the active snapshot.
 */
export function planSync(
  manifest: PublicManifest,
  active: { snapshot: Pick<MobileSnapshot, "hash" | "packageHash">; release?: ReleaseInfo; isSeed: boolean },
): SyncPlan {
  if (active.isSeed) return { kind: "snapshot", reason: "seed" };
  const samePackage = manifest.packageHash ? manifest.packageHash === active.snapshot.packageHash : true;
  if (manifest.contentHash === active.snapshot.hash && samePackage) return { kind: "up-to-date" };
  if (!active.release || active.release.contentHash !== active.snapshot.hash) return { kind: "snapshot", reason: "no-release-record" };
  if (KNOWN_DATASETS.some((name) => !manifest.datasets[name] || !active.release?.datasets[name])) return { kind: "snapshot", reason: "missing-dataset" };
  const changed = KNOWN_DATASETS.filter((name) => manifest.datasets[name].sha256 !== active.release?.datasets[name]?.sha256);
  return { kind: "datasets", changed, bytes: changed.reduce((sum, name) => sum + manifest.datasets[name].bytes, 0) };
}

function codeReferenceSources(codes: Record<string, unknown[]>): MobileCodeReferenceSource[] {
  // Same projection as lib/mobile-snapshot.ts codeReferenceSources.
  return Object.entries(codes).flatMap(([group, values]) => (Array.isArray(values) ? values : []).flatMap((value) => {
    if (!isRecord(value) || typeof value.code !== "string" || typeof value.name !== "string") return [];
    return [{ code: value.code, name: value.name, tab: group, subtab: group === "claves" ? "claves" : undefined }];
  }));
}

/**
 * Rebuild a full snapshot for `manifest` from the active content plus the
 * freshly downloaded datasets. The caller must still verify the result
 * against `manifest.contentHash`: this only assembles, it does not trust.
 */
export function assembleSnapshot(
  manifest: PublicManifest,
  base: MobileContent,
  downloaded: Record<string, unknown>,
): MobileSnapshot {
  const content: MobileContent = { ...base, codes: { ...base.codes } };
  let relationsDirty = false;
  for (const [name, value] of Object.entries(downloaded)) {
    const field = CONTENT_FIELDS[name];
    if (field) {
      (content as unknown as Record<string, unknown>)[field] = value;
      if (field === "procedures") relationsDirty = true;
      continue;
    }
    const group = CODE_GROUPS[name];
    if (group) {
      content.codes[group] = value as unknown[];
      relationsDirty = true;
    }
  }
  if (relationsDirty) {
    content.relationsIndex = buildCodeRelationsIndex(content.procedures, codeReferenceSources(content.codes));
  }
  return {
    schema: MOBILE_SNAPSHOT_SCHEMA,
    version: MOBILE_SNAPSHOT_VERSION,
    generatedAt: manifest.generatedAt,
    hash: manifest.contentHash,
    contentHash: manifest.contentHash,
    ...(manifest.packageHash ? { packageHash: manifest.packageHash } : {}),
    content,
  };
}

/** UTF-8 byte length without TextEncoder allocation of the whole body. */
export function utf8ByteLength(text: string): number {
  let bytes = 0;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < text.length) { bytes += 4; index++; }
    else bytes += 3;
  }
  return bytes;
}

export function manualVersionOf(snapshot: Pick<MobileSnapshot, "content">, release?: Pick<ReleaseInfo, "manualVersion">): string | undefined {
  if (release?.manualVersion) return release.manualVersion;
  const manual = snapshot.content?.manual as Record<string, unknown> | undefined;
  const value = manual?.manualVersionCurrent ?? manual?.manualVersion;
  return typeof value === "string" && value ? value : undefined;
}

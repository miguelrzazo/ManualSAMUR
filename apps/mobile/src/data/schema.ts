/**
 * The mobile package is a deliberately boring data boundary. Keep this file
 * free of Expo, React Native, Node, and browser imports so the web generator
 * and the native runtime can validate the same shape.
 */
export const MOBILE_SNAPSHOT_SCHEMA = "samur-manual.mobile-content" as const;
export const MOBILE_SNAPSHOT_VERSION = 2 as const;
export const MOBILE_ATTACHMENT_MANIFEST_SCHEMA = "samur-manual.mobile-attachments" as const;
export const MOBILE_ATTACHMENT_MANIFEST_VERSION = 1 as const;

export interface MobileAttachment {
  id: string;
  sourceUrl: string;
  localPath: string;
  filename: string;
  kind: "image" | "pdf" | "other";
  /** Expected bytes and digest are required before a file may be reported local. */
  byteLength?: number;
  sha256?: string;
}

export interface MobileManifestAttachment extends MobileAttachment {
  procedureId: string;
}

export interface MobileAttachmentManifest {
  schema: typeof MOBILE_ATTACHMENT_MANIFEST_SCHEMA;
  version: typeof MOBILE_ATTACHMENT_MANIFEST_VERSION;
  generatedAt: string;
  contentHash: string;
  packageHash: string;
  attachments: MobileManifestAttachment[];
}

export interface MobileProcedure {
  id: string;
  title: string;
  section: string;
  slug: string;
  routeKey: string;
  tags: string[];
  synonyms: string[];
  related: string[];
  backlinks: string[];
  relations: Array<{ id: string; direction: string; kind: string; strength: string }>;
  editorialBlocks: unknown[];
  updates: unknown[];
  updated: string;
  sourceUpdated: string;
  source?: string;
  attachments: MobileAttachment[];
  content: string;
  searchText: string;
}

export interface MobileLinks {
  sourceUrl: string;
  updatedAt: string;
  avisoImportanteUrl: string;
  samurEmail: string;
  officialWebUrl: string;
  abbreviationsUrl: string;
  collaboratorsUrl: string;
}

export interface MobileContent {
  procedures: MobileProcedure[];
  codes: Record<string, unknown[]>;
  drugs: Array<Record<string, unknown>>;
  perfusions: Array<Record<string, unknown>>;
  fluids: Array<Record<string, unknown>>;
  commercialNames: Array<Record<string, unknown>>;
  abbreviations: Array<Record<string, unknown>>;
  hospitals: Array<Record<string, unknown>>;
  bases: Array<Record<string, unknown>>;
  status4: Array<Record<string, unknown>>;
  manual: Record<string, unknown>;
  links: MobileLinks;
  updates: unknown[];
}

export interface MobileSnapshot {
  schema: typeof MOBILE_SNAPSHOT_SCHEMA;
  version: typeof MOBILE_SNAPSHOT_VERSION;
  generatedAt: string;
  hash: string;
  /** Hash of the canonical content bytes. Kept as `hash` for v2 API compatibility. */
  contentHash?: string;
  /** Hash of the canonical content plus attachment manifest package. */
  packageHash?: string;
  content: MobileContent;
}

/**
 * Canonical JSON is the wire representation used for all package hashes.
 * Object keys use byte-stable lexical ordering (not localeCompare), while
 * array ordering remains meaningful and is therefore preserved.
 */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
      .join(",")}}`;
  }
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new TypeError("Mobile package values must be JSON serializable");
  return encoded;
}

export function isSafeAttachmentPath(localPath: unknown): localPath is string {
  if (typeof localPath !== "string" || !localPath.startsWith("/")) return false;
  if (localPath.includes("\\") || localPath.includes("\0")) return false;
  if (localPath !== localPath.normalize("NFC")) return false;
  const segments = localPath.split("/");
  if (segments.slice(1).some((segment) => !segment || segment === ".." || segment === ".")) return false;
  return segments[1] === "docs" || segments[1] === "images";
}

export function isValidAttachment(value: unknown): value is MobileAttachment {
  if (!value || typeof value !== "object") return false;
  const attachment = value as Partial<MobileAttachment>;
  if (typeof attachment.id !== "string" || attachment.id.length === 0) return false;
  if (typeof attachment.sourceUrl !== "string" || !/^https?:\/\//.test(attachment.sourceUrl)) return false;
  if (!isSafeAttachmentPath(attachment.localPath)) return false;
  if (typeof attachment.filename !== "string" || attachment.filename.length === 0 || attachment.filename.includes("/")) return false;
  if (attachment.filename !== attachment.localPath.split("/").at(-1)) return false;
  if (attachment.byteLength !== undefined && (!Number.isSafeInteger(attachment.byteLength) || attachment.byteLength < 0)) return false;
  if (attachment.sha256 !== undefined && (typeof attachment.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(attachment.sha256))) return false;
  return attachment.kind === "image" || attachment.kind === "pdf" || attachment.kind === "other";
}

export function isValidManifestAttachment(value: unknown): value is MobileManifestAttachment {
  if (!isValidAttachment(value)) return false;
  return typeof (value as MobileManifestAttachment).procedureId === "string" && (value as MobileManifestAttachment).procedureId.length > 0;
}

export function stableRouteKey(id: string): string {
  return `procedure:${id}`;
}

export function mobileAttachmentEntries(content: Pick<MobileContent, "procedures">): MobileManifestAttachment[] {
  return content.procedures.flatMap((procedure) => procedure.attachments.map((attachment) => ({
    ...attachment,
    procedureId: procedure.id,
  })));
}

export function mobilePackageHashPayload(snapshot: Pick<MobileSnapshot, "hash">, attachmentManifestHash: string): Record<string, string | number> {
  return {
    schema: MOBILE_SNAPSHOT_SCHEMA,
    version: MOBILE_SNAPSHOT_VERSION,
    contentHash: snapshot.hash,
    attachmentManifestHash,
  };
}

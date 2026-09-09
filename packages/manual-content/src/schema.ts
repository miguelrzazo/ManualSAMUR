/**
 * The canonical content contract shared by the web build and native clients.
 * Keep this module dependency-free so it is safe for Next, Expo, and Node.
 */
export const MOBILE_SNAPSHOT_SCHEMA = "samur-manual.mobile-content" as const;
export const MOBILE_SNAPSHOT_VERSION = 3 as const;
export const MOBILE_ATTACHMENT_MANIFEST_SCHEMA = "samur-manual.mobile-attachments" as const;
export const MOBILE_ATTACHMENT_MANIFEST_VERSION = 1 as const;

export interface MobileAttachment {
  id: string;
  sourceUrl: string;
  localPath: string;
  filename: string;
  kind: "image" | "pdf" | "other";
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

export interface MobileUpdateEvent {
  eventId: string;
  origin?: string;
  officialUrl?: string;
  procedureIds: string[];
  changeKind: string;
  summary: string;
  effectiveDate: string;
  approvedAt?: string;
  isRecent?: boolean;
  category?: string;
  routeKey?: string;
  diff?: string;
}

export interface MobileProcedureMention {
  procedureId: string;
  title: string;
  slug: string;
  section: string;
  preview: string;
}

export interface MobileRelationsIndex {
  codes: Record<string, MobileProcedureMention[]>;
}

export interface MobileCodeReferenceSource {
  code: string;
  name: string;
  tab: string;
  subtab?: string;
}

function referenceText(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_>#`~-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizedReferenceText(value: string): string {
  return referenceText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function buildCodeRelationsIndex(
  procedures: Pick<MobileProcedure, "id" | "title" | "slug" | "section" | "content" | "searchText">[],
  codes: MobileCodeReferenceSource[],
): MobileRelationsIndex {
  const result: Record<string, MobileProcedureMention[]> = {};
  for (const procedure of procedures) {
    const text = normalizedReferenceText(procedure.content || procedure.searchText || procedure.title);
    const preview = referenceText(procedure.content || procedure.searchText || procedure.title).slice(0, 260);
    for (const source of codes) {
      const code = normalizedReferenceText(source.code);
      const name = normalizedReferenceText(source.name);
      const patterns = [
        source.subtab === "claves" ? new RegExp(`\\bclave\\s+${code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`) : undefined,
        /^\d+(?:\s+\d+)?$/.test(code) ? new RegExp(`\\bcodigo\\s+${code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`) : undefined,
        name.startsWith("codigo ") || name.startsWith("clave ") ? new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`) : undefined,
      ].filter((pattern): pattern is RegExp => Boolean(pattern));
      if (!patterns.some((pattern) => pattern.test(text))) continue;
      const key = `${source.tab}:${source.code}`;
      const mentions = result[key] ?? (result[key] = []);
      if (!mentions.some((mention) => mention.procedureId === procedure.id)) {
        mentions.push({ procedureId: procedure.id, title: procedure.title, slug: procedure.slug, section: procedure.section, preview });
      }
    }
  }
  return { codes: result };
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

/** Shared medication contract consumed by the web and native vademecum views. */
export interface MedicationRecord {
  id: string;
  name: string;
  synonyms: string[];
  category: string;
  subcategory: string;
  presentation: string;
  funcion?: string;
  indication: string;
  dose: string;
  route: string[];
  contraindications: string;
  efectos_secundarios?: string;
  precauciones?: string;
  interacciones?: string;
  incompatibilidades?: string;
  notes?: string;
  [key: string]: unknown;
}

export interface MobileContent {
  procedures: MobileProcedure[];
  codes: Record<string, unknown[]>;
  drugs: MedicationRecord[];
  perfusions: Array<Record<string, unknown>>;
  fluids: Array<Record<string, unknown>>;
  commercialNames: Array<Record<string, unknown>>;
  abbreviations: Array<Record<string, unknown>>;
  hospitals: Array<Record<string, unknown>>;
  bases: Array<Record<string, unknown>>;
  status4: Array<Record<string, unknown>>;
  manual: Record<string, unknown>;
  links: MobileLinks;
  relationsIndex: MobileRelationsIndex;
  updates: MobileUpdateEvent[];
}

export interface MobileSnapshot {
  schema: typeof MOBILE_SNAPSHOT_SCHEMA;
  version: typeof MOBILE_SNAPSHOT_VERSION;
  generatedAt: string;
  hash: string;
  contentHash?: string;
  packageHash?: string;
  content: MobileContent;
}

export type MobileContentSnapshot = MobileSnapshot;

export interface MobileContentPackage {
  snapshot: MobileSnapshot;
  manifest: MobileAttachmentManifest;
}

export const MAX_MOBILE_UPDATE_EVENTS = 500;

export function capMobileUpdateEvents(events: readonly MobileUpdateEvent[], maxEvents = MAX_MOBILE_UPDATE_EVENTS): MobileUpdateEvent[] {
  return [...events]
    .sort((left, right) => `${right.effectiveDate}|${right.approvedAt ?? ""}`.localeCompare(`${left.effectiveDate}|${left.approvedAt ?? ""}`))
    .slice(0, maxEvents);
}

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

// Dependency-free SHA-256 keeps the digest contract identical on web and native.
const SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
] as const;

function rotr(value: number, bits: number): number {
  return ((value >>> bits) | (value << (32 - bits))) >>> 0;
}

export function sha256Hex(value: string): string {
  const bytes = new TextEncoder().encode(value);
  const bitLength = bytes.length * 8;
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000), false);
  view.setUint32(paddedLength - 4, bitLength >>> 0, false);

  let h0 = 0x6a09e667 | 0; let h1 = 0xbb67ae85 | 0; let h2 = 0x3c6ef372 | 0; let h3 = 0xa54ff53a | 0;
  let h4 = 0x510e527f | 0; let h5 = 0x9b05688c | 0; let h6 = 0x1f83d9ab | 0; let h7 = 0x5be0cd19 | 0;
  for (let offset = 0; offset < padded.length; offset += 64) {
    const words = new Uint32Array(64);
    for (let i = 0; i < 16; i++) words[i] = view.getUint32(offset + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(words[i - 15], 7) ^ rotr(words[i - 15], 18) ^ (words[i - 15] >>> 3);
      const s1 = rotr(words[i - 2], 17) ^ rotr(words[i - 2], 19) ^ (words[i - 2] >>> 10);
      words[i] = (words[i - 16] + s0 + words[i - 7] + s1) | 0;
    }
    let a = h0; let b = h1; let c = h2; let d = h3; let e = h4; let f = h5; let g = h6; let h = h7;
    for (let i = 0; i < 64; i++) {
      const sum1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temp1 = (h + sum1 + choice + SHA256_K[i] + words[i]) | 0;
      const sum0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (sum0 + majority) | 0;
      h = g; g = f; f = e; e = (d + temp1) | 0; d = c; c = b; b = a; a = (temp1 + temp2) | 0;
    }
    h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
  }
  return [h0, h1, h2, h3, h4, h5, h6, h7].map((word) => (word >>> 0).toString(16).padStart(8, "0")).join("");
}

export function isValidMobileUpdateEvent(value: unknown): value is MobileUpdateEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const event = value as Record<string, unknown>;
  if (typeof event.eventId !== "string" || !event.eventId) return false;
  if (!Array.isArray(event.procedureIds) || event.procedureIds.some((id) => typeof id !== "string" || !id)) return false;
  if (typeof event.changeKind !== "string" || typeof event.summary !== "string" || typeof event.effectiveDate !== "string") return false;
  for (const key of ["origin", "officialUrl", "approvedAt", "category", "routeKey", "diff"] as const) {
    if (event[key] !== undefined && typeof event[key] !== "string") return false;
  }
  return event.isRecent === undefined || typeof event.isRecent === "boolean";
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
  if (typeof attachment.id !== "string" || !attachment.id) return false;
  if (typeof attachment.sourceUrl !== "string" || !/^https?:\/\//.test(attachment.sourceUrl)) return false;
  if (!isSafeAttachmentPath(attachment.localPath)) return false;
  if (typeof attachment.filename !== "string" || !attachment.filename || attachment.filename.includes("/")) return false;
  if (attachment.filename !== attachment.localPath.split("/").at(-1)) return false;
  if (attachment.byteLength !== undefined && (!Number.isSafeInteger(attachment.byteLength) || attachment.byteLength < 0)) return false;
  if (attachment.sha256 !== undefined && (typeof attachment.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(attachment.sha256))) return false;
  return attachment.kind === "image" || attachment.kind === "pdf" || attachment.kind === "other";
}

export function isValidManifestAttachment(value: unknown): value is MobileManifestAttachment {
  return isValidAttachment(value)
    && typeof (value as MobileManifestAttachment).procedureId === "string"
    && Boolean((value as MobileManifestAttachment).procedureId);
}

export function stableRouteKey(id: string): string { return `procedure:${id}`; }

export function mobileAttachmentEntries(content: Pick<MobileContent, "procedures">): MobileManifestAttachment[] {
  return content.procedures.flatMap((procedure) => procedure.attachments.map((attachment) => ({ ...attachment, procedureId: procedure.id })));
}

export function mobilePackageHashPayload(snapshot: Pick<MobileSnapshot, "hash">, attachmentManifestHashValue: string): Record<string, string | number> {
  return { schema: MOBILE_SNAPSHOT_SCHEMA, version: MOBILE_SNAPSHOT_VERSION, contentHash: snapshot.hash, attachmentManifestHash: attachmentManifestHashValue };
}

export function contentHash(content: MobileContent): string { return sha256Hex(canonicalJson(content)); }
export function attachmentManifestHash(attachments: MobileManifestAttachment[]): string { return sha256Hex(canonicalJson(attachments)); }
export function packageHash(content: MobileContent, attachments: MobileManifestAttachment[]): string {
  return packageHashFromContentHash(contentHash(content), attachments);
}

function packageHashFromContentHash(contentHashValue: string, attachments: MobileManifestAttachment[]): string {
  return sha256Hex(canonicalJson(mobilePackageHashPayload({ hash: contentHashValue }, attachmentManifestHash(attachments))));
}

/**
 * Cheap launch-time validation. It checks the shape and local invariants of a
 * package without canonicalising or hashing its full content body.
 *
 * Cryptographic validation remains available through isMobileContentSnapshot
 * and isMobileContentPackage for downloaded and activated packages.
 */
export function isMobileContentSnapshotShape(value: unknown): value is MobileSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<MobileSnapshot>;
  if (snapshot.schema !== MOBILE_SNAPSHOT_SCHEMA || snapshot.version !== MOBILE_SNAPSHOT_VERSION) return false;
  if (!snapshot.content || typeof snapshot.content !== "object" || !Array.isArray(snapshot.content.procedures)) return false;
  if (typeof snapshot.hash !== "string" || !/^[a-f0-9]{64}$/.test(snapshot.hash)) return false;
  if (snapshot.contentHash !== undefined && snapshot.contentHash !== snapshot.hash) return false;
  if (snapshot.packageHash !== undefined && !/^[a-f0-9]{64}$/.test(snapshot.packageHash)) return false;
  const content = snapshot.content as MobileContent;
  if (!content.relationsIndex || typeof content.relationsIndex !== "object" || !content.relationsIndex.codes || typeof content.relationsIndex.codes !== "object") return false;
  if (content.updates !== undefined && (!Array.isArray(content.updates) || content.updates.some((event) => !isValidMobileUpdateEvent(event)))) return false;
  if (new Set(content.procedures.map((procedure) => procedure.id)).size !== content.procedures.length) return false;
  if (new Set(content.procedures.map((procedure) => procedure.routeKey)).size !== content.procedures.length) return false;
  if (content.procedures.some((procedure) => procedure.routeKey !== stableRouteKey(procedure.id))) return false;
  if (content.procedures.some((procedure) => procedure.attachments.some((attachment) => !isValidAttachment(attachment)))) return false;
  const attachments = mobileAttachmentEntries(content);
  if (new Set(attachments.map((attachment) => attachment.id)).size !== attachments.length) return false;
  if (attachments.some((attachment) => !isValidManifestAttachment(attachment))) return false;
  return true;
}

function validateSnapshotIntegrity(value: unknown): { snapshot: MobileSnapshot; attachments: MobileManifestAttachment[]; packageHash: string } | undefined {
  if (!isMobileContentSnapshotShape(value)) return undefined;
  const snapshot = value as MobileSnapshot;
  const attachments = mobileAttachmentEntries(snapshot.content);
  if (contentHash(snapshot.content) !== snapshot.hash) return undefined;
  const computedPackageHash = packageHashFromContentHash(snapshot.hash, attachments);
  if (snapshot.packageHash !== undefined && snapshot.packageHash !== computedPackageHash) return undefined;
  return { snapshot, attachments, packageHash: computedPackageHash };
}

export function isMobileContentSnapshot(value: unknown): value is MobileSnapshot {
  return Boolean(validateSnapshotIntegrity(value));
}

export function isMobileContentPackage(value: unknown, manifestValue: unknown): value is MobileSnapshot {
  const validated = validateSnapshotIntegrity(value);
  if (!validated || !manifestValue || typeof manifestValue !== "object") return false;
  const manifest = manifestValue as Partial<MobileAttachmentManifest>;
  if (manifest.schema !== MOBILE_ATTACHMENT_MANIFEST_SCHEMA || manifest.version !== MOBILE_ATTACHMENT_MANIFEST_VERSION) return false;
  if (manifest.generatedAt !== validated.snapshot.generatedAt || manifest.contentHash !== validated.snapshot.hash || !Array.isArray(manifest.attachments)) return false;
  return canonicalJson(manifest.attachments) === canonicalJson(validated.attachments)
    && manifest.packageHash === validated.packageHash
    && validated.snapshot.packageHash === manifest.packageHash;
}

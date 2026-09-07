import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { getAllProcedures } from "./content.ts";
import { buildManualRelationsIndex, type CodeReferenceSource } from "./manual-relations-index.ts";
import { capManualUpdateEvents, type ManualUpdateEvent } from "./manual-sync.ts";
import {
  MOBILE_ATTACHMENT_MANIFEST_SCHEMA,
  MOBILE_ATTACHMENT_MANIFEST_VERSION,
  MOBILE_SNAPSHOT_SCHEMA,
  MOBILE_SNAPSHOT_VERSION,
  canonicalJson,
  isValidAttachment,
  isValidManifestAttachment,
  mobileAttachmentEntries,
  mobilePackageHashPayload,
  stableRouteKey,
  type MobileProcedureMention,
  type MobileAttachmentManifest as MobileAttachmentManifestPackage,
} from "../apps/mobile/src/data/schema.ts";

export { MOBILE_SNAPSHOT_SCHEMA, MOBILE_SNAPSHOT_VERSION };
export { canonicalJson };

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
  attachments: MobileAttachmentManifest[];
  content: string;
  searchText: string;
}

export interface MobileAttachmentManifest {
  id: string;
  sourceUrl: string;
  localPath: string;
  filename: string;
  kind: "image" | "pdf" | "other";
  byteLength?: number;
  sha256?: string;
}

export interface MobileContentSnapshot {
  schema: typeof MOBILE_SNAPSHOT_SCHEMA;
  version: typeof MOBILE_SNAPSHOT_VERSION;
  generatedAt: string;
  hash: string;
  contentHash?: string;
  packageHash?: string;
  content: {
    procedures: MobileProcedure[];
    codes: Record<string, unknown[]>;
    drugs: unknown[];
    perfusions: unknown[];
    fluids: unknown[];
    commercialNames: unknown[];
    abbreviations: unknown[];
    hospitals: unknown[];
    bases: unknown[];
    status4: unknown[];
    manual: Record<string, unknown>;
    links: Record<string, unknown>;
    relationsIndex: { codes: Record<string, MobileProcedureMention[]> };
    updates: ManualUpdateEvent[];
  };
}

export interface MobileContentPackage {
  snapshot: MobileContentSnapshot;
  manifest: MobileAttachmentManifestPackage;
}

function readData<T>(name: string, cwd = process.cwd()): T {
  return JSON.parse(readFileSync(path.join(cwd, "content/data", `${name}.json`), "utf8")) as T;
}

function localAttachmentIntegrity(cwd: string, localPath: string): Pick<MobileAttachmentManifest, "byteLength" | "sha256"> {
  if (!localPath.startsWith("/") || localPath.includes("..") || localPath.includes("\\")) return {};
  const filePath = path.join(cwd, "public", localPath.slice(1));
  try {
    const bytes = readFileSync(filePath);
    return {
      byteLength: bytes.byteLength,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  } catch {
    // A missing upstream attachment stays in the manifest, but is never
    // claimable as local/essential until a later sync supplies its bytes.
    return {};
  }
}

function readProceduresLegacy(cwd: string): MobileProcedure[] {
  // The web corpus owns the id/slug map used during normalization. Passing a
  // fresh Map() here used to disable every editorial, content-link and
  // safe-mention link before relation derivation even had a chance to run.
  return getAllProcedures().map((procedure) => {
    const relations = procedure.relations.filter((relation) => relation.kind !== "suggested");
    return {
      id: procedure.id,
      title: procedure.title,
      section: procedure.section,
      slug: procedure.slug,
      routeKey: stableRouteKey(procedure.id),
      tags: procedure.tags,
      synonyms: procedure.synonyms,
      related: relations.filter((relation) => relation.direction === "outgoing").map((relation) => relation.id),
      backlinks: procedure.backlinks,
      relations,
      editorialBlocks: procedure.editorialBlocks,
      updated: procedure.updated,
      sourceUpdated: procedure.sourceUpdated,
      source: procedure.source,
      attachments: procedure.attachments.map((attachment) => ({
        id: createHash("sha1").update(`${attachment.sourceUrl}:${attachment.localPath}`).digest("hex").slice(0, 16),
        sourceUrl: attachment.sourceUrl,
        localPath: attachment.localPath,
        filename: path.basename(attachment.localPath),
        kind: attachment.kind,
        ...localAttachmentIntegrity(cwd, attachment.localPath),
      })),
      content: procedure.content,
      searchText: procedure.searchText,
    };
  });
}

function codeReferenceSources(codes: Record<string, unknown[]>): CodeReferenceSource[] {
  return Object.entries(codes).flatMap(([group, values]) => values.flatMap((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const record = value as Record<string, unknown>;
    if (typeof record.code !== "string" || typeof record.name !== "string") return [];
    return [{
      code: record.code,
      name: record.name,
      tab: group,
      subtab: group === "claves" ? "claves" : undefined,
      group: typeof record.group === "string" ? record.group : undefined,
      category: typeof record.category === "string" ? record.category : undefined,
    }];
  }));
}

function buildMobileRelationsIndex(
  procedures: MobileProcedure[],
  codes: Record<string, unknown[]>,
  drugs: unknown[],
): { codes: Record<string, MobileProcedureMention[]> } {
  const sources = codeReferenceSources(codes);
  const index = buildManualRelationsIndex({
    procedures,
    drugs: drugs.filter((value): value is { id: string; name: string } => Boolean(value) && typeof value === "object" && typeof (value as Record<string, unknown>).id === "string" && typeof (value as Record<string, unknown>).name === "string"),
    codes: sources,
  });
  const mobileCodes: Record<string, MobileProcedureMention[]> = {};
  for (const source of sources) {
    const sourceKey = `${source.tab}:${source.subtab ?? ""}:${source.code}`;
    const mobileKey = `${source.tab}:${source.code}`;
    if (index.codes[sourceKey]) mobileCodes[mobileKey] = index.codes[sourceKey];
  }
  return { codes: mobileCodes };
}

export function contentHash(content: MobileContentSnapshot["content"]): string {
  return createHash("sha256").update(canonicalJson(content), "utf8").digest("hex");
}

export function attachmentManifestHash(attachments: MobileAttachmentManifestPackage["attachments"]): string {
  return createHash("sha256").update(canonicalJson(attachments), "utf8").digest("hex");
}

export function packageHash(content: MobileContentSnapshot["content"], attachments: MobileAttachmentManifestPackage["attachments"]): string {
  return createHash("sha256")
    .update(canonicalJson(mobilePackageHashPayload({ hash: contentHash(content) }, attachmentManifestHash(attachments))), "utf8")
    .digest("hex");
}

export function buildMobileContentSnapshot(cwd = process.cwd(), generatedAt?: string): MobileContentSnapshot {
  const manual = readData<Record<string, unknown>>("manual-sync", cwd);
  const updates = capManualUpdateEvents(readData<{ events?: ManualUpdateEvent[] }>("manual-updates", cwd).events ?? []);
  const codes: Record<string, unknown[]> = {
    incidente: readData("codigos-incidente", cwd),
    sva: readData("codigos-sva", cwd),
    svb: readData("codigos-svb", cwd),
    upsi: readData("codigos-upsi", cwd),
    upsq: readData("codigos-upsq", cwd),
    icao: readData("codigos-icao", cwd),
    indicativos: readData("codigos-indicativos", cwd),
    claves: readData("codigos-pc", cwd),
    lima: readData("codigos-lima", cwd),
    cheatsheet: readData("codigos-cheatsheet", cwd),
  };
  const drugs = readData<unknown[]>("vademecum", cwd);
  const procedures = readProceduresLegacy(cwd);
  const content: MobileContentSnapshot["content"] = {
    procedures,
    codes,
    drugs,
    perfusions: readData("perfusiones", cwd),
    fluids: readData("fluidos", cwd),
    commercialNames: readData("vademecum-comerciales", cwd),
    abbreviations: readData("abreviaturas", cwd),
    hospitals: readData("hospitals", cwd),
    bases: readData("bases", cwd),
    status4: readData("status4", cwd),
    manual,
    links: readData("main-links", cwd),
    relationsIndex: buildMobileRelationsIndex(procedures, codes, drugs),
    updates,
  };

  const hash = contentHash(content);
  const attachments = mobileAttachmentEntries(content);
  return {
    schema: MOBILE_SNAPSHOT_SCHEMA,
    version: MOBILE_SNAPSHOT_VERSION,
    generatedAt: generatedAt
      ?? (typeof manual.lastApprovedAt === "string" ? manual.lastApprovedAt : undefined)
      ?? (typeof manual.lastSyncAt === "string" ? manual.lastSyncAt : undefined)
      ?? "1970-01-01T00:00:00.000Z",
    hash,
    contentHash: hash,
    packageHash: packageHash(content, attachments),
    content,
  };
}

export function buildMobileContentPackage(cwd = process.cwd(), generatedAt?: string): MobileContentPackage {
  const snapshot = buildMobileContentSnapshot(cwd, generatedAt);
  const attachments = mobileAttachmentEntries(snapshot.content);
  return {
    snapshot,
    manifest: {
      schema: MOBILE_ATTACHMENT_MANIFEST_SCHEMA,
      version: MOBILE_ATTACHMENT_MANIFEST_VERSION,
      generatedAt: snapshot.generatedAt,
      contentHash: snapshot.hash,
      packageHash: snapshot.packageHash as string,
      attachments,
    },
  };
}

export function isMobileContentSnapshot(value: unknown): value is MobileContentSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<MobileContentSnapshot>;
  if (snapshot.schema !== MOBILE_SNAPSHOT_SCHEMA || snapshot.version !== MOBILE_SNAPSHOT_VERSION) return false;
  if (!snapshot.content || typeof snapshot.content !== "object" || !Array.isArray(snapshot.content.procedures)) return false;
  if (!snapshot.hash || typeof snapshot.hash !== "string") return false;
  if (!/^[a-f0-9]{64}$/.test(snapshot.hash)) return false;
  if (snapshot.contentHash !== undefined && snapshot.contentHash !== snapshot.hash) return false;
  if (snapshot.packageHash !== undefined && !/^[a-f0-9]{64}$/.test(snapshot.packageHash)) return false;
  const content = snapshot.content as MobileContentSnapshot["content"];
  if (!content.relationsIndex || typeof content.relationsIndex !== "object" || !content.relationsIndex.codes || typeof content.relationsIndex.codes !== "object") return false;
  if (new Set(content.procedures.map((procedure) => procedure.id)).size !== content.procedures.length) return false;
  if (new Set(content.procedures.map((procedure) => procedure.routeKey)).size !== content.procedures.length) return false;
  if (content.procedures.some((procedure) => procedure.routeKey !== stableRouteKey(procedure.id))) return false;
  if (content.procedures.some((procedure) => procedure.attachments.some((attachment) => !isValidAttachment(attachment)))) return false;
  const attachments = mobileAttachmentEntries(content);
  if (new Set(attachments.map((attachment) => attachment.id)).size !== attachments.length) return false;
  if (attachments.some((attachment) => !isValidManifestAttachment(attachment))) return false;
  return contentHash(content) === snapshot.hash;
}

export function isMobileContentPackage(value: unknown, manifestValue: unknown): value is MobileContentSnapshot {
  if (!isMobileContentSnapshot(value) || !manifestValue || typeof manifestValue !== "object") return false;
  const manifest = manifestValue as Partial<MobileAttachmentManifestPackage>;
  if (manifest.schema !== MOBILE_ATTACHMENT_MANIFEST_SCHEMA || manifest.version !== MOBILE_ATTACHMENT_MANIFEST_VERSION) return false;
  if (manifest.generatedAt !== value.generatedAt || manifest.contentHash !== value.hash || !Array.isArray(manifest.attachments)) return false;
  const expectedAttachments = mobileAttachmentEntries(value.content);
  if (canonicalJson(manifest.attachments) !== canonicalJson(expectedAttachments)) return false;
  if (manifest.packageHash !== packageHash(value.content, expectedAttachments)) return false;
  return value.packageHash === manifest.packageHash;
}

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { compileProcedureCorpus } from "./procedure-compiler.ts";
import { type CodeReferenceSource } from "./manual-relations-index.ts";
import {
  MOBILE_ATTACHMENT_MANIFEST_SCHEMA,
  MOBILE_ATTACHMENT_MANIFEST_VERSION,
  MOBILE_SNAPSHOT_SCHEMA,
  MOBILE_SNAPSHOT_VERSION,
  attachmentManifestHash,
  buildCodeRelationsIndex,
  capMobileUpdateEvents,
  canonicalJson,
  contentHash,
  isMobileContentPackage,
  isMobileContentSnapshot,
  isValidAttachment,
  isValidManifestAttachment,
  mobileAttachmentEntries,
  mobilePackageHashPayload,
  packageHash,
  sha256Hex,
  stableRouteKey,
  type MobileAttachment,
  type MobileAttachmentManifest,
  type MobileCodeReferenceSource,
  type MobileContent,
  type MobileContentPackage,
  type MobileContentSnapshot,
  type MobileProcedure,
  type MobileProcedureMention,
  type MobileUpdateEvent,
} from "../packages/manual-content/src/index.ts";

export {
  MOBILE_ATTACHMENT_MANIFEST_SCHEMA,
  MOBILE_ATTACHMENT_MANIFEST_VERSION,
  MOBILE_SNAPSHOT_SCHEMA,
  MOBILE_SNAPSHOT_VERSION,
  attachmentManifestHash,
  canonicalJson,
  contentHash,
  isMobileContentPackage,
  isMobileContentSnapshot,
  isValidAttachment,
  isValidManifestAttachment,
  mobileAttachmentEntries,
  mobilePackageHashPayload,
  packageHash,
  sha256Hex,
  stableRouteKey,
};
export type {
  MobileAttachment,
  MobileAttachmentManifest,
  MobileContent,
  MobileContentPackage,
  MobileContentSnapshot,
  MobileProcedure,
  MobileProcedureMention,
  MobileUpdateEvent,
};

function readData<T>(name: string, cwd = process.cwd()): T {
  return JSON.parse(readFileSync(path.join(cwd, "content/data", `${name}.json`), "utf8")) as T;
}

function localAttachmentIntegrity(cwd: string, localPath: string): Pick<MobileAttachment, "byteLength" | "sha256"> {
  if (!localPath.startsWith("/") || localPath.includes("..") || localPath.includes("\\")) return {};
  try {
    const bytes = readFileSync(path.join(cwd, "public", localPath.slice(1)));
    return { byteLength: bytes.byteLength, sha256: createHash("sha256").update(bytes).digest("hex") };
  } catch {
    return {};
  }
}

function readProcedures(cwd: string): MobileProcedure[] {
  return compileProcedureCorpus(cwd).map((procedure) => {
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

function buildMobileRelationsIndex(procedures: MobileProcedure[], codes: Record<string, unknown[]>): MobileContent["relationsIndex"] {
  return buildCodeRelationsIndex(procedures, codeReferenceSources(codes) as MobileCodeReferenceSource[]);
}

export function buildMobileContentSnapshot(cwd = process.cwd(), generatedAt?: string): MobileContentSnapshot {
  const manual = readData<Record<string, unknown>>("manual-sync", cwd);
  const updates = capMobileUpdateEvents(readData<{ events?: MobileUpdateEvent[] }>("manual-updates", cwd).events ?? []);
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
  const procedures = readProcedures(cwd);
  const content: MobileContent = {
    procedures,
    codes,
    drugs: readData("vademecum", cwd),
    perfusions: readData("perfusiones", cwd),
    fluids: readData("fluidos", cwd),
    commercialNames: readData("vademecum-comerciales", cwd),
    abbreviations: readData("abreviaturas", cwd),
    hospitals: readData("hospitals", cwd),
    bases: readData("bases", cwd),
    status4: readData("status4", cwd),
    manual,
    links: readData("main-links", cwd),
    relationsIndex: buildMobileRelationsIndex(procedures, codes),
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

import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import {
  buildAutoSynonyms,
  buildAutoTags,
  buildBacklinks,
  buildOutgoingRelations,
  buildSuggestedRelations,
  getProcedureSidebarMeta,
  normalizeProcedureContent,
  stripMarkdownToText,
  type ProcedureEditorialBlock,
  type ProcedureRelation,
} from "./manual-data.ts";
import type { ManualAttachment } from "./manual-sync.ts";
import { buildVademecumHref, resolveDrugIdReference, type VademecumDrugReference } from "./vademecum-utils.ts";
import { linkReferenceMentions, type ReferenceCode } from "./reference-links.ts";

/** The section order shared by every compiled procedure projection. */
export const PROCEDURE_SECTIONS_ORDER = [
  "Administrativos",
  "Comunicaciones",
  "Operativos",
  "DRP",
  "Intervinientes",
  "SVA",
  "SVB",
  "Psicológicos",
  "Técnicas",
] as const;

/** A parsed source record before links, relations, tags, and search text are compiled. */
export interface ProcedureSourceRecord {
  filePath: string;
  relativePath: string;
  id: string;
  title: string;
  section: string;
  slug: string;
  tags: string[];
  synonyms: string[];
  related: string[];
  updated: string;
  sourceUpdated: string;
  contentHash: string;
  source?: string;
  attachments: unknown[];
  editorialBlocks: ProcedureEditorialBlock[];
  content: string;
}

/** The canonical, fully compiled record consumed by web and generated projections. */
export interface CompiledProcedure {
  id: string;
  title: string;
  section: string;
  sidebarGroup: string;
  sidebarSubgroup: string;
  slug: string;
  tags: string[];
  synonyms: string[];
  related: string[];
  backlinks: string[];
  relations: ProcedureRelation[];
  updated: string;
  sourceUpdated: string;
  contentHash: string;
  source?: string;
  attachments: ManualAttachment[];
  editorialBlocks: ProcedureEditorialBlock[];
  searchText: string;
  content: string;
}

export type CompiledProcedureMeta = Omit<CompiledProcedure, "content">;

const LOCAL_ASSET_ALIASES: Record<string, string> = {
  "14_MedicacionIntranasal.pdf": "314_MedicacionIntranasal.pdf",
};

function walkMarkdownFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walkMarkdownFiles(entryPath));
    else if (entry.isFile() && entry.name.endsWith(".md")) files.push(entryPath);
  }
  return files;
}

function readProcedureEditorialBlocks(filePath: string): ProcedureEditorialBlock[] {
  const blockPath = filePath.replace(/\.md$/, ".blocks.json");
  if (!fs.existsSync(blockPath)) return [];

  try {
    const parsed = JSON.parse(fs.readFileSync(blockPath, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value as string[] : [];
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : value == null ? fallback : String(value);
}

/**
 * Read the procedure files once into the source representation used by all
 * compilers and exporters. Consumers that need original frontmatter metadata
 * (for example the LLM Markdown projection) should use this instead of walking
 * and parsing `content/procedures` themselves.
 */
export function loadProcedureSources(cwd = process.cwd()): ProcedureSourceRecord[] {
  const root = path.resolve(cwd);
  const proceduresDir = path.join(root, "content/procedures");
  if (!fs.existsSync(proceduresDir)) return [];

  return walkMarkdownFiles(proceduresDir).map((filePath) => {
    const filename = path.basename(filePath, ".md");
    const { data, content } = matter(fs.readFileSync(filePath, "utf8"));
    return {
      filePath,
      relativePath: path.relative(proceduresDir, filePath),
      id: stringValue(data.id, filename),
      title: stringValue(data.title, filename),
      section: stringValue(data.section, "General"),
      slug: stringValue(data.slug, filename),
      tags: stringArray(data.tags),
      synonyms: stringArray(data.synonyms),
      related: stringArray(data.related),
      updated: stringValue(data.updated, ""),
      sourceUpdated: stringValue(data.sourceUpdated, ""),
      contentHash: stringValue(data.contentHash, ""),
      source: typeof data.source === "string" ? data.source : undefined,
      attachments: Array.isArray(data.attachments) ? data.attachments : [],
      editorialBlocks: readProcedureEditorialBlocks(filePath),
      content,
    };
  });
}

function walkPublicAssets(dir: string, relativeDir = ""): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(dir, entry.name);
    const relativePath = path.join(relativeDir, entry.name);
    if (entry.isDirectory()) return walkPublicAssets(absolutePath, relativePath);
    return entry.isFile() ? [relativePath] : [];
  });
}

const publicAssetIndexes = new Map<string, Map<string, string[]>>();

function getPublicAssetIndex(root: string, publicDir: string): Map<string, string[]> {
  const cacheKey = path.resolve(root);
  const cached = publicAssetIndexes.get(cacheKey);
  if (cached && process.env.NODE_ENV !== "development") return cached;

  const index = new Map<string, string[]>();
  for (const relativePath of walkPublicAssets(publicDir)) {
    if (!/^docs\/procedures\/|^images\/procedures\//.test(relativePath)) continue;
    const filename = path.basename(relativePath);
    const matches = index.get(filename) ?? [];
    matches.push(`/${relativePath.split(path.sep).join("/")}`);
    index.set(filename, matches);
  }
  publicAssetIndexes.set(cacheKey, index);
  return index;
}

function filenameFromAttachment(sourceUrl: string, localPath: string): string {
  const localFilename = path.basename(localPath);
  try {
    const sourceFilename = decodeURIComponent(new URL(sourceUrl).pathname.split("/").at(-1) ?? "");
    return sourceFilename.split("@").at(-1) || localFilename;
  } catch {
    return localFilename;
  }
}

function resolveLocalAttachmentPath(
  root: string,
  publicDir: string,
  sourceUrl: string,
  localPath: string,
): string | null {
  const directPath = path.join(publicDir, localPath.replace(/^\/+/, ""));
  if (fs.existsSync(directPath)) return localPath;

  const index = getPublicAssetIndex(root, publicDir);
  const filename = filenameFromAttachment(sourceUrl, localPath);
  const exactMatch = index.get(filename)?.[0];
  if (exactMatch) return exactMatch;

  const alias = LOCAL_ASSET_ALIASES[filename];
  return alias ? index.get(alias)?.[0] ?? null : null;
}

function normalizeWikiPagePath(value: string): string | null {
  try {
    const pathname = new URL(value, "https://manual.invalid").pathname;
    const marker = pathname.toLowerCase().indexOf("/bin/view/");
    if (marker < 0) return null;
    return decodeURIComponent(pathname.slice(marker))
      .replace(/\/WebHome\/?$/i, "")
      .replace(/\/+$/, "");
  } catch {
    return null;
  }
}

function normalizeAttachments(
  value: unknown,
  root: string,
  publicDir: string,
): ManualAttachment[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((attachment) => {
    if (!attachment || typeof attachment !== "object") return [];
    const record = attachment as Record<string, unknown>;
    const sourceUrl = typeof record.sourceUrl === "string" ? record.sourceUrl : "";
    const originalLocalPath = typeof record.localPath === "string" ? record.localPath : "";
    const kind = typeof record.kind === "string" ? record.kind as ManualAttachment["kind"] : "other";
    const error = typeof record.error === "string" ? record.error : undefined;
    if (!sourceUrl || !originalLocalPath) return [];

    const resolvedLocalPath = resolveLocalAttachmentPath(root, publicDir, sourceUrl, originalLocalPath);
    const localPath = resolvedLocalPath ?? originalLocalPath;
    const availability = resolvedLocalPath ? "available" : "unavailable";
    return [{
      sourceUrl,
      localPath,
      kind,
      availability,
      ...((error || availability === "unavailable")
        ? { error: error ?? "No hay una copia local disponible." }
        : {}),
    }];
  });
}

function readVademecum(root: string): VademecumDrugReference[] {
  return JSON.parse(fs.readFileSync(path.join(root, "content/data/vademecum.json"), "utf8")) as VademecumDrugReference[];
}

function readReferenceCodes(root: string): ReferenceCode[] {
  const references: Array<[string, string]> = [
    ["codigos-incidente", "incidente"], ["codigos-sva", "sva"], ["codigos-svb", "svb"],
    ["codigos-upsi", "upsi"], ["codigos-upsq", "upsq"], ["codigos-icao", "icao"],
    ["codigos-indicativos", "indicativos"], ["codigos-pc", "claves"], ["codigos-lima", "lima"],
  ];
  return references.flatMap(([file, tab]) => {
    try {
      const values = JSON.parse(fs.readFileSync(path.join(root, "content/data", `${file}.json`), "utf8"));
      return Array.isArray(values)
        ? values.flatMap((value) => value && typeof value.code === "string" && typeof value.name === "string"
          ? [{ code: value.code, name: value.name, tab, ...(tab === "claves" ? { subtab: "claves" } : {}) }]
          : [])
        : [];
    } catch {
      return [];
    }
  });
}

let compiledProcedureCache = new Map<string, CompiledProcedure[]>();

/**
 * Compile the canonical procedure corpus: one source read, one normalization
 * pass, and one relation graph for every consumer. The optional source list is
 * useful when a generator also needs original frontmatter projection fields.
 */
export function compileProcedureCorpus(
  cwd = process.cwd(),
  sources?: readonly ProcedureSourceRecord[],
): CompiledProcedure[] {
  const root = path.resolve(cwd);
  if (!sources && process.env.NODE_ENV !== "development") {
    const cached = compiledProcedureCache.get(root);
    if (cached) return cached;
  }

  const sourceRecords = sources ? [...sources] : loadProcedureSources(root);
  if (!sourceRecords.length) return [];

  const publicDir = path.join(root, "public");
  const vademecumDrugs = readVademecum(root);
  const referenceCodes = readReferenceCodes(root);
  const procedures = sourceRecords.map((source) => {
    const { filePath, relativePath, ...procedureSource } = source;
    void filePath;
    void relativePath;
    return {
      ...procedureSource,
      attachments: normalizeAttachments(source.attachments, root, publicDir),
      sidebarGroup: "",
      sidebarSubgroup: "",
      backlinks: [],
      relations: [],
      searchText: "",
    } satisfies Omit<CompiledProcedure, "content"> & { content: string };
  });
  const ordered = procedures.sort((a, b) => {
    const si = PROCEDURE_SECTIONS_ORDER.indexOf(a.section as typeof PROCEDURE_SECTIONS_ORDER[number]);
    const sj = PROCEDURE_SECTIONS_ORDER.indexOf(b.section as typeof PROCEDURE_SECTIONS_ORDER[number]);
    if (si !== sj) return si - sj;
    return a.id.localeCompare(b.id, "es", { numeric: true });
  });

  const validIds = new Set(ordered.map((procedure) => procedure.id));
  const idToSlug = new Map(ordered.map((procedure) => [procedure.id, procedure.slug]));
  const slugToId = new Map(ordered.map((procedure) => [procedure.slug, procedure.id]));
  const wikiPathToSlug = new Map<string, string>();
  for (const procedure of ordered) {
    const sourcePath = procedure.source ? normalizeWikiPagePath(procedure.source) : null;
    if (sourcePath) wikiPathToSlug.set(sourcePath, procedure.slug);
  }

  const attachmentHrefMap = new Map<string, string>();
  for (const procedure of ordered) {
    for (const attachment of procedure.attachments) {
      const href = attachment.availability === "unavailable" ? attachment.sourceUrl : attachment.localPath;
      attachmentHrefMap.set(attachment.localPath, href);
      attachmentHrefMap.set(attachment.sourceUrl, href);
    }
  }

  const resolveInternalHref = (href: string): string | null => {
    const attachmentHref = attachmentHrefMap.get(href);
    if (attachmentHref) return attachmentHref;
    const wikiPath = normalizeWikiPagePath(href);
    const slug = wikiPath ? wikiPathToSlug.get(wikiPath) : null;
    if (slug) return `/manual/${slug}`;
    if (/\.pdf(?:[?#].*)?$/i.test(href)) {
      return resolveLocalAttachmentPath(root, publicDir, "", href) ?? null;
    }
    return null;
  };

  const baseProcedures = ordered.map((procedure) => {
    const normalized = normalizeProcedureContent(procedure.content, idToSlug, procedure.source, {
      currentProcedureId: procedure.id,
      procedureTitle: procedure.title,
      resolveInternalHref,
      resolveDrugHref(reference) {
        const drugId = resolveDrugIdReference(reference, vademecumDrugs);
        return drugId ? buildVademecumHref(drugId) : null;
      },
    });
    const content = linkReferenceMentions(normalized, vademecumDrugs, referenceCodes, (id) => buildVademecumHref(id));
    const sidebarMeta = getProcedureSidebarMeta(procedure.section, procedure.id, procedure.title);
    const relations = buildOutgoingRelations({
      procedureId: procedure.id,
      editorialIds: procedure.related,
      rawContent: procedure.content,
      normalizedContent: content,
      validIds,
      slugToId,
    });
    return {
      ...procedure,
      content,
      related: relations.map((relation) => relation.id),
      relations,
      sidebarGroup: sidebarMeta.group,
      sidebarSubgroup: sidebarMeta.subgroup,
      tags: procedure.tags.length ? procedure.tags : buildAutoTags(procedure.section, procedure.title, content),
      synonyms: procedure.synonyms.length ? procedure.synonyms : buildAutoSynonyms(procedure.id, procedure.title),
      searchText: stripMarkdownToText(content),
    } satisfies CompiledProcedure;
  });

  const backlinks = buildBacklinks(baseProcedures);
  const outgoingById = new Map(baseProcedures.map((procedure) => [procedure.id, procedure.relations]));
  const resolved = baseProcedures.map((procedure): CompiledProcedure => {
    const suggestedRelations = buildSuggestedRelations(
      {
        id: procedure.id,
        section: procedure.section,
        sidebarGroup: procedure.sidebarGroup,
        sidebarSubgroup: procedure.sidebarSubgroup,
        related: procedure.related,
        backlinks: backlinks[procedure.id] ?? [],
      },
      baseProcedures.map((candidate) => ({
        id: candidate.id,
        section: candidate.section,
        sidebarGroup: candidate.sidebarGroup,
        sidebarSubgroup: candidate.sidebarSubgroup,
        related: candidate.related,
        backlinks: backlinks[candidate.id] ?? [],
      })),
    );
    const incomingRelations = (backlinks[procedure.id] ?? []).flatMap((sourceId) => {
      const sourceRelations = outgoingById.get(sourceId) ?? [];
      const directRelation = sourceRelations.find((relation) =>
        relation.id === procedure.id && relation.direction === "outgoing" && relation.kind !== "suggested",
      );
      if (!directRelation) return [];
      return [{ id: sourceId, direction: "incoming" as const, kind: directRelation.kind, strength: directRelation.strength }];
    });
    return {
      ...procedure,
      backlinks: backlinks[procedure.id] ?? [],
      relations: [...procedure.relations, ...incomingRelations, ...suggestedRelations],
    };
  });

  if (!sources && process.env.NODE_ENV !== "development") compiledProcedureCache.set(root, resolved);
  return resolved;
}

/** Clear only the compiler memo; useful for isolated build/test processes. */
export function clearProcedureCompilerCache(): void {
  compiledProcedureCache = new Map();
  publicAssetIndexes.clear();
}

import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import vademecumData from "@/content/data/vademecum.json";
import {
  buildAutoSynonyms,
  buildAutoTags,
  buildBacklinks,
  buildOutgoingRelations,
  buildSuggestedRelations,
  type ProcedureRelation,
  type ProcedureEditorialBlock,
  getProcedureSidebarMeta,
  normalizeProcedureContent,
  stripMarkdownToText,
} from "@/lib/manual-data";
import type { ManualAttachment } from "@/lib/manual-sync";
import { buildVademecumHref, resolveDrugIdReference, type VademecumDrugReference } from "@/lib/vademecum-utils";

const PROCEDURES_DIR = path.join(process.cwd(), "content/procedures");
const VADEMECUM_DRUGS = vademecumData as VademecumDrugReference[];

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
    const raw = fs.readFileSync(blockPath, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeAttachments(value: unknown): ManualAttachment[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((attachment) => {
    if (!attachment || typeof attachment !== "object") return [];

    const sourceUrl = typeof (attachment as { sourceUrl?: unknown }).sourceUrl === "string"
      ? (attachment as { sourceUrl: string }).sourceUrl
      : "";
    const localPath = typeof (attachment as { localPath?: unknown }).localPath === "string"
      ? (attachment as { localPath: string }).localPath
      : "";
    const kind = typeof (attachment as { kind?: unknown }).kind === "string"
      ? (attachment as { kind: ManualAttachment["kind"] }).kind
      : "other";

    if (!sourceUrl || !localPath) return [];
    return [{ sourceUrl, localPath, kind }];
  });
}

export interface Procedure {
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

export type ProcedureMeta = Omit<Procedure, "content">;

export interface ProcedureSidebarSubgroup {
  name: string;
  procedures: ProcedureMeta[];
}

export interface ProcedureSidebarGroup {
  name: string;
  subgroups: ProcedureSidebarSubgroup[];
}

export interface ProcedureSidebarSection {
  section: string;
  groups: ProcedureSidebarGroup[];
}

const SECTIONS_ORDER = [
  "Administrativos",
  "Comunicaciones",
  "Operativos",
  "DRP",
  "Intervinientes",
  "SVA",
  "SVB",
  "Psicológicos",
  "Técnicas",
  "General",
];

export function getAllProcedures(): Procedure[] {
  if (!fs.existsSync(PROCEDURES_DIR)) return [];

  const procedures: Procedure[] = walkMarkdownFiles(PROCEDURES_DIR)
    .map((filePath: string) => {
      const filename = path.basename(filePath);
      const raw = fs.readFileSync(filePath, "utf8");
      const { data, content } = matter(raw);
      return {
        id: data.id ?? filename.replace(".md", ""),
        title: data.title ?? filename,
        section: data.section ?? "General",
        sidebarGroup: "",
        sidebarSubgroup: "",
        slug: data.slug ?? filename.replace(".md", ""),
        tags: Array.isArray(data.tags) ? data.tags : [],
        synonyms: Array.isArray(data.synonyms) ? data.synonyms : [],
        related: Array.isArray(data.related) ? data.related : [],
        backlinks: [],
        relations: [],
        updated: data.updated ?? "",
        sourceUpdated: data.sourceUpdated ?? "",
        contentHash: data.contentHash ?? "",
        source: data.source,
        attachments: normalizeAttachments(data.attachments),
        editorialBlocks: readProcedureEditorialBlocks(filePath),
        searchText: "",
        content,
      } as Procedure;
    })
    .sort((a: Procedure, b: Procedure) => {
      const si = SECTIONS_ORDER.indexOf(a.section);
      const sj = SECTIONS_ORDER.indexOf(b.section);
      if (si !== sj) return si - sj;
      return a.id.localeCompare(b.id, "es", { numeric: true });
    });

  const validIds = new Set<string>(procedures.map((procedure) => procedure.id));
  const idToSlug = new Map<string, string>(procedures.map((procedure) => [procedure.id, procedure.slug]));
  const slugToId = new Map<string, string>(procedures.map((procedure) => [procedure.slug, procedure.id]));
  const baseProcedures = procedures.map((procedure: Procedure) => {
    const content = normalizeProcedureContent(procedure.content, idToSlug, procedure.source, {
      currentProcedureId: procedure.id,
      resolveDrugHref(reference) {
        const drugId = resolveDrugIdReference(reference, VADEMECUM_DRUGS);
        return drugId ? buildVademecumHref(drugId) : null;
      },
    });
    const sidebarMeta = getProcedureSidebarMeta(procedure.section, procedure.id, procedure.title);
    const outgoingRelations = buildOutgoingRelations({
      procedureId: procedure.id,
      editorialIds: procedure.related,
      rawContent: procedure.content,
      normalizedContent: content,
      validIds,
      slugToId,
    });
    const related = outgoingRelations.map((relation) => relation.id);
    const tags = procedure.tags.length
      ? procedure.tags
      : buildAutoTags(procedure.section, procedure.title, content);
    const synonyms = procedure.synonyms.length
      ? procedure.synonyms
      : buildAutoSynonyms(procedure.id, procedure.title);
    const searchText = stripMarkdownToText(content);

    return {
      ...procedure,
      content,
      related,
      relations: outgoingRelations,
      sidebarGroup: sidebarMeta.group,
      sidebarSubgroup: sidebarMeta.subgroup,
      tags,
      synonyms,
      searchText,
    };
  });

  const backlinks = buildBacklinks(baseProcedures);
  const outgoingById = new Map(
    baseProcedures.map((procedure) => [procedure.id, procedure.relations]),
  );

  return baseProcedures.map((procedure: Procedure) => {
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

      return [{
        id: sourceId,
        direction: "incoming" as const,
        kind: directRelation.kind,
        strength: directRelation.strength,
      }];
    });

    return {
      ...procedure,
      backlinks: backlinks[procedure.id] ?? [],
      relations: [...procedure.relations, ...incomingRelations, ...suggestedRelations],
    };
  });
}

export function getProcedureBySlug(slug: string): Procedure | null {
  const all = getAllProcedures();
  return all.find((p) => p.slug === slug) ?? null;
}

export function getProcedureById(id: string): Procedure | null {
  const all = getAllProcedures();
  return all.find((p) => p.id === id) ?? null;
}

export function getProcedureMeta(): ProcedureMeta[] {
  return getAllProcedures().map((procedure) => {
    const { content, ...meta } = procedure;
    void content;
    return meta;
  });
}

export function getProceduresBySection(): Record<string, ProcedureMeta[]> {
  const meta = getProcedureMeta();
  const result: Record<string, ProcedureMeta[]> = {};
  for (const p of meta) {
    if (!result[p.section]) result[p.section] = [];
    result[p.section].push(p);
  }
  return result;
}

export function getProcedureSidebarSections(): ProcedureSidebarSection[] {
  const meta = getProcedureMeta();
  const grouped = new Map<string, Map<string, Map<string, ProcedureMeta[]>>>();

  for (const procedure of meta) {
    if (!grouped.has(procedure.section)) {
      grouped.set(procedure.section, new Map());
    }

    const sectionGroups = grouped.get(procedure.section)!;
    if (!sectionGroups.has(procedure.sidebarGroup)) {
      sectionGroups.set(procedure.sidebarGroup, new Map());
    }

    const subgroupMap = sectionGroups.get(procedure.sidebarGroup)!;
    if (!subgroupMap.has(procedure.sidebarSubgroup)) {
      subgroupMap.set(procedure.sidebarSubgroup, []);
    }

    subgroupMap.get(procedure.sidebarSubgroup)!.push(procedure);
  }

  return [...grouped.entries()].map(([section, groups]) => ({
    section,
    groups: [...groups.entries()].map(([name, subgroups]) => ({
      name,
      subgroups: [...subgroups.entries()].map(([subgroupName, procedures]) => ({
        name: subgroupName,
        procedures,
      })),
    })),
  }));
}

export function getRelatedProcedures(procedure: Procedure): ProcedureMeta[] {
  const outgoingIds = procedure.relations
    .filter((relation) => relation.direction === "outgoing" && relation.kind !== "suggested")
    .map((relation) => relation.id);
  if (!outgoingIds.length) return [];
  const all = getProcedureMeta();
  return outgoingIds
    .map((id) => all.find((p) => p.id === id))
    .filter(Boolean) as ProcedureMeta[];
}

export function getBacklinkProcedures(procedure: Procedure): ProcedureMeta[] {
  const incomingIds = procedure.relations
    .filter((relation) => relation.direction === "incoming")
    .map((relation) => relation.id);
  if (!incomingIds.length) return [];
  const all = getProcedureMeta();
  return incomingIds
    .map((id) => all.find((p) => p.id === id))
    .filter(Boolean) as ProcedureMeta[];
}

export function getSuggestedProcedures(procedure: Procedure): ProcedureMeta[] {
  const suggestedIds = procedure.relations
    .filter((relation) => relation.direction === "outgoing" && relation.kind === "suggested")
    .map((relation) => relation.id);
  if (!suggestedIds.length) return [];
  const all = getProcedureMeta();
  return suggestedIds
    .map((id) => all.find((p) => p.id === id))
    .filter(Boolean) as ProcedureMeta[];
}

export function getAdjacentProcedures(id: string): { prev: ProcedureMeta | null; next: ProcedureMeta | null } {
  const all = getProcedureMeta();
  const idx = all.findIndex((p) => p.id === id);
  if (idx === -1) return { prev: null, next: null };
  return {
    prev: idx > 0 ? all[idx - 1] : null,
    next: idx < all.length - 1 ? all[idx + 1] : null,
  };
}

export function buildGraphData(procedures: ProcedureMeta[]) {
  const nodes = procedures.map((p) => ({
    id: p.id,
    data: { label: p.title, section: p.section, slug: p.slug },
    position: { x: 0, y: 0 },
    type: "procedure",
  }));

  const edgeSet = new Set<string>();
  const edges: { id: string; source: string; target: string }[] = [];

  for (const p of procedures) {
    for (const rel of p.related) {
      const edgeId = [p.id, rel].sort().join("--");
      if (!edgeSet.has(edgeId) && procedures.find((q) => q.id === rel)) {
        edgeSet.add(edgeId);
        edges.push({ id: edgeId, source: p.id, target: rel });
      }
    }
  }

  return { nodes, edges };
}

import fs from "fs";
import path from "path";
import matter from "gray-matter";
import {
  buildAutoSynonyms,
  buildAutoTags,
  buildBacklinks,
  deriveRelatedIds,
  getProcedureSidebarMeta,
  normalizeProcedureContent,
  stripMarkdownToText,
} from "@/lib/manual-data";

const PROCEDURES_DIR = path.join(process.cwd(), "content/procedures");

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
  updated: string;
  source?: string;
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
  "SVA",
  "SVB",
  "Psicológicos",
  "Técnicas",
  "General",
];

export function getAllProcedures(): Procedure[] {
  if (!fs.existsSync(PROCEDURES_DIR)) return [];

  const procedures = fs
    .readdirSync(PROCEDURES_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((filename) => {
      const filePath = path.join(PROCEDURES_DIR, filename);
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
        updated: data.updated ?? "",
        source: data.source,
        searchText: "",
        content,
      } as Procedure;
    })
    .sort((a, b) => {
      const si = SECTIONS_ORDER.indexOf(a.section);
      const sj = SECTIONS_ORDER.indexOf(b.section);
      if (si !== sj) return si - sj;
      return a.id.localeCompare(b.id, "es", { numeric: true });
    });

  const validIds = new Set(procedures.map((procedure) => procedure.id));
  const idToSlug = new Map(procedures.map((procedure) => [procedure.id, procedure.slug]));
  const enriched = procedures.map((procedure) => {
    const contentDerived = deriveRelatedIds(procedure.content, validIds).filter((id) => id !== procedure.id);
    const related = [...new Set([...procedure.related, ...contentDerived])];
    const content = normalizeProcedureContent(procedure.content, idToSlug, procedure.source);
    const sidebarMeta = getProcedureSidebarMeta(procedure.section, procedure.id, procedure.title);
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
      sidebarGroup: sidebarMeta.group,
      sidebarSubgroup: sidebarMeta.subgroup,
      tags,
      synonyms,
      searchText,
    };
  });

  const backlinks = buildBacklinks(enriched);

  return enriched.map((procedure) => ({
    ...procedure,
    backlinks: backlinks[procedure.id] ?? [],
  }));
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
  if (!procedure.related.length) return [];
  const all = getProcedureMeta();
  return procedure.related
    .map((id) => all.find((p) => p.id === id))
    .filter(Boolean) as ProcedureMeta[];
}

export function getBacklinkProcedures(procedure: Procedure): ProcedureMeta[] {
  if (!procedure.backlinks.length) return [];
  const all = getProcedureMeta();
  return procedure.backlinks
    .map((id) => all.find((p) => p.id === id))
    .filter(Boolean) as ProcedureMeta[];
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

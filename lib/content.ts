import fs from "fs";
import path from "path";
import matter from "gray-matter";

const PROCEDURES_DIR = path.join(process.cwd(), "content/procedures");

export interface Procedure {
  id: string;
  title: string;
  section: string;
  slug: string;
  tags: string[];
  synonyms: string[];
  related: string[];
  updated: string;
  source?: string;
  content: string;
}

export type ProcedureMeta = Omit<Procedure, "content">;

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

  return fs
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
        slug: data.slug ?? filename.replace(".md", ""),
        tags: data.tags ?? [],
        synonyms: data.synonyms ?? [],
        related: data.related ?? [],
        updated: data.updated ?? "",
        source: data.source,
        content,
      } as Procedure;
    })
    .sort((a, b) => {
      const si = SECTIONS_ORDER.indexOf(a.section);
      const sj = SECTIONS_ORDER.indexOf(b.section);
      if (si !== sj) return si - sj;
      return a.id.localeCompare(b.id, "es", { numeric: true });
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
  return getAllProcedures().map(({ content: _, ...meta }) => meta);
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

export function getRelatedProcedures(procedure: Procedure): ProcedureMeta[] {
  if (!procedure.related.length) return [];
  const all = getProcedureMeta();
  return procedure.related
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

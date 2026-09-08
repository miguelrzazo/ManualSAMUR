import {
  getProcedureCatalog,
  getProcedureRelationViews,
  type Procedure,
  type ProcedureMeta,
  type ProcedureNavMeta,
  type ProcedureSidebarSection,
} from "./procedure-catalog.ts";

export { compileProcedureCorpus } from "./procedure-compiler.ts";
export {
  clearProcedureCatalogCache,
  getProcedureCatalog,
  getProcedureRelationViews,
  getProcedureRouteData,
} from "./procedure-catalog.ts";
export type { ProcedureSourceRecord, CompiledProcedure } from "./procedure-compiler.ts";
export type {
  Procedure,
  ProcedureMeta,
  ProcedureNavMeta,
  ProcedureRelationViews,
  ProcedureRouteData,
  ProcedureSidebarGroup,
  ProcedureSidebarSection,
  ProcedureSidebarSubgroup,
} from "./procedure-catalog.ts";

/** Existing web entry point, now backed by the shared compiler. */
export function getAllProcedures(): Procedure[] {
  return getProcedureCatalog().procedures;
}

export function getProcedureBySlug(slug: string): Procedure | null {
  return getProcedureCatalog().bySlug.get(slug) ?? null;
}

export function getProcedureById(id: string): Procedure | null {
  return getProcedureCatalog().byId.get(id) ?? null;
}

export function getProcedureMeta(): ProcedureMeta[] {
  return getProcedureCatalog().metadata;
}

/** Variante ligera para lo que cruza a componentes cliente desde el layout raíz. */
export function getProcedureNavMeta(): ProcedureNavMeta[] {
  return getProcedureCatalog().nav;
}

export function getProceduresBySection(): Record<string, ProcedureMeta[]> {
  return getProcedureCatalog().proceduresBySection;
}

export function getProcedureSidebarSections(): ProcedureSidebarSection[] {
  return getProcedureCatalog().sidebarSections;
}

export function getRelatedProcedures(procedure: Procedure): ProcedureMeta[] {
  const catalog = getProcedureCatalog();
  return getProcedureRelationViews(procedure).related.flatMap((item) => {
    const meta = catalog.metadataById.get(item.id);
    return meta ? [meta] : [];
  });
}

export function getBacklinkProcedures(procedure: Procedure): ProcedureMeta[] {
  const catalog = getProcedureCatalog();
  return getProcedureRelationViews(procedure).backlinks.flatMap((item) => {
    const meta = catalog.metadataById.get(item.id);
    return meta ? [meta] : [];
  });
}

export function getSuggestedProcedures(procedure: Procedure): ProcedureMeta[] {
  const catalog = getProcedureCatalog();
  return getProcedureRelationViews(procedure).suggested.flatMap((item) => {
    const meta = catalog.metadataById.get(item.id);
    return meta ? [meta] : [];
  });
}

export function getAdjacentProcedures(id: string): { prev: ProcedureMeta | null; next: ProcedureMeta | null } {
  const catalog = getProcedureCatalog();
  const idx = catalog.indexById.get(id);
  if (idx === undefined) return { prev: null, next: null };
  return {
    prev: idx > 0 ? catalog.metadata[idx - 1] : null,
    next: idx < catalog.metadata.length - 1 ? catalog.metadata[idx + 1] : null,
  };
}

export function buildGraphData(procedures: ProcedureMeta[]) {
  const nodes = procedures.map((procedure) => ({
    id: procedure.id,
    data: { label: procedure.title, section: procedure.section, slug: procedure.slug },
    position: { x: 0, y: 0 },
    type: "procedure",
  }));

  const edgeSet = new Set<string>();
  const edges: { id: string; source: string; target: string }[] = [];
  for (const procedure of procedures) {
    for (const relatedId of procedure.related) {
      const edgeId = [procedure.id, relatedId].sort().join("--");
      if (!edgeSet.has(edgeId) && procedures.find((candidate) => candidate.id === relatedId)) {
        edgeSet.add(edgeId);
        edges.push({ id: edgeId, source: procedure.id, target: relatedId });
      }
    }
  }
  return { nodes, edges };
}

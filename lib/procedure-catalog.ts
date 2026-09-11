import {
  compileProcedureCorpus,
  type CompiledProcedure,
  type CompiledProcedureMeta,
} from "./procedure-compiler.ts";

export type Procedure = CompiledProcedure;
export type ProcedureMeta = CompiledProcedureMeta;

/** The smallest procedure identity needed by web navigation and link cards. */
export type ProcedureNavMeta = Pick<Procedure, "id" | "title" | "slug" | "section">;

export interface ProcedureSidebarSubgroup {
  name: string;
  procedures: ProcedureNavMeta[];
}

export interface ProcedureSidebarGroup {
  name: string;
  subgroups: ProcedureSidebarSubgroup[];
}

export interface ProcedureSidebarSection {
  section: string;
  groups: ProcedureSidebarGroup[];
}

export interface ProcedureRelationViews {
  related: ProcedureNavMeta[];
  backlinks: ProcedureNavMeta[];
  suggested: ProcedureNavMeta[];
}

/** Metadata assembled for one procedure page without projecting the full corpus. */
export interface ProcedureRouteData extends ProcedureRelationViews {
  procedure: Procedure;
  prev: ProcedureNavMeta | null;
  next: ProcedureNavMeta | null;
  procedureNav: ProcedureNavMeta[];
  validProcedureIds: string[];
  previewByProcedureId: Record<string, string>;
}

export interface ProcedureCatalog {
  procedures: Procedure[];
  procedureIds: string[];
  metadata: ProcedureMeta[];
  nav: ProcedureNavMeta[];
  byId: Map<string, Procedure>;
  bySlug: Map<string, Procedure>;
  metadataById: Map<string, ProcedureMeta>;
  navById: Map<string, ProcedureNavMeta>;
  indexById: Map<string, number>;
  proceduresBySection: Record<string, ProcedureMeta[]>;
  sidebarSections: ProcedureSidebarSection[];
}

let cachedCatalog: { root: string; value: ProcedureCatalog } | null = null;

function projectMeta(procedure: Procedure): ProcedureMeta {
  const { content, ...meta } = procedure;
  void content;
  return meta;
}

function projectNav(procedure: Procedure): ProcedureNavMeta {
  return {
    id: procedure.id,
    title: procedure.title,
    slug: procedure.slug,
    section: procedure.section,
  };
}

function buildSidebarSections(procedures: Procedure[]): ProcedureSidebarSection[] {
  const grouped = new Map<string, Map<string, Map<string, ProcedureNavMeta[]>>>();

  for (const procedure of procedures) {
    if (!grouped.has(procedure.section)) grouped.set(procedure.section, new Map());
    const sectionGroups = grouped.get(procedure.section)!;
    if (!sectionGroups.has(procedure.sidebarGroup)) sectionGroups.set(procedure.sidebarGroup, new Map());
    const subgroupMap = sectionGroups.get(procedure.sidebarGroup)!;
    if (!subgroupMap.has(procedure.sidebarSubgroup)) subgroupMap.set(procedure.sidebarSubgroup, []);
    subgroupMap.get(procedure.sidebarSubgroup)!.push(projectNav(procedure));
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

function buildCatalog(root: string): ProcedureCatalog {
  const procedures = compileProcedureCorpus(root);
  const procedureIds = procedures.map((procedure) => procedure.id);
  const metadata = procedures.map(projectMeta);
  const nav = procedures.map(projectNav);
  const byId = new Map(procedures.map((procedure) => [procedure.id, procedure]));
  const bySlug = new Map(procedures.map((procedure) => [procedure.slug, procedure]));
  const metadataById = new Map(procedures.map((procedure, index) => [procedure.id, metadata[index]]));
  const navById = new Map(procedures.map((procedure, index) => [procedure.id, nav[index]]));
  const indexById = new Map(procedures.map((procedure, index) => [procedure.id, index]));
  const proceduresBySection: Record<string, ProcedureMeta[]> = {};

  for (const procedure of metadata) {
    (proceduresBySection[procedure.section] ??= []).push(procedure);
  }

  return {
    procedures,
    procedureIds,
    metadata,
    nav,
    byId,
    bySlug,
    metadataById,
    navById,
    indexById,
    proceduresBySection,
    sidebarSections: buildSidebarSections(procedures),
  };
}

/**
 * Build the indexed web catalog from the canonical compiler. In development the
 * catalog is intentionally rebuilt so procedure edits remain hot-reloadable;
 * production gets one stable index for the lifetime of the build process.
 */
export function getProcedureCatalog(): ProcedureCatalog {
  const root = process.cwd();
  if (process.env.NODE_ENV !== "development" && cachedCatalog?.root === root) {
    return cachedCatalog.value;
  }

  const value = buildCatalog(root);
  if (process.env.NODE_ENV !== "development") cachedCatalog = { root, value };
  return value;
}

function relationIds(procedure: Procedure, predicate: (kind: string, direction: string) => boolean): string[] {
  return procedure.relations
    .filter((relation) => predicate(relation.kind, relation.direction))
    .map((relation) => relation.id);
}

function projectIds(catalog: ProcedureCatalog, ids: string[]): ProcedureNavMeta[] {
  return ids.flatMap((id) => {
    const procedure = catalog.navById.get(id);
    return procedure ? [procedure] : [];
  });
}

function buildPreviewByProcedureId(catalog: ProcedureCatalog, ids: string[]): Record<string, string> {
  const previews: Record<string, string> = {};
  for (const id of new Set(ids)) {
    const procedure = catalog.byId.get(id);
    if (!procedure) continue;
    const text = procedure.searchText.replace(/\s+/g, " ").trim();
    previews[id] = text.length > 260 ? `${text.slice(0, 257).trim()}...` : text;
  }
  return previews;
}

export function getProcedureRouteData(slug: string): ProcedureRouteData | null {
  const catalog = getProcedureCatalog();
  const procedure = catalog.bySlug.get(slug);
  if (!procedure) return null;

  const relatedIds = relationIds(
    procedure,
    (kind, direction) => direction === "outgoing" && kind !== "suggested",
  );
  const backlinkIds = relationIds(procedure, (_kind, direction) => direction === "incoming");
  const suggestedIds = relationIds(
    procedure,
    (kind, direction) => direction === "outgoing" && kind === "suggested",
  );
  const currentIndex = catalog.indexById.get(procedure.id);
  const linkedIds = [...relatedIds, ...backlinkIds, ...suggestedIds];

  return {
    procedure,
    related: projectIds(catalog, relatedIds),
    backlinks: projectIds(catalog, backlinkIds),
    suggested: projectIds(catalog, suggestedIds),
    prev: currentIndex !== undefined && currentIndex > 0 ? catalog.nav[currentIndex - 1] : null,
    next: currentIndex !== undefined && currentIndex < catalog.nav.length - 1
      ? catalog.nav[currentIndex + 1]
      : null,
    procedureNav: catalog.nav,
    validProcedureIds: catalog.procedureIds,
    previewByProcedureId: buildPreviewByProcedureId(catalog, linkedIds),
  };
}

export function getProcedureRelationViews(procedure: Procedure): ProcedureRelationViews {
  const catalog = getProcedureCatalog();
  return {
    related: projectIds(catalog, relationIds(
      procedure,
      (kind, direction) => direction === "outgoing" && kind !== "suggested",
    )),
    backlinks: projectIds(catalog, relationIds(procedure, (_kind, direction) => direction === "incoming")),
    suggested: projectIds(catalog, relationIds(
      procedure,
      (kind, direction) => direction === "outgoing" && kind === "suggested",
    )),
  };
}

/** Clear the web catalog memo for isolated tests or content reload tooling. */
export function clearProcedureCatalogCache(): void {
  cachedCatalog = null;
}

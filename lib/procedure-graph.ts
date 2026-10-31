/**
 * Grafo de procedimientos (issue #29).
 *
 * Módulo puro y seguro para cliente: no importa `node:fs` ni el compilador. El
 * generador (`scripts/generate-graph.ts`) le pasa el corpus compilado y escribe
 * `public/graph.json`; la vista del grafo importa solo los tipos y los helpers de
 * vecindario. El grafo nunca viaja en props de servidor → cliente: se descarga al
 * abrir el grafo.
 */

export const PROCEDURE_GRAPH_VERSION = 1;

export interface ProcedureGraphNode {
  id: string;
  title: string;
  slug: string;
  section: string;
}

/** Arista no dirigida entre dos procedimientos, deduplicada por pareja. */
export interface ProcedureGraphEdge {
  source: string;
  target: string;
}

export interface ProcedureGraph {
  version: number;
  /** Secciones presentes, en el orden canónico del corpus. */
  sections: string[];
  nodes: ProcedureGraphNode[];
  edges: ProcedureGraphEdge[];
}

/** Lo mínimo del procedimiento compilado que necesita el grafo. */
export interface ProcedureGraphSource {
  id: string;
  title: string;
  slug: string;
  section: string;
  relations: ReadonlyArray<{ id: string; direction: string; kind: string }>;
}

/**
 * Construye el grafo con la misma regla que la tarjeta "Enlaces salientes" de cada
 * procedimiento (`getProcedureRelationViews().related`): relaciones salientes que no
 * sean `suggested`. Las sugerencias son inferidas, no enlaces reales, y se excluyen
 * para que el grafo muestre solo lo que el manual enlaza de verdad. Las entrantes
 * son el reflejo de las salientes de otro nodo, así que también sobran.
 */
export function buildProcedureGraph(procedures: readonly ProcedureGraphSource[]): ProcedureGraph {
  const nodes: ProcedureGraphNode[] = procedures.map(({ id, title, slug, section }) => ({ id, title, slug, section }));
  const validIds = new Set(nodes.map((node) => node.id));
  const sections: string[] = [];
  for (const node of nodes) {
    if (!sections.includes(node.section)) sections.push(node.section);
  }

  const seen = new Set<string>();
  const edges: ProcedureGraphEdge[] = [];
  for (const procedure of procedures) {
    for (const relation of procedure.relations) {
      if (relation.direction !== "outgoing" || relation.kind === "suggested") continue;
      if (relation.id === procedure.id || !validIds.has(relation.id)) continue;
      const key = edgeKey(procedure.id, relation.id);
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ source: procedure.id, target: relation.id });
    }
  }

  return { version: PROCEDURE_GRAPH_VERSION, sections, nodes, edges };
}

export function edgeKey(a: string, b: string): string {
  return a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`;
}

/** Lista de adyacencia no dirigida. */
export function buildAdjacency(graph: Pick<ProcedureGraph, "edges">): Map<string, Set<string>> {
  const adjacency = new Map<string, Set<string>>();
  for (const { source, target } of graph.edges) {
    if (!adjacency.has(source)) adjacency.set(source, new Set());
    if (!adjacency.has(target)) adjacency.set(target, new Set());
    adjacency.get(source)!.add(target);
    adjacency.get(target)!.add(source);
  }
  return adjacency;
}

/**
 * Grafo local al estilo Obsidian: el nodo central y todo lo que está a `depth`
 * saltos o menos, con las aristas entre esos nodos.
 */
export function localSubgraph(graph: ProcedureGraph, centerId: string, depth = 1): ProcedureGraph {
  if (!graph.nodes.some((node) => node.id === centerId)) {
    return { ...graph, nodes: [], edges: [] };
  }
  const adjacency = buildAdjacency(graph);
  const included = new Set<string>([centerId]);
  let frontier = [centerId];
  for (let level = 0; level < Math.max(0, depth); level += 1) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const neighbour of adjacency.get(id) ?? []) {
        if (included.has(neighbour)) continue;
        included.add(neighbour);
        next.push(neighbour);
      }
    }
    frontier = next;
  }
  const nodes = graph.nodes.filter((node) => included.has(node.id));
  const edges = graph.edges.filter((edge) => included.has(edge.source) && included.has(edge.target));
  const sections = graph.sections.filter((section) => nodes.some((node) => node.section === section));
  return { version: graph.version, sections, nodes, edges };
}

/** Normaliza para buscar sin tildes ni mayúsculas. */
export function normalizeGraphQuery(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** IDs de nodos cuyo id o título contienen la consulta. */
export function matchGraphNodes(graph: Pick<ProcedureGraph, "nodes">, query: string): string[] {
  const needle = normalizeGraphQuery(query);
  if (!needle) return [];
  return graph.nodes
    .filter((node) => normalizeGraphQuery(`${node.id} ${node.title}`).includes(needle))
    .map((node) => node.id);
}

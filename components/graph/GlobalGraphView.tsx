"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Maximize2, Minus, Network, Plus, Search, X } from "lucide-react";
import { buildAdjacency, matchGraphNodes, type ProcedureGraphNode } from "@/lib/procedure-graph";
import { sectionColor, useProcedureGraph } from "./graph-data";
import { GraphPlaceholder, LazyProcedureGraphCanvas } from "./GraphLoader";
import { GraphNodeCard } from "./GraphNodeCard";
import type { GraphController } from "./ProcedureGraphCanvas";

export function GlobalGraphView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const focusParam = searchParams.get("foco");
  const state = useProcedureGraph();
  const graph = state.graph;

  const controllerRef = useRef<GraphController | null>(null);
  const [query, setQuery] = useState("");
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
  const [selected, setSelected] = useState<ProcedureGraphNode | null>(null);

  const adjacency = useMemo(() => (graph ? buildAdjacency(graph) : new Map<string, Set<string>>()), [graph]);
  const nodesById = useMemo(() => new Map(graph?.nodes.map((node) => [node.id, node]) ?? []), [graph]);
  const matchIds = useMemo(() => (graph ? matchGraphNodes(graph, query) : []), [graph, query]);
  const visibleMatchIds = useMemo(
    () => matchIds.filter((id) => !hidden.has(nodesById.get(id)?.section ?? "")),
    [matchIds, hidden, nodesById],
  );
  const matches = useMemo(() => new Set(visibleMatchIds), [visibleMatchIds]);
  const focusId = focusParam && nodesById.has(focusParam) ? focusParam : null;

  const onOpenNode = useCallback((node: ProcedureGraphNode) => router.push(`/manual/${node.slug}`), [router]);
  const onController = useCallback((controller: GraphController | null) => {
    controllerRef.current = controller;
  }, []);

  const runControl = (action: "in" | "out" | "fit") => {
    const controller = controllerRef.current;
    if (!controller) return;
    if (action === "fit") controller.fit();
    else controller.zoomBy(action === "in" ? 1.3 : 1 / 1.3);
  };

  const toggleSection = (section: string) => {
    setHidden((current) => {
      const next = new Set(current);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  };

  const sectionCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const node of graph?.nodes ?? []) counts.set(node.section, (counts.get(node.section) ?? 0) + 1);
    return counts;
  }, [graph]);

  const visibleCount = graph ? graph.nodes.filter((node) => !hidden.has(node.section)).length : 0;
  const visibleEdges = graph
    ? graph.edges.filter(
        (edge) => !hidden.has(nodesById.get(edge.source)?.section ?? "") && !hidden.has(nodesById.get(edge.target)?.section ?? ""),
      ).length
    : 0;

  return (
    <div className="map-route-shell relative overflow-hidden bg-background">
      {state.status === "ready" && graph ? (
        <LazyProcedureGraphCanvas
          graph={graph}
          variant="global"
          hiddenSections={hidden}
          matches={matches}
          focusId={focusId}
          onOpenNode={onOpenNode}
          onSelectNode={setSelected}
          onController={onController}
          ariaLabel={`Grafo de ${graph.nodes.length} procedimientos y ${graph.edges.length} conexiones. Usa el buscador para localizar un procedimiento y pulsa Intro para abrirlo.`}
          className="absolute inset-0"
        />
      ) : (
        <GraphPlaceholder label={state.status === "error" ? "No se pudo cargar el grafo." : "Cargando grafo…"} />
      )}

      {/* Panel superior: título, búsqueda y filtros por sección */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col gap-2 p-3 md:p-4">
        <div className="pointer-events-auto flex w-full max-w-md flex-col gap-2 rounded-xl border border-border/60 bg-background/90 p-3 shadow-sm backdrop-blur">
          <div className="flex items-center gap-2">
            <Network className="h-4 w-4 flex-shrink-0 text-primary" aria-hidden />
            <h1 className="text-sm font-semibold tracking-tight">Grafo de procedimientos</h1>
            {graph && (
              <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
                {visibleCount} nodos · {visibleEdges} enlaces
              </span>
            )}
          </div>
          <form
            role="search"
            className="relative"
            onSubmit={(event) => {
              event.preventDefault();
              const first = visibleMatchIds[0];
              if (!first) return;
              if (visibleMatchIds.length === 1) {
                const node = nodesById.get(first);
                if (node) onOpenNode(node);
              } else {
                controllerRef.current?.focusNode(first);
              }
            }}
          >
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por número o título…"
              aria-label="Buscar procedimiento en el grafo"
              className="h-9 w-full rounded-lg border border-border/70 bg-background pl-8 pr-8 text-sm outline-none transition-colors focus:border-primary/60 focus:ring-2 focus:ring-primary/20 [&::-webkit-search-cancel-button]:hidden"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Borrar búsqueda"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </form>
          {query && (
            <div aria-live="polite" className="text-[11px] text-muted-foreground">
              {visibleMatchIds.length === 0 ? (
                "Sin coincidencias"
              ) : (
                <div className="flex flex-col gap-1">
                  <span>
                    {visibleMatchIds.length} coincidencia{visibleMatchIds.length === 1 ? "" : "s"}
                    {visibleMatchIds.length === 1 ? " · Intro para abrir" : " · Intro centra la primera"}
                  </span>
                  <ul className="flex max-h-32 flex-col overflow-y-auto">
                    {visibleMatchIds.slice(0, 8).map((id) => {
                      const node = nodesById.get(id)!;
                      return (
                        <li key={id}>
                          <button
                            type="button"
                            onClick={() => controllerRef.current?.focusNode(id)}
                            className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs text-foreground transition-colors hover:bg-muted"
                          >
                            <span aria-hidden className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: sectionColor(node.section) }} />
                            <span className="w-12 flex-shrink-0 font-mono text-muted-foreground">{id}</span>
                            <span className="truncate">{node.title}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {graph && (
          <div
            className="pointer-events-auto -mx-3 flex gap-1.5 overflow-x-auto px-3 pb-1 md:mx-0 md:max-w-2xl md:flex-wrap md:overflow-visible md:px-0"
            role="group"
            aria-label="Filtrar por sección"
          >
            {graph.sections.map((section) => {
              const active = !hidden.has(section);
              return (
                <button
                  key={section}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleSection(section)}
                  className={`flex flex-shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium backdrop-blur transition-colors ${
                    active
                      ? "border-border/70 bg-background/90 text-foreground"
                      : "border-dashed border-border/60 bg-background/60 text-muted-foreground line-through"
                  }`}
                >
                  <span
                    aria-hidden
                    className="h-2 w-2 rounded-full"
                    style={{ background: active ? sectionColor(section) : "transparent", boxShadow: `inset 0 0 0 1.5px ${sectionColor(section)}` }}
                  />
                  {section}
                  <span className="tabular-nums text-muted-foreground">{sectionCounts.get(section)}</span>
                </button>
              );
            })}
            {hidden.size > 0 && (
              <button
                type="button"
                onClick={() => setHidden(new Set())}
                className="flex-shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium text-primary hover:underline"
              >
                Mostrar todas
              </button>
            )}
          </div>
        )}
      </div>

      {/* Controles de zoom */}
      {graph && (
        <div className="absolute bottom-3 right-3 flex flex-col gap-1 md:bottom-4 md:right-4">
          {[
            { label: "Acercar", icon: Plus, action: "in" as const },
            { label: "Alejar", icon: Minus, action: "out" as const },
            { label: "Encajar todo", icon: Maximize2, action: "fit" as const },
          ].map(({ label, icon: Icon, action }) => (
            <button
              key={label}
              type="button"
              onClick={() => runControl(action)}
              aria-label={label}
              title={label}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-border/70 bg-background/90 text-muted-foreground shadow-sm backdrop-blur transition-colors hover:text-foreground"
            >
              <Icon className="h-4 w-4" />
            </button>
          ))}
        </div>
      )}

      {/* Ficha del nodo seleccionado o ayuda */}
      <div className="pointer-events-none absolute bottom-3 left-3 right-16 flex md:bottom-4 md:left-4">
        {selected ? (
          <GraphNodeCard
            node={selected}
            connections={adjacency.get(selected.id)?.size ?? 0}
            onClose={() => controllerRef.current?.clearSelection()}
          />
        ) : graph ? (
          <p className="rounded-md bg-background/70 px-2 py-1 text-[11px] text-muted-foreground backdrop-blur">
            <span className="hidden md:inline">Arrastra para mover · rueda para zoom · pasa por encima para ver conexiones · clic para abrir</span>
            <span className="md:hidden">Toca un nodo para ver sus conexiones y otra vez para abrirlo · pellizca para zoom</span>
          </p>
        ) : null}
      </div>
    </div>
  );
}

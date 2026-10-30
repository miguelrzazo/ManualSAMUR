"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, Maximize2, Network } from "lucide-react";
import { buildAdjacency, localSubgraph, type ProcedureGraphNode } from "@/lib/procedure-graph";
import { useProcedureGraph } from "./graph-data";
import { GraphPlaceholder, LazyProcedureGraphCanvas } from "./GraphLoader";
import { GraphNodeCard } from "./GraphNodeCard";
import type { GraphController } from "./ProcedureGraphCanvas";

interface Props {
  procedureId: string;
}

/**
 * Grafo local del procedimiento. Cerrado por defecto: ni graph.json ni el chunk del
 * grafo se descargan hasta que el usuario lo abre.
 */
export function LocalGraphPanel({ procedureId }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <section className="mt-8 rounded-xl border border-border/60" data-print-hide aria-labelledby="grafo-local-titulo">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 px-4 py-3 text-left text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
      >
        <Network className="h-3.5 w-3.5" aria-hidden />
        <span id="grafo-local-titulo">Grafo local</span>
        <span className="ml-1 text-xs font-normal">{open ? "" : "· ver conexiones de este procedimiento"}</span>
        <ChevronDown className={`ml-auto h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open && <LocalGraphBody procedureId={procedureId} />}
    </section>
  );
}

function LocalGraphBody({ procedureId }: Props) {
  const router = useRouter();
  const state = useProcedureGraph();
  const [depth, setDepth] = useState<1 | 2>(1);
  const [selected, setSelected] = useState<ProcedureGraphNode | null>(null);
  const controllerRef = useRef<GraphController | null>(null);

  const subgraph = useMemo(
    () => (state.graph ? localSubgraph(state.graph, procedureId, depth) : null),
    [state.graph, procedureId, depth],
  );
  const adjacency = useMemo(() => (state.graph ? buildAdjacency(state.graph) : new Map<string, Set<string>>()), [state.graph]);
  const onOpenNode = useCallback(
    (node: ProcedureGraphNode) => {
      if (node.id !== procedureId) router.push(`/manual/${node.slug}`);
    },
    [router, procedureId],
  );
  const onController = useCallback((controller: GraphController | null) => {
    controllerRef.current = controller;
  }, []);

  const neighbours = subgraph ? subgraph.nodes.length - 1 : 0;

  return (
    <div className="border-t border-border/60">
      <div className="flex flex-wrap items-center gap-2 px-4 py-2 text-xs text-muted-foreground">
        <div className="flex rounded-lg border border-border/70 p-0.5" role="group" aria-label="Profundidad">
          {([1, 2] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={depth === value}
              onClick={() => setDepth(value)}
              className={`rounded-md px-2 py-0.5 font-medium transition-colors ${
                depth === value ? "bg-muted text-foreground" : "hover:text-foreground"
              }`}
            >
              {value} salto{value === 1 ? "" : "s"}
            </button>
          ))}
        </div>
        {subgraph && (
          <span className="tabular-nums">
            {neighbours} procedimiento{neighbours === 1 ? "" : "s"} conectado{neighbours === 1 ? "" : "s"}
          </span>
        )}
        <Link
          href={`/grafo?foco=${encodeURIComponent(procedureId)}`}
          className="ml-auto inline-flex items-center gap-1 font-medium text-primary hover:underline"
        >
          <Maximize2 className="h-3 w-3" aria-hidden />
          Grafo completo
        </Link>
      </div>
      <div className="relative h-[340px] overflow-hidden rounded-b-xl bg-muted/20 md:h-[420px]">
        {state.status === "error" ? (
          <GraphPlaceholder label="No se pudo cargar el grafo." />
        ) : !subgraph ? (
          <GraphPlaceholder label="Cargando grafo…" />
        ) : neighbours === 0 ? (
          <GraphPlaceholder label="Ningún otro procedimiento enlaza con este, ni este con otros." />
        ) : (
          <>
            <LazyProcedureGraphCanvas
              key={depth}
              graph={subgraph}
              variant="local"
              focusId={procedureId}
              onOpenNode={onOpenNode}
              onSelectNode={setSelected}
              onController={onController}
              ariaLabel={`Grafo local con ${neighbours} procedimientos conectados. Los mismos enlaces aparecen como lista en las tarjetas de abajo.`}
              className="absolute inset-0"
            />
            {selected && selected.id !== procedureId && (
              <div className="pointer-events-none absolute inset-x-3 bottom-3 flex">
                <GraphNodeCard
                  node={selected}
                  connections={adjacency.get(selected.id)?.size ?? 0}
                  onClose={() => controllerRef.current?.clearSelection()}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

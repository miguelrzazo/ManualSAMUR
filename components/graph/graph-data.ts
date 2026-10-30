"use client";

import { useEffect, useState } from "react";
import type { ProcedureGraph } from "@/lib/procedure-graph";

/**
 * Colores por sección. Tonos medios legibles sobre fondo claro y oscuro; se pintan
 * en canvas, así que no dependen de Tailwind.
 */
export const SECTION_COLORS: Record<string, string> = {
  Administrativos: "#64748b",
  Comunicaciones: "#8b5cf6",
  Operativos: "#eab308",
  DRP: "#f97316",
  Intervinientes: "#14b8a6",
  SVA: "#ef4444",
  SVB: "#3b82f6",
  "Psicológicos": "#22c55e",
  "Técnicas": "#ec4899",
};

export function sectionColor(section: string): string {
  return SECTION_COLORS[section] ?? "#94a3b8";
}

type GraphState =
  | { status: "loading"; graph: null; error: null }
  | { status: "ready"; graph: ProcedureGraph; error: null }
  | { status: "error"; graph: null; error: string };

// Una sola descarga por sesión, compartida entre el grafo local y el global.
let graphPromise: Promise<ProcedureGraph> | null = null;

function loadGraph(): Promise<ProcedureGraph> {
  graphPromise ??= fetch("/graph.json")
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json() as Promise<ProcedureGraph>;
    })
    .catch((error: unknown) => {
      graphPromise = null;
      throw error;
    });
  return graphPromise;
}

/** Descarga `public/graph.json` bajo demanda (solo cuando se monta el grafo). */
export function useProcedureGraph(): GraphState {
  const [state, setState] = useState<GraphState>({ status: "loading", graph: null, error: null });
  useEffect(() => {
    let cancelled = false;
    loadGraph().then(
      (graph) => {
        if (!cancelled) setState({ status: "ready", graph, error: null });
      },
      (error: unknown) => {
        if (!cancelled) setState({ status: "error", graph: null, error: error instanceof Error ? error.message : String(error) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}

"use client";

import dynamic from "next/dynamic";

/**
 * Punto de entrada perezoso al grafo: d3-force y el lienzo viajan en un chunk
 * propio que solo se descarga cuando se renderiza un grafo, nunca con la página.
 */
export const LazyProcedureGraphCanvas = dynamic(() => import("./ProcedureGraphCanvas"), {
  ssr: false,
  loading: () => <GraphPlaceholder label="Cargando grafo…" />,
});

export function GraphPlaceholder({ label }: { label: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground" role="status">
      {label}
    </div>
  );
}

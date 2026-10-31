"use client";

import Link from "next/link";
import { ArrowRight, X } from "lucide-react";
import type { ProcedureGraphNode } from "@/lib/procedure-graph";
import { sectionColor } from "./graph-data";

interface Props {
  node: ProcedureGraphNode;
  connections: number;
  onClose: () => void;
}

/** Ficha del nodo seleccionado (en táctil, el primer toque la muestra). */
export function GraphNodeCard({ node, connections, onClose }: Props) {
  return (
    <div className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border border-border/70 bg-background/95 p-3 shadow-lg backdrop-blur">
      <span
        aria-hidden
        className="mt-1 h-2.5 w-2.5 flex-shrink-0 rounded-full"
        style={{ background: sectionColor(node.section) }}
      />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-muted-foreground">
          <span className="font-mono">{node.id}</span> · {node.section} · {connections} conexi{connections === 1 ? "ón" : "ones"}
        </p>
        <p className="mt-0.5 text-sm font-semibold leading-snug">{node.title}</p>
        <Link
          href={`/manual/${node.slug}`}
          className="mt-2 inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          Abrir procedimiento
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Cerrar ficha"
        className="-m-1 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

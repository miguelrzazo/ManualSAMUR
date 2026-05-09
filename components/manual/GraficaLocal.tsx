"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { Maximize2, Minimize2 } from "lucide-react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ProcedureMeta } from "@/lib/content";

const SECTION_COLORS: Record<string, string> = {
  DRP: "#f97316",
  Intervinientes: "#14b8a6",
  Administrativos: "#94a3b8",
  Comunicaciones: "#a78bfa",
  Operativos: "#f59e0b",
  SVA: "#ef4444",
  SVB: "#3b82f6",
  "Psicológicos": "#10b981",
  Técnicas: "#06b6d4",
  General: "#94a3b8",
};

type RelationType = "related" | "backlink" | "suggested";

interface Props {
  current: ProcedureMeta;
  related: ProcedureMeta[];
  backlinks?: ProcedureMeta[];
  suggested?: ProcedureMeta[];
}

function createNodeStyle(color: string, isCurrent: boolean): CSSProperties {
  return {
    background: `${color}${isCurrent ? "ff" : "20"}`,
    color: "var(--foreground)",
    border: `1.5px solid ${isCurrent ? color : `${color}66`}`,
    borderRadius: 10,
    padding: "8px 10px",
    width: isCurrent ? 240 : 200,
    fontSize: isCurrent ? 13 : 12,
    fontWeight: isCurrent ? 700 : 500,
    lineHeight: 1.3,
    textAlign: "left",
    boxShadow: isCurrent ? `0 0 0 2px ${color}40` : "none",
  };
}

function relationStroke(relation: RelationType): string {
  if (relation === "related") return "rgba(100,116,139,0.58)";
  if (relation === "backlink") return "rgba(14,165,233,0.6)";
  return "rgba(245,158,11,0.58)";
}

function buildGraph(current: ProcedureMeta, related: ProcedureMeta[], backlinks: ProcedureMeta[], suggested: ProcedureMeta[]) {
  const relationById = new Map<string, { procedure: ProcedureMeta; relation: RelationType }>();

  for (const procedure of suggested) relationById.set(procedure.id, { procedure, relation: "suggested" });
  for (const procedure of backlinks) relationById.set(procedure.id, { procedure, relation: "backlink" });
  for (const procedure of related) relationById.set(procedure.id, { procedure, relation: "related" });

  const relatedNodes = [...relationById.values()].filter((item) => item.procedure.id !== current.id);
  const count = Math.max(relatedNodes.length, 1);

  const nodes: Node[] = [
    {
      id: current.id,
      data: { label: `${current.id} · ${current.title}`, slug: current.slug, section: current.section },
      position: { x: 0, y: 0 },
      draggable: false,
      style: createNodeStyle(SECTION_COLORS[current.section] ?? SECTION_COLORS.General, true),
    },
  ];

  const edges: Edge[] = [];
  const edgeIds = new Set<string>();
  const ringRadius = 340;

  relatedNodes.forEach((item, index) => {
    const angle = (2 * Math.PI * index) / count - Math.PI / 2;
    const procedure = item.procedure;
    const color = SECTION_COLORS[procedure.section] ?? SECTION_COLORS.General;

    nodes.push({
      id: procedure.id,
      data: { label: `${procedure.id} · ${procedure.title}`, slug: procedure.slug, section: procedure.section },
      position: {
        x: Math.cos(angle) * ringRadius,
        y: Math.sin(angle) * ringRadius,
      },
      draggable: false,
      style: createNodeStyle(color, false),
    });

    const edgeId = `${item.relation}:${current.id}:${procedure.id}`;
    if (edgeIds.has(edgeId)) return;
    edgeIds.add(edgeId);
    edges.push({
      id: edgeId,
      source: item.relation === "backlink" ? procedure.id : current.id,
      target: item.relation === "backlink" ? current.id : procedure.id,
      style: {
        stroke: relationStroke(item.relation),
        strokeWidth: item.relation === "related" ? 2 : 1.6,
        strokeDasharray: item.relation === "suggested" ? "5 4" : undefined,
      },
      animated: item.relation === "suggested",
    });
  });

  const relatedById = new Map(relatedNodes.map((item) => [item.procedure.id, item.procedure]));
  for (const procedure of relatedById.values()) {
    for (const relatedId of procedure.related ?? []) {
      if (!relatedById.has(relatedId)) continue;
      const pairKey = [procedure.id, relatedId].sort().join("--");
      const edgeId = `cluster:${pairKey}`;
      if (edgeIds.has(edgeId)) continue;
      edgeIds.add(edgeId);
      edges.push({
        id: edgeId,
        source: procedure.id,
        target: relatedId,
        style: {
          stroke: "rgba(99,102,241,0.34)",
          strokeWidth: 1.2,
        },
      });
    }
  }

  return { nodes, edges };
}

function GraphCanvas({ current, related, backlinks, suggested, expanded }: Props & { expanded?: boolean }) {
  const router = useRouter();
  const { nodes, edges } = useMemo(
    () => buildGraph(current, related, backlinks ?? [], suggested ?? []),
    [current, related, backlinks, suggested],
  );

  return (
    <div className={`w-full rounded-xl border border-border/60 overflow-hidden bg-muted/10 ${expanded ? "h-[78vh]" : "h-[360px]"}`}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodeClick={(_, node) => {
          const slug = node.data?.slug as string | undefined;
          if (slug && slug !== current.slug) router.push(`/manual/${slug}`);
        }}
        fitView
        fitViewOptions={{ padding: expanded ? 0.18 : 0.28 }}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag
        panOnScroll
        minZoom={0.15}
        maxZoom={2.5}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--border)" />
        <Controls showInteractive={false} />
        <MiniMap
          pannable
          zoomable
          nodeColor={(node) => {
            const section = node.data?.section as string | undefined;
            return SECTION_COLORS[section ?? "General"] ?? SECTION_COLORS.General;
          }}
        />
      </ReactFlow>
    </div>
  );
}

export function GraficaLocal({ current, related, backlinks = [], suggested = [] }: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            Gris: Enlaces Salientes · Azul: Backlinks · Ámbar: Sugeridos
          </p>
          <button
            onClick={() => setExpanded(true)}
            className="inline-flex items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <Maximize2 className="h-3.5 w-3.5" />
            Ampliar
          </button>
        </div>
        <GraphCanvas current={current} related={related} backlinks={backlinks} suggested={suggested} />
      </div>

      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogHeader className="sr-only">
          <DialogTitle>Gráfica Local Ampliada</DialogTitle>
        </DialogHeader>
        <DialogContent className="w-[95vw] max-w-[1200px] p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-sm font-medium">{current.id} · {current.title}</p>
            <button
              onClick={() => setExpanded(false)}
              className="inline-flex items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <Minimize2 className="h-3.5 w-3.5" />
              Cerrar
            </button>
          </div>
          <GraphCanvas current={current} related={related} backlinks={backlinks} suggested={suggested} expanded />
        </DialogContent>
      </Dialog>
    </>
  );
}

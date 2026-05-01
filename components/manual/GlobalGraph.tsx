"use client";

import { useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  ReactFlow,
  Node,
  Edge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { ProcedureMeta } from "@/lib/content";

const SECTION_COLORS: Record<string, string> = {
  Administrativos: "#64748b",
  Comunicaciones: "#7c3aed",
  Operativos: "#d97706",
  SVA: "#dc2626",
  SVB: "#2563eb",
  "Psicológicos": "#059669",
  Técnicas: "#0891b2",
  General: "#64748b",
};

const SECTION_ORDER = [
  "Administrativos",
  "Comunicaciones",
  "Operativos",
  "SVA",
  "SVB",
  "Psicológicos",
  "Técnicas",
  "General",
];

const COL_WIDTH = 200;
const COL_GAP = 40;
const NODE_H = 64;
const NODE_GAP = 10;
const HEADER_H = 44;
const HEADER_GAP = 16;

interface Props {
  procedures: ProcedureMeta[];
}

export function GlobalGraph({ procedures }: Props) {
  const router = useRouter();

  const { initialNodes, initialEdges } = useMemo(() => {
    const bySection: Record<string, ProcedureMeta[]> = {};
    for (const p of procedures) {
      if (!bySection[p.section]) bySection[p.section] = [];
      bySection[p.section].push(p);
    }

    const sections = SECTION_ORDER.filter((s) => bySection[s]);
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    const edgeSet = new Set<string>();
    const idToX: Record<string, number> = {};

    for (let si = 0; si < sections.length; si++) {
      const section = sections[si];
      const procs = bySection[section];
      const x = si * (COL_WIDTH + COL_GAP);
      const color = SECTION_COLORS[section] ?? "#64748b";

      nodes.push({
        id: `__section_${section}`,
        data: { label: section },
        position: { x, y: 0 },
        type: "default",
        selectable: false,
        draggable: false,
        style: {
          background: color,
          color: "#fff",
          width: COL_WIDTH,
          height: HEADER_H,
          borderRadius: 8,
          fontWeight: 700,
          fontSize: 12,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "none",
          cursor: "default",
        },
      });

      for (let pi = 0; pi < procs.length; pi++) {
        const p = procs[pi];
        const y = HEADER_H + HEADER_GAP + pi * (NODE_H + NODE_GAP);
        idToX[p.id] = x;

        nodes.push({
          id: p.id,
          data: { label: `${p.id}  ${p.title}`, slug: p.slug, section: p.section },
          position: { x, y },
          draggable: false,
          style: {
            background: color + "18",
            color: "var(--foreground)",
            width: COL_WIDTH,
            height: NODE_H,
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 500,
            padding: "8px 10px",
            border: `1.5px solid ${color}40`,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            lineHeight: 1.35,
            wordBreak: "break-word",
            whiteSpace: "normal",
            textAlign: "left",
          },
        });
      }
    }

    for (const p of procedures) {
      for (const relId of p.related) {
        const edgeId = [p.id, relId].sort().join("--");
        if (!edgeSet.has(edgeId) && procedures.find((q) => q.id === relId)) {
          edgeSet.add(edgeId);
          const srcColor = SECTION_COLORS[p.section] ?? "#94a3b8";
          edges.push({
            id: edgeId,
            source: p.id,
            target: relId,
            style: { stroke: srcColor + "80", strokeWidth: 1.5 },
            animated: false,
          });
        }
      }
    }

    return { initialNodes: nodes, initialEdges: edges };
  }, [procedures]);

  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (node.data?.slug) {
        router.push(`/manual/${node.data.slug as string}`);
      }
    },
    [router]
  );

  return (
    <div className="h-[560px] w-full rounded-xl border border-border/60 overflow-hidden bg-muted/10">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        fitView
        fitViewOptions={{ padding: 0.1 }}
        nodesDraggable={false}
        nodesConnectable={false}
        panOnScroll
        zoomOnScroll={false}
        minZoom={0.2}
        maxZoom={2}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--border)" />
        <Controls showInteractive={false} style={{ bottom: 8, left: 8 }} />
        <MiniMap
          nodeColor={(node) => {
            const section = node.data?.section as string | undefined;
            return section ? (SECTION_COLORS[section] ?? "#94a3b8") : "#94a3b8";
          }}
          style={{ bottom: 8, right: 8 }}
          pannable
          zoomable
        />
      </ReactFlow>
    </div>
  );
}

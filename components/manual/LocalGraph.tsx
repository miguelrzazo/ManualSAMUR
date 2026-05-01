"use client";

import { useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  ReactFlow,
  Node,
  Edge,
  Background,
  Controls,
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

interface Props {
  current: ProcedureMeta;
  related: ProcedureMeta[];
}

export function LocalGraph({ current, related }: Props) {
  const router = useRouter();

  const initialNodes: Node[] = useMemo(() => {
    const center: Node = {
      id: current.id,
      data: { label: `${current.id}\n${current.title}`, slug: current.slug },
      position: { x: 320, y: 220 },
      style: {
        background: SECTION_COLORS[current.section] ?? "#64748b",
        color: "#fff",
        border: "none",
        borderRadius: 10,
        fontWeight: 700,
        fontSize: 13,
        padding: "10px 14px",
        width: 180,
        textAlign: "center",
        lineHeight: 1.35,
        boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
        whiteSpace: "normal",
        wordBreak: "break-word",
      },
    };

    const angleStep = (2 * Math.PI) / Math.max(related.length, 1);
    const radius = 210;

    const neighbors: Node[] = related.map((p, i) => ({
      id: p.id,
      data: { label: `${p.id}\n${p.title}`, slug: p.slug },
      position: {
        x: 320 + radius * Math.cos(i * angleStep - Math.PI / 2),
        y: 220 + radius * Math.sin(i * angleStep - Math.PI / 2),
      },
      style: {
        background: SECTION_COLORS[p.section] ?? "#64748b",
        color: "#fff",
        border: "2px solid rgba(255,255,255,0.2)",
        borderRadius: 8,
        fontWeight: 500,
        fontSize: 12,
        padding: "8px 12px",
        width: 160,
        textAlign: "center",
        lineHeight: 1.3,
        opacity: 0.88,
        cursor: "pointer",
        whiteSpace: "normal",
        wordBreak: "break-word",
      },
    }));

    return [center, ...neighbors];
  }, [current, related]);

  const initialEdges: Edge[] = useMemo(
    () =>
      related.map((p) => ({
        id: `${current.id}-${p.id}`,
        source: current.id,
        target: p.id,
        style: { stroke: "rgba(148,163,184,0.6)", strokeWidth: 2 },
        animated: false,
      })),
    [current, related]
  );

  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (node.id !== current.id && node.data?.slug) {
        router.push(`/manual/${node.data.slug as string}`);
      }
    },
    [router, current.id]
  );

  return (
    <div className="h-[340px] w-full rounded-xl border border-border/60 overflow-hidden bg-muted/10">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnScroll
        zoomOnScroll={false}
        minZoom={0.4}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--border)" />
        <Controls showInteractive={false} style={{ bottom: 8, left: 8 }} />
      </ReactFlow>
    </div>
  );
}

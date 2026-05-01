"use client";

import { useMemo, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Maximize2 } from "lucide-react";
import type { ProcedureMeta } from "@/lib/content";

const SECTION_COLORS: Record<string, string> = {
  Administrativos: "#94a3b8",
  Comunicaciones:  "#a78bfa",
  Operativos:      "#fbbf24",
  SVA:             "#f87171",
  SVB:             "#60a5fa",
  "Psicológicos":  "#34d399",
  Técnicas:        "#22d3ee",
  General:         "#94a3b8",
};

interface Props {
  current: ProcedureMeta;
  related: ProcedureMeta[];
  backlinks?: ProcedureMeta[];
}

const W = 600;
const H = 340;

export function GraficaLocal({ current, related, backlinks = [] }: Props) {
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const [hovered, setHovered] = useState<string | null>(null);
  const [vb, setVb] = useState({ x: 0, y: 0, scale: 1 });
  const isPanning = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });
  const mouseDownPos = useRef({ x: 0, y: 0 });
  const [cursor, setCursor] = useState<"grab" | "grabbing">("grab");

  const palette = resolvedTheme === "dark"
    ? {
        background: "#10141c",
        border: "rgba(255,255,255,0.08)",
        pattern: "rgba(255,255,255,0.07)",
        edge: "rgba(196,205,222,0.26)",
        edgeStrong: "rgba(224,231,255,0.48)",
        incoming: "rgba(103, 193, 245, 0.4)",
        incomingStrong: "rgba(103, 193, 245, 0.72)",
        labelBg: "rgba(13,18,28,0.92)",
        labelText: "#f3f7ff",
        buttonBg: "rgba(255,255,255,0.08)",
        buttonText: "rgba(255,255,255,0.74)",
        legendBg: "rgba(13,18,28,0.75)",
        legendText: "rgba(240,244,255,0.72)",
      }
    : {
        background: "#f7f8fc",
        border: "rgba(15,23,42,0.10)",
        pattern: "rgba(15,23,42,0.08)",
        edge: "rgba(71,85,105,0.24)",
        edgeStrong: "rgba(51,65,85,0.42)",
        incoming: "rgba(14, 116, 144, 0.34)",
        incomingStrong: "rgba(14, 116, 144, 0.66)",
        labelBg: "rgba(255,255,255,0.94)",
        labelText: "#162033",
        buttonBg: "rgba(255,255,255,0.72)",
        buttonText: "rgba(15,23,42,0.72)",
        legendBg: "rgba(255,255,255,0.82)",
        legendText: "rgba(15,23,42,0.68)",
      };

  const { nodes, edges } = useMemo(() => {
    const cx = W / 2;
    const cy = H / 2;
    const radius = Math.min(W, H) * 0.32;

    const currentNode = {
      id: current.id,
      slug: current.slug,
      title: current.title,
      section: current.section,
      x: cx,
      y: cy,
      isCurrent: true,
      r: 14,
    };

    const outgoingStep = Math.PI / Math.max(related.length, 1);
    const relatedNodes = related.map((p, i) => ({
      id: p.id,
      slug: p.slug,
      title: p.title,
      section: p.section,
      x: cx + radius * Math.cos(i * outgoingStep - Math.PI),
      y: cy + radius * Math.sin(i * outgoingStep - Math.PI),
      isCurrent: false,
      relation: "related" as const,
      r: 8,
    }));

    const incomingStep = Math.PI / Math.max(backlinks.length, 1);
    const backlinkNodes = backlinks.map((p, i) => ({
      id: p.id,
      slug: p.slug,
      title: p.title,
      section: p.section,
      x: cx + radius * Math.cos(i * incomingStep),
      y: cy + radius * Math.sin(i * incomingStep),
      isCurrent: false,
      relation: "backlink" as const,
      r: 8,
    }));

    const edges = [
      ...related.map((p) => ({
        id: `${current.id}-${p.id}`,
        source: current.id,
        target: p.id,
        relation: "related" as const,
      })),
      ...backlinks.map((p) => ({
        id: `${p.id}-${current.id}`,
        source: p.id,
        target: current.id,
        relation: "backlink" as const,
      })),
    ];

    const nodeMap: Record<string, typeof currentNode> = {};
    for (const node of [currentNode, ...relatedNodes, ...backlinkNodes]) {
      nodeMap[node.id] = node;
    }

    return { nodes: [currentNode, ...relatedNodes, ...backlinkNodes], nodeMap, edges };
  }, [backlinks, current, related]);

  const nodeMap = useMemo(() => {
    const m: Record<string, (typeof nodes)[0]> = {};
    for (const n of nodes) m[n.id] = n;
    return m;
  }, [nodes]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    isPanning.current = true;
    setCursor("grabbing");
    lastMouse.current = { x: e.clientX, y: e.clientY };
    mouseDownPos.current = { x: e.clientX, y: e.clientY };
  }, []);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning.current) return;
    const dx = e.clientX - lastMouse.current.x;
    const dy = e.clientY - lastMouse.current.y;
    setVb((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
    lastMouse.current = { x: e.clientX, y: e.clientY };
  }, []);

  const onMouseUp = useCallback(() => {
    isPanning.current = false;
    setCursor("grab");
  }, []);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.88 : 1.14;
    setVb((v) => ({ ...v, scale: Math.max(0.2, Math.min(5, v.scale * factor)) }));
  }, []);

  const handleClick = useCallback(
    (e: React.MouseEvent, id: string, slug: string, isCurrent: boolean) => {
      if (isCurrent) return;
      const d = Math.hypot(e.clientX - mouseDownPos.current.x, e.clientY - mouseDownPos.current.y);
      if (d > 5) return;
      router.push(`/manual/${slug}`);
    },
    [router]
  );

  return (
    <div
      className="relative w-full rounded-xl overflow-hidden border"
      style={{ background: palette.background, borderColor: palette.border, height: "280px" }}
    >
      <svg
        width="100%" height="100%"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ cursor }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onWheel={onWheel}
      >
        <defs>
          <pattern id="ldots" width="20" height="20" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="0.7" fill={palette.pattern} />
          </pattern>
        </defs>
        <rect width={W} height={H} fill="url(#ldots)" />

        <g transform={`translate(${vb.x},${vb.y}) scale(${vb.scale})`}>
          {/* Edges */}
          {edges.map((e) => {
            const s = nodeMap[e.source];
            const t = nodeMap[e.target];
            if (!s || !t) return null;
            const isHighlighted = hovered === e.source || hovered === e.target;
            return (
              <line
                key={e.id}
                x1={s.x} y1={s.y} x2={t.x} y2={t.y}
                stroke={e.relation === "backlink"
                  ? (isHighlighted ? palette.incomingStrong : palette.incoming)
                  : (isHighlighted ? palette.edgeStrong : palette.edge)}
                strokeWidth={isHighlighted ? 1.5 : 0.8}
                strokeDasharray={e.relation === "backlink" ? "4 3" : undefined}
              />
            );
          })}

          {/* Nodes */}
          {nodes.map((node) => {
            const color = SECTION_COLORS[node.section] ?? "#94a3b8";
            const isHovered = hovered === node.id;
            const glowStrength = node.isCurrent ? "8px" : isHovered ? "6px" : "2px";
            const glow = `drop-shadow(0 0 ${glowStrength} ${color}66)`;
            const showLabel = node.isCurrent || isHovered || nodes.length <= 8;

            return (
              <g
                key={node.id}
                onMouseEnter={() => setHovered(node.id)}
                onMouseLeave={() => setHovered(null)}
                onClick={(e) => handleClick(e, node.id, node.slug, node.isCurrent)}
                style={{ cursor: node.isCurrent ? "default" : "pointer" }}
              >
                <circle cx={node.x} cy={node.y} r={node.r + 10} fill="transparent" />
                {node.isCurrent && (
                  <circle cx={node.x} cy={node.y} r={node.r + 5}
                    fill="transparent" stroke={color} strokeWidth={1} opacity={0.25} />
                )}
                <circle
                  cx={node.x} cy={node.y} r={node.r}
                  fill={color}
                  style={{ filter: glow }}
                />
                {showLabel && (
                  <g>
                    <rect
                      x={node.x + node.r + 5}
                      y={node.y - 9}
                      width={Math.min(node.title.length * 7, 190) + 10}
                      height={18}
                      rx={3}
                      fill={palette.labelBg}
                    />
                    <text
                      x={node.x + node.r + 10}
                      y={node.y + 4}
                      fill={palette.labelText}
                      fontSize={node.isCurrent ? 12 : 11}
                      fontWeight={node.isCurrent ? "600" : "400"}
                      fontFamily="var(--font-sans, ui-sans-serif)"
                      style={{ pointerEvents: "none", userSelect: "none" }}
                    >
                      {node.id} · {node.title.length > 26 ? node.title.slice(0, 26) + "…" : node.title}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      <button
        onClick={() => setVb({ x: 0, y: 0, scale: 1 })}
        className="absolute top-2 right-2 p-1.5 rounded-md transition-colors"
        style={{ background: palette.buttonBg, color: palette.buttonText }}
      >
        <Maximize2 className="h-3 w-3" />
      </button>

      <div
        className="absolute bottom-2 right-2 flex items-center gap-3 rounded-md px-2 py-1 text-[10px]"
        style={{ background: palette.legendBg, color: palette.legendText }}
      >
        <span className="inline-flex items-center gap-1">
          <span className="h-1.5 w-4 rounded-full" style={{ background: palette.edgeStrong }} />
          saliente
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-1.5 w-4 rounded-full border bg-transparent" style={{ borderColor: palette.incomingStrong }} />
          entrante
        </span>
      </div>
    </div>
  );
}

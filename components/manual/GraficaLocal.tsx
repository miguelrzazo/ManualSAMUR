"use client";

import { useMemo, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
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
}

const W = 600;
const H = 340;

export function GraficaLocal({ current, related }: Props) {
  const router = useRouter();
  const [hovered, setHovered] = useState<string | null>(null);
  const [vb, setVb] = useState({ x: 0, y: 0, scale: 1 });
  const isPanning = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });
  const mouseDownPos = useRef({ x: 0, y: 0 });

  const { nodes, edges } = useMemo(() => {
    const cx = W / 2;
    const cy = H / 2;
    const radius = Math.min(W, H) * 0.32;
    const step = (2 * Math.PI) / Math.max(related.length, 1);

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

    const relatedNodes = related.map((p, i) => ({
      id: p.id,
      slug: p.slug,
      title: p.title,
      section: p.section,
      x: cx + radius * Math.cos(i * step - Math.PI / 2),
      y: cy + radius * Math.sin(i * step - Math.PI / 2),
      isCurrent: false,
      r: 8,
    }));

    const edges = related.map((p) => ({
      id: `${current.id}-${p.id}`,
      source: current.id,
      target: p.id,
    }));

    const nodeMap: Record<string, typeof currentNode> = {};
    for (const n of [currentNode, ...relatedNodes]) nodeMap[n.id] = n;

    return { nodes: [currentNode, ...relatedNodes], nodeMap, edges };
  }, [current, related]);

  const nodeMap = useMemo(() => {
    const m: Record<string, (typeof nodes)[0]> = {};
    for (const n of nodes) m[n.id] = n;
    return m;
  }, [nodes]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    isPanning.current = true;
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

  const onMouseUp = useCallback(() => { isPanning.current = false; }, []);

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
      className="relative w-full rounded-xl overflow-hidden border border-white/10"
      style={{ background: "#0d1117", height: "280px" }}
    >
      <svg
        width="100%" height="100%"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ cursor: isPanning.current ? "grabbing" : "grab" }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onWheel={onWheel}
      >
        <defs>
          <pattern id="ldots" width="20" height="20" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="0.7" fill="rgba(255,255,255,0.06)" />
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
                stroke={isHighlighted ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.14)"}
                strokeWidth={isHighlighted ? 1.5 : 0.8}
              />
            );
          })}

          {/* Nodes */}
          {nodes.map((node) => {
            const color = SECTION_COLORS[node.section] ?? "#94a3b8";
            const isHovered = hovered === node.id;
            const glowStrength = node.isCurrent ? "12px" : isHovered ? "10px" : "5px";
            const glow = `drop-shadow(0 0 ${glowStrength} ${color}) ${node.isCurrent ? `drop-shadow(0 0 3px ${color})` : ""}`;

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
                {/* Always show label for current; hover for related */}
                {(node.isCurrent || isHovered) && (
                  <g>
                    <rect
                      x={node.x + node.r + 5}
                      y={node.y - 9}
                      width={Math.min(node.title.length * 7, 190) + 10}
                      height={18}
                      rx={3}
                      fill="rgba(0,0,0,0.8)"
                    />
                    <text
                      x={node.x + node.r + 10}
                      y={node.y + 4}
                      fill="white"
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
        className="absolute top-2 right-2 p-1.5 rounded-md bg-white/10 hover:bg-white/20 text-white/50 hover:text-white transition-colors"
      >
        <Maximize2 className="h-3 w-3" />
      </button>
    </div>
  );
}

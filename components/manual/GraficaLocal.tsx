"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Maximize2 } from "lucide-react";
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  type Simulation,
  type SimulationNodeDatum,
} from "d3-force";
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

interface SimNode extends SimulationNodeDatum {
  id: string;
  slug: string;
  title: string;
  section: string;
  isCurrent: boolean;
  relation?: "related" | "backlink";
  r: number;
}

interface SimEdge {
  id: string;
  source: SimNode;
  target: SimNode;
  relation: "related" | "backlink";
}

export function GraficaLocal({ current, related, backlinks = [] }: Props) {
  const router = useRouter();
  const { resolvedTheme } = useTheme();

  const [tick, setTick] = useState(0);
  const [hovered, setHovered] = useState<string | null>(null);
  const [vb, setVb] = useState({ x: 0, y: 0, scale: 1 });
  const [cursor, setCursor] = useState<"grab" | "grabbing" | "pointer">("grab");

  const nodesRef = useRef<SimNode[]>([]);
  const edgesRef = useRef<SimEdge[]>([]);
  const simRef = useRef<Simulation<SimNode, SimEdge> | null>(null);

  const draggingNode = useRef<SimNode | null>(null);
  const isPanning = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });
  const mouseDownPos = useRef({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);

  const palette = resolvedTheme === "dark"
    ? {
        background: "#10141c",
        border: "rgba(255,255,255,0.08)",
        pattern: "rgba(255,255,255,0.07)",
        edge: "rgba(196,205,222,0.26)",
        edgeStrong: "rgba(224,231,255,0.55)",
        incoming: "rgba(103, 193, 245, 0.36)",
        incomingStrong: "rgba(103, 193, 245, 0.75)",
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
        incoming: "rgba(14, 116, 144, 0.30)",
        incomingStrong: "rgba(14, 116, 144, 0.65)",
        labelBg: "rgba(255,255,255,0.94)",
        labelText: "#162033",
        buttonBg: "rgba(255,255,255,0.72)",
        buttonText: "rgba(15,23,42,0.72)",
        legendBg: "rgba(255,255,255,0.82)",
        legendText: "rgba(15,23,42,0.68)",
      };

  // Build and start simulation
  useEffect(() => {
    const cx = W / 2;
    const cy = H / 2;
    const spread = Math.min(W, H) * 0.28;

    const currentNode: SimNode = {
      id: current.id,
      slug: current.slug,
      title: current.title,
      section: current.section,
      isCurrent: true,
      r: 13,
      x: cx,
      y: cy,
      fx: cx, // pin center node
      fy: cy,
    };

    const relatedNodes: SimNode[] = related.map((p, i) => ({
      id: p.id,
      slug: p.slug,
      title: p.title,
      section: p.section,
      isCurrent: false,
      relation: "related",
      r: 8,
      x: cx + Math.cos((i / Math.max(related.length, 1)) * Math.PI + Math.PI) * spread + (Math.random() - 0.5) * 20,
      y: cy + Math.sin((i / Math.max(related.length, 1)) * Math.PI + Math.PI) * spread + (Math.random() - 0.5) * 20,
    }));

    const backlinkNodes: SimNode[] = backlinks.map((p, i) => ({
      id: p.id,
      slug: p.slug,
      title: p.title,
      section: p.section,
      isCurrent: false,
      relation: "backlink",
      r: 8,
      x: cx + Math.cos((i / Math.max(backlinks.length, 1)) * Math.PI) * spread + (Math.random() - 0.5) * 20,
      y: cy + Math.sin((i / Math.max(backlinks.length, 1)) * Math.PI) * spread + (Math.random() - 0.5) * 20,
    }));

    const allNodes = [currentNode, ...relatedNodes, ...backlinkNodes];
    nodesRef.current = allNodes;

    const nodeById = new Map(allNodes.map((n) => [n.id, n]));

    const allEdges: SimEdge[] = [
      ...related
        .filter((p) => nodeById.has(p.id))
        .map((p) => ({
          id: `${current.id}-${p.id}`,
          source: currentNode,
          target: nodeById.get(p.id)!,
          relation: "related" as const,
        })),
      ...backlinks
        .filter((p) => nodeById.has(p.id))
        .map((p) => ({
          id: `${p.id}-${current.id}`,
          source: nodeById.get(p.id)!,
          target: currentNode,
          relation: "backlink" as const,
        })),
    ];
    edgesRef.current = allEdges;

    simRef.current?.stop();

    const sim = forceSimulation(allNodes)
      .force(
        "link",
        forceLink<SimNode, SimEdge>(allEdges)
          .id((d) => d.id)
          .distance(90)
          .strength(0.5),
      )
      .force("charge", forceManyBody<SimNode>().strength(-130))
      .force("center", forceCenter(cx, cy).strength(0.04))
      .force("collision", forceCollide<SimNode>().radius((d) => d.r + 8))
      .alphaDecay(0.025)
      .on("tick", () => setTick((v) => v + 1));

    simRef.current = sim;

    return () => { sim.stop(); };
  }, [current, related, backlinks]);

  const screenToCanvas = useCallback(
    (sx: number, sy: number) => {
      const svgEl = svgRef.current;
      if (!svgEl) return { x: 0, y: 0 };
      const rect = svgEl.getBoundingClientRect();
      return {
        x: ((sx - rect.left) * (W / rect.width) - vb.x) / vb.scale,
        y: ((sy - rect.top) * (H / rect.height) - vb.y) / vb.scale,
      };
    },
    [vb],
  );

  const findNodeAt = useCallback((cx: number, cy: number): SimNode | null => {
    for (const n of nodesRef.current) {
      const r = n.r + 8;
      const dx = (n.x ?? 0) - cx;
      const dy = (n.y ?? 0) - cy;
      if (dx * dx + dy * dy <= r * r) return n;
    }
    return null;
  }, []);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      mouseDownPos.current = { x: e.clientX, y: e.clientY };
      const pos = screenToCanvas(e.clientX, e.clientY);
      const node = findNodeAt(pos.x, pos.y);
      if (node && !node.isCurrent) {
        draggingNode.current = node;
        node.fx = node.x;
        node.fy = node.y;
        simRef.current?.alphaTarget(0.2).restart();
        setCursor("grabbing");
      } else {
        isPanning.current = true;
        lastMouse.current = { x: e.clientX, y: e.clientY };
        setCursor("grabbing");
      }
    },
    [screenToCanvas, findNodeAt],
  );

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (draggingNode.current) {
        const pos = screenToCanvas(e.clientX, e.clientY);
        draggingNode.current.fx = pos.x;
        draggingNode.current.fy = pos.y;
        return;
      }
      if (!isPanning.current) return;
      const dx = e.clientX - lastMouse.current.x;
      const dy = e.clientY - lastMouse.current.y;
      setVb((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
      lastMouse.current = { x: e.clientX, y: e.clientY };
    },
    [screenToCanvas],
  );

  const onMouseUp = useCallback(
    (e: React.MouseEvent) => {
      if (draggingNode.current) {
        const d = Math.hypot(
          e.clientX - mouseDownPos.current.x,
          e.clientY - mouseDownPos.current.y,
        );
        if (d < 5 && !draggingNode.current.isCurrent) {
          const node = draggingNode.current;
          draggingNode.current = null;
          node.fx = undefined;
          node.fy = undefined;
          simRef.current?.alphaTarget(0);
          router.push(`/manual/${node.slug}`);
          setCursor("grab");
          return;
        }
        draggingNode.current.fx = undefined;
        draggingNode.current.fy = undefined;
        draggingNode.current = null;
        simRef.current?.alphaTarget(0);
      }
      isPanning.current = false;
      setCursor("grab");
    },
    [router],
  );

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.88 : 1.14;
    setVb((v) => ({ ...v, scale: Math.max(0.2, Math.min(5, v.scale * factor)) }));
  }, []);

  const nodes = nodesRef.current;
  const edges = edgesRef.current;
  const totalNodes = nodes.length;

  return (
    <div
      className="relative w-full rounded-xl overflow-hidden border"
      style={{ background: palette.background, borderColor: palette.border, height: "280px" }}
    >
      <svg
        ref={svgRef}
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
            const sx = (e.source as SimNode).x ?? 0;
            const sy = (e.source as SimNode).y ?? 0;
            const tx = (e.target as SimNode).x ?? 0;
            const ty = (e.target as SimNode).y ?? 0;
            const sid = (e.source as SimNode).id;
            const tid = (e.target as SimNode).id;
            const isHighlighted = hovered === sid || hovered === tid;
            return (
              <line
                key={e.id}
                x1={sx} y1={sy} x2={tx} y2={ty}
                stroke={e.relation === "backlink"
                  ? (isHighlighted ? palette.incomingStrong : palette.incoming)
                  : (isHighlighted ? palette.edgeStrong : palette.edge)}
                strokeWidth={isHighlighted ? 1.6 : 0.9}
                strokeDasharray={e.relation === "backlink" ? "4 3" : undefined}
              />
            );
          })}

          {/* Nodes */}
          {nodes.map((node) => {
            const color = SECTION_COLORS[node.section] ?? "#94a3b8";
            const isHovered = hovered === node.id;
            const nx = node.x ?? 0;
            const ny = node.y ?? 0;
            const showLabel = node.isCurrent || isHovered || totalNodes <= 8;

            return (
              <g
                key={node.id}
                onMouseEnter={() => setHovered(node.id)}
                onMouseLeave={() => setHovered(null)}
                style={{ cursor: node.isCurrent ? "default" : "pointer" }}
              >
                <circle cx={nx} cy={ny} r={node.r + 10} fill="transparent" />
                {node.isCurrent && (
                  <circle cx={nx} cy={ny} r={node.r + 5}
                    fill="transparent" stroke={color} strokeWidth={1} opacity={0.25} />
                )}
                <circle
                  cx={nx} cy={ny} r={node.r}
                  fill={color}
                  style={{
                    filter: node.isCurrent
                      ? `drop-shadow(0 0 10px ${color}88)`
                      : isHovered
                        ? `drop-shadow(0 0 6px ${color}88)`
                        : `drop-shadow(0 0 3px ${color}44)`,
                  }}
                />
                {showLabel && (
                  <g>
                    <rect
                      x={nx + node.r + 5}
                      y={ny - 9}
                      width={Math.min(node.title.length * 6.8, 190) + 10}
                      height={18}
                      rx={3}
                      fill={palette.labelBg}
                    />
                    <text
                      x={nx + node.r + 10}
                      y={ny + 4}
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

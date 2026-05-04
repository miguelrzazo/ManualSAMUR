"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { ZoomIn, ZoomOut, Maximize2, RefreshCw } from "lucide-react";
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

const SECTION_ORDER = [
  "Administrativos", "Comunicaciones", "Operativos", "SVA", "SVB", "Psicológicos", "Técnicas", "General",
];

interface SimNode extends SimulationNodeDatum {
  id: string;
  slug: string;
  title: string;
  section: string;
  degree: number;
}

interface SimLink {
  id: string;
  source: SimNode;
  target: SimNode;
}

interface Props {
  procedures: ProcedureMeta[];
}

const W = 900;
const H = 660;

function nodeRadius(n: SimNode) {
  return 5 + Math.min(n.degree * 1.4, 9);
}

export function GraficaGlobal({ procedures }: Props) {
  const router = useRouter();
  const { resolvedTheme } = useTheme();

  const [hovered, setHovered] = useState<string | null>(null);
  const [vb, setVb] = useState({ x: 0, y: 0, scale: 1 });
  const [cursor, setCursor] = useState<"grab" | "grabbing" | "pointer">("grab");
  const [nodes, setNodes] = useState<SimNode[]>([]);
  const [links, setLinks] = useState<SimLink[]>([]);
  const [hasTicked, setHasTicked] = useState(false);

  const nodesRef = useRef<SimNode[]>([]);
  const linksRef = useRef<SimLink[]>([]);
  const simRef = useRef<Simulation<SimNode, SimLink> | null>(null);

  const draggingNode = useRef<SimNode | null>(null);
  const isPanning = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });
  const mouseDownPos = useRef({ x: 0, y: 0 });

  const palette = resolvedTheme === "dark"
    ? {
        background: "#10141c",
        border: "rgba(255,255,255,0.08)",
        pattern: "rgba(255,255,255,0.07)",
        edge: "rgba(196,205,222,0.18)",
        edgeStrong: "rgba(224,231,255,0.42)",
        labelBg: "rgba(13,18,28,0.92)",
        labelText: "#f3f7ff",
        buttonBg: "rgba(255,255,255,0.08)",
        buttonText: "rgba(255,255,255,0.74)",
        legendText: "rgba(240,244,255,0.64)",
        countText: "rgba(255,255,255,0.38)",
      }
    : {
        background: "#f7f8fc",
        border: "rgba(15,23,42,0.10)",
        pattern: "rgba(15,23,42,0.08)",
        edge: "rgba(71,85,105,0.16)",
        edgeStrong: "rgba(51,65,85,0.36)",
        labelBg: "rgba(255,255,255,0.94)",
        labelText: "#162033",
        buttonBg: "rgba(255,255,255,0.72)",
        buttonText: "rgba(15,23,42,0.72)",
        legendText: "rgba(15,23,42,0.64)",
        countText: "rgba(15,23,42,0.38)",
      };

  const sections = useMemo(
    () => SECTION_ORDER.filter((s) => procedures.some((p) => p.section === s)),
    [procedures],
  );

  // Build and start simulation
  useEffect(() => {
    const edgeSet = new Set<string>();
    const degreeMap: Record<string, number> = {};
    const rawEdges: { source: string; target: string; id: string }[] = [];

    for (const p of procedures) {
      for (const rel of p.related) {
        const key = [p.id, rel].sort().join("--");
        if (!edgeSet.has(key) && procedures.some((q) => q.id === rel)) {
          edgeSet.add(key);
          rawEdges.push({ source: p.id, target: rel, id: key });
          degreeMap[p.id] = (degreeMap[p.id] || 0) + 1;
          degreeMap[rel] = (degreeMap[rel] || 0) + 1;
        }
      }
    }

    // Seed positions in section clusters
    const sects = SECTION_ORDER.filter((s) => procedures.some((p) => p.section === s));
    const newNodes: SimNode[] = procedures.map((p) => {
      const si = sects.indexOf(p.section);
      const angle = (2 * Math.PI * si) / Math.max(sects.length, 1);
      const r = Math.min(W, H) * 0.26;
      return {
        id: p.id,
        slug: p.slug,
        title: p.title,
        section: p.section,
        degree: degreeMap[p.id] || 0,
        x: W / 2 + Math.cos(angle) * r + (Math.random() - 0.5) * 50,
        y: H / 2 + Math.sin(angle) * r + (Math.random() - 0.5) * 50,
      };
    });

    nodesRef.current = newNodes;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNodes(newNodes);

    const nodeById = new Map(newNodes.map((n) => [n.id, n]));
    const newLinks = rawEdges
      .filter((e) => nodeById.has(e.source) && nodeById.has(e.target))
      .map((e) => ({
        ...e,
        source: nodeById.get(e.source)!,
        target: nodeById.get(e.target)!,
      }));
    linksRef.current = newLinks;
    setLinks(newLinks);

    simRef.current?.stop();

    const sim = forceSimulation(newNodes)
      .force(
        "link",
        forceLink<SimNode, SimLink>(newLinks)
          .id((d) => d.id)
          .distance(68)
          .strength(0.3),
      )
      .force("charge", forceManyBody<SimNode>().strength(-170))
      .force("center", forceCenter(W / 2, H / 2).strength(0.055))
      .force("collision", forceCollide<SimNode>().radius((d) => nodeRadius(d) + 5))
      .alphaDecay(0.018)
      .on("tick", () => {
        setHasTicked(true);
        setNodes([...nodesRef.current]);
      });

    simRef.current = sim;

    return () => { sim.stop(); };
  }, [procedures]);

  const reheat = useCallback(() => {
    simRef.current?.alpha(0.6).restart();
  }, []);

  const resetView = useCallback(() => setVb({ x: 0, y: 0, scale: 1 }), []);

  // Convert screen coords to SVG canvas coords
  const screenToCanvas = useCallback(
    (sx: number, sy: number) => {
      const svgEl = svgRef.current;
      if (!svgEl) return { x: 0, y: 0 };
      const rect = svgEl.getBoundingClientRect();
      const scaleX = W / rect.width;
      const scaleY = H / rect.height;
      return {
        x: ((sx - rect.left) * scaleX - vb.x) / vb.scale,
        y: ((sy - rect.top) * scaleY - vb.y) / vb.scale,
      };
    },
    [vb],
  );

  const svgRef = useRef<SVGSVGElement>(null);

  const findNodeAt = useCallback(
    (cx: number, cy: number): SimNode | null => {
      for (const n of nodesRef.current) {
        const r = nodeRadius(n) + 8;
        const dx = (n.x ?? 0) - cx;
        const dy = (n.y ?? 0) - cy;
        if (dx * dx + dy * dy <= r * r) return n;
      }
      return null;
    },
    [],
  );

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      mouseDownPos.current = { x: e.clientX, y: e.clientY };
      const canvasPos = screenToCanvas(e.clientX, e.clientY);
      const node = findNodeAt(canvasPos.x, canvasPos.y);
      if (node) {
        draggingNode.current = node;
        node.fx = node.x;
        node.fy = node.y;
        simRef.current?.alphaTarget(0.3).restart();
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
        const canvasPos = screenToCanvas(e.clientX, e.clientY);
        draggingNode.current.fx = canvasPos.x;
        draggingNode.current.fy = canvasPos.y;
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
        // If barely moved, treat as click
        const d = Math.hypot(
          e.clientX - mouseDownPos.current.x,
          e.clientY - mouseDownPos.current.y,
        );
        if (d < 5) {
          const node = draggingNode.current;
          draggingNode.current = null;
          node.fx = undefined;
          node.fy = undefined;
          simRef.current?.alphaTarget(0);
          router.push(`/manual/${node.slug}`);
          setCursor("grab");
          return;
        }
        // Release node (let physics take over again)
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
    setVb((v) => ({
      ...v,
      scale: Math.max(0.12, Math.min(8, v.scale * factor)),
    }));
  }, []);

  return (
    <div
      className="relative w-full rounded-xl overflow-hidden border"
      style={{ background: palette.background, borderColor: palette.border, height: "560px" }}
    >
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
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
          <pattern id="ggg-dots" width="24" height="24" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="0.8" fill={palette.pattern} />
          </pattern>
        </defs>

        <rect width={W} height={H} fill="url(#ggg-dots)" />

        <g transform={`translate(${vb.x},${vb.y}) scale(${vb.scale})`}>
          {/* Edges */}
          {links.map((e) => {
            const sx = (e.source as SimNode).x ?? 0;
            const sy = (e.source as SimNode).y ?? 0;
            const tx = (e.target as SimNode).x ?? 0;
            const ty = (e.target as SimNode).y ?? 0;
            const isHighlighted =
              hovered === (e.source as SimNode).id || hovered === (e.target as SimNode).id;
            return (
              <line
                key={e.id}
                x1={sx} y1={sy}
                x2={tx} y2={ty}
                stroke={isHighlighted ? palette.edgeStrong : palette.edge}
                strokeWidth={isHighlighted ? 1.6 : 0.8}
              />
            );
          })}

          {/* Nodes */}
          {nodes.map((node) => {
            const color = SECTION_COLORS[node.section] ?? "#94a3b8";
            const isHovered = hovered === node.id;
            const r = nodeRadius(node);
            const nx = node.x ?? 0;
            const ny = node.y ?? 0;

            return (
              <g
                key={node.id}
                onMouseEnter={() => setHovered(node.id)}
                onMouseLeave={() => setHovered(null)}
                style={{ cursor: "pointer" }}
              >
                <circle cx={nx} cy={ny} r={r + 10} fill="transparent" />
                {isHovered && (
                  <circle
                    cx={nx} cy={ny} r={r + 5}
                    fill="transparent"
                    stroke={color}
                    strokeWidth={1}
                    opacity={0.3}
                  />
                )}
                <circle
                  cx={nx} cy={ny} r={r}
                  fill={color}
                  style={{
                    filter: isHovered
                      ? `drop-shadow(0 0 8px ${color}99) drop-shadow(0 0 3px ${color}66)`
                      : `drop-shadow(0 0 4px ${color}44)`,
                  }}
                />
                {isHovered && (
                  <g>
                    <rect
                      x={nx + r + 6}
                      y={ny - 10}
                      width={Math.min(node.title.length * 7, 200) + 12}
                      height={20}
                      rx={4}
                      fill={palette.labelBg}
                    />
                    <text
                      x={nx + r + 12}
                      y={ny + 4}
                      fill={palette.labelText}
                      fontSize={12}
                      fontFamily="var(--font-sans, ui-sans-serif)"
                      style={{ pointerEvents: "none", userSelect: "none" }}
                    >
                      {node.id} · {node.title.length > 28 ? node.title.slice(0, 27) + "…" : node.title}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {/* Legend */}
      <div className="absolute bottom-3 left-3 flex flex-col gap-1 pointer-events-none">
        {sections.map((s) => (
          <div key={s} className="flex items-center gap-1.5">
            <div
              className="w-2 h-2 rounded-full"
              style={{ background: SECTION_COLORS[s], boxShadow: `0 0 4px ${SECTION_COLORS[s]}66` }}
            />
            <span className="text-[10px]" style={{ color: palette.legendText }}>{s}</span>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="absolute top-3 right-3 flex flex-col gap-1">
        {/* eslint-disable-next-line react-hooks/refs */}
        {[
          { icon: ZoomIn,    action: () => setVb((v) => ({ ...v, scale: Math.min(8, v.scale * 1.3) })) },
          { icon: ZoomOut,   action: () => setVb((v) => ({ ...v, scale: Math.max(0.12, v.scale * 0.77) })) },
          { icon: Maximize2, action: resetView },
          { icon: RefreshCw, action: reheat, title: "Reheat simulation" },
        ].map(({ icon: Icon, action, title }, i) => (
          <button
            key={i}
            onClick={action}
            title={title}
            className="p-1.5 rounded-md transition-colors"
            style={{ background: palette.buttonBg, color: palette.buttonText }}
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        ))}
      </div>

      {/* Stats */}
      <div
        className="absolute top-3 left-3 text-[10px] pointer-events-none"
        style={{ color: palette.countText }}
      >
        {nodes.length} procedimientos · {links.length} conexiones
      </div>

      {/* Drag hint */}
      {!hasTicked && (
        <div
          className="absolute bottom-3 right-3 text-[10px] pointer-events-none"
          style={{ color: palette.countText }}
        >
          Arrastra nodos · scroll para zoom
        </div>
      )}
    </div>
  );
}

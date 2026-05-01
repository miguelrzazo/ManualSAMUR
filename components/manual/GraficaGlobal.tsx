"use client";

import { useMemo, useRef, useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import type { ProcedureMeta } from "@/lib/content";

const SECTION_COLORS: Record<string, string> = {
  Administrativos: "#94a3b8",
  Comunicaciones: "#a78bfa",
  Operativos:     "#fbbf24",
  SVA:            "#f87171",
  SVB:            "#60a5fa",
  "Psicológicos": "#34d399",
  Técnicas:       "#22d3ee",
  General:        "#94a3b8",
};

const SECTION_ORDER = [
  "Administrativos","Comunicaciones","Operativos","SVA","SVB","Psicológicos","Técnicas","General",
];

interface NodeData {
  id: string;
  slug: string;
  title: string;
  section: string;
  x: number;
  y: number;
  degree: number;
}

interface EdgeData {
  id: string;
  source: string;
  target: string;
}

function forceLayout(
  procs: ProcedureMeta[],
  edgePairs: { source: string; target: string }[],
  width: number,
  height: number
): Record<string, { x: number; y: number }> {
  const n = procs.length;
  if (n === 0) return {};

  const k = Math.sqrt((width * height) / n) * 1.2;
  const cx = width / 2;
  const cy = height / 2;

  // Seed positions: section clusters around canvas center
  const sections = SECTION_ORDER.filter((s) => procs.some((p) => p.section === s));
  const positions: Record<string, { x: number; y: number }> = {};

  procs.forEach((p) => {
    const si = sections.indexOf(p.section);
    const sectionAngle = (2 * Math.PI * si) / Math.max(sections.length, 1);
    const sectionR = Math.min(width, height) * 0.28;
    const scx = cx + Math.cos(sectionAngle) * sectionR;
    const scy = cy + Math.sin(sectionAngle) * sectionR;
    const peers = procs.filter((q) => q.section === p.section);
    const pi = peers.indexOf(p);
    const peerR = 20 + peers.length * 10;
    const peerAngle = (2 * Math.PI * pi) / Math.max(peers.length, 1);
    positions[p.id] = {
      x: scx + Math.cos(peerAngle) * peerR + (Math.random() - 0.5) * 15,
      y: scy + Math.sin(peerAngle) * peerR + (Math.random() - 0.5) * 15,
    };
  });

  const vel: Record<string, { dx: number; dy: number }> = {};
  for (const p of procs) vel[p.id] = { dx: 0, dy: 0 };

  const ITERATIONS = 120;
  for (let iter = 0; iter < ITERATIONS; iter++) {
    const temp = k * 2 * (1 - iter / ITERATIONS);
    for (const p of procs) vel[p.id] = { dx: 0, dy: 0 };

    // Repulsion between all pairs
    for (let i = 0; i < procs.length; i++) {
      for (let j = i + 1; j < procs.length; j++) {
        const a = procs[i], b = procs[j];
        const dx = positions[a.id].x - positions[b.id].x;
        const dy = positions[a.id].y - positions[b.id].y;
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 0.1);
        const f = (k * k) / dist;
        vel[a.id].dx += (dx / dist) * f;
        vel[a.id].dy += (dy / dist) * f;
        vel[b.id].dx -= (dx / dist) * f;
        vel[b.id].dy -= (dy / dist) * f;
      }
    }

    // Attraction along edges
    for (const e of edgePairs) {
      if (!positions[e.source] || !positions[e.target]) continue;
      const dx = positions[e.target].x - positions[e.source].x;
      const dy = positions[e.target].y - positions[e.source].y;
      const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 0.1);
      const f = (dist * dist) / k;
      vel[e.source].dx += (dx / dist) * f;
      vel[e.source].dy += (dy / dist) * f;
      vel[e.target].dx -= (dx / dist) * f;
      vel[e.target].dy -= (dy / dist) * f;
    }

    // Gravity towards center
    for (const p of procs) {
      vel[p.id].dx += (cx - positions[p.id].x) * 0.01;
      vel[p.id].dy += (cy - positions[p.id].y) * 0.01;
    }

    // Apply with clamping
    for (const p of procs) {
      const len = Math.sqrt(vel[p.id].dx ** 2 + vel[p.id].dy ** 2);
      if (len === 0) continue;
      const disp = Math.min(len, temp);
      positions[p.id].x = Math.max(30, Math.min(width - 30,
        positions[p.id].x + (vel[p.id].dx / len) * disp));
      positions[p.id].y = Math.max(30, Math.min(height - 30,
        positions[p.id].y + (vel[p.id].dy / len) * disp));
    }
  }

  return positions;
}

interface Props {
  procedures: ProcedureMeta[];
}

const W = 900;
const H = 660;

export function GraficaGlobal({ procedures }: Props) {
  const router = useRouter();
  const svgRef = useRef<SVGSVGElement>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [vb, setVb] = useState({ x: 0, y: 0, scale: 1 });
  const isPanning = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });
  const mouseDownPos = useRef({ x: 0, y: 0 });

  const { nodes, edges } = useMemo(() => {
    const edgeSet = new Set<string>();
    const edgePairs: { source: string; target: string }[] = [];
    const degreeMap: Record<string, number> = {};

    for (const p of procedures) {
      degreeMap[p.id] = (degreeMap[p.id] || 0);
      for (const rel of p.related) {
        const key = [p.id, rel].sort().join("--");
        if (!edgeSet.has(key) && procedures.find((q) => q.id === rel)) {
          edgeSet.add(key);
          edgePairs.push({ source: p.id, target: rel });
          degreeMap[p.id] = (degreeMap[p.id] || 0) + 1;
          degreeMap[rel] = (degreeMap[rel] || 0) + 1;
        }
      }
    }

    const positions = forceLayout(procedures, edgePairs, W, H);

    const nodes: NodeData[] = procedures.map((p) => ({
      id: p.id,
      slug: p.slug,
      title: p.title,
      section: p.section,
      x: positions[p.id]?.x ?? W / 2,
      y: positions[p.id]?.y ?? H / 2,
      degree: degreeMap[p.id] || 0,
    }));

    const edges: EdgeData[] = edgePairs.map((e) => ({
      id: `${e.source}--${e.target}`,
      source: e.source,
      target: e.target,
    }));

    return { nodes, edges };
  }, [procedures]);

  const nodeMap = useMemo(() => {
    const m: Record<string, NodeData> = {};
    for (const n of nodes) m[n.id] = n;
    return m;
  }, [nodes]);

  const sections = useMemo(
    () => SECTION_ORDER.filter((s) => procedures.some((p) => p.section === s)),
    [procedures]
  );

  const resetView = useCallback(() => setVb({ x: 0, y: 0, scale: 1 }), []);

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

  const onMouseUp = useCallback(() => {
    isPanning.current = false;
  }, []);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.88 : 1.14;
    setVb((v) => ({
      ...v,
      scale: Math.max(0.15, Math.min(6, v.scale * factor)),
    }));
  }, []);

  const handleNodeClick = useCallback(
    (e: React.MouseEvent, node: NodeData) => {
      const d = Math.hypot(
        e.clientX - mouseDownPos.current.x,
        e.clientY - mouseDownPos.current.y
      );
      if (d > 5) return; // was a pan, not a click
      router.push(`/manual/${node.slug}`);
    },
    [router]
  );

  return (
    <div
      className="relative w-full rounded-xl overflow-hidden border border-white/10"
      style={{ background: "#0d1117", height: "560px" }}
    >
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
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
          <pattern id="dots" width="24" height="24" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="0.8" fill="rgba(255,255,255,0.06)" />
          </pattern>
        </defs>

        <rect width={W} height={H} fill="url(#dots)" />

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
                x1={s.x} y1={s.y}
                x2={t.x} y2={t.y}
                stroke={isHighlighted ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.12)"}
                strokeWidth={isHighlighted ? 1.5 : 0.8}
              />
            );
          })}

          {/* Nodes */}
          {nodes.map((node) => {
            const color = SECTION_COLORS[node.section] ?? "#94a3b8";
            const isHovered = hovered === node.id;
            const r = 5 + Math.min(node.degree * 1.5, 8);
            const glow = isHovered ? `drop-shadow(0 0 10px ${color}) drop-shadow(0 0 4px ${color})` : `drop-shadow(0 0 5px ${color}88)`;

            return (
              <g
                key={node.id}
                onMouseEnter={() => setHovered(node.id)}
                onMouseLeave={() => setHovered(null)}
                onClick={(e) => handleNodeClick(e, node)}
                style={{ cursor: "pointer" }}
              >
                {/* Hit area */}
                <circle cx={node.x} cy={node.y} r={r + 10} fill="transparent" />
                {/* Outer glow ring */}
                {isHovered && (
                  <circle cx={node.x} cy={node.y} r={r + 5}
                    fill="transparent"
                    stroke={color}
                    strokeWidth={1}
                    opacity={0.3}
                  />
                )}
                {/* Main node */}
                <circle
                  cx={node.x} cy={node.y} r={r}
                  fill={color}
                  style={{ filter: glow }}
                />
                {/* Label on hover */}
                {isHovered && (
                  <g>
                    <rect
                      x={node.x + r + 6}
                      y={node.y - 10}
                      width={Math.min(node.title.length * 7, 200) + 12}
                      height={20}
                      rx={4}
                      fill="rgba(0,0,0,0.75)"
                    />
                    <text
                      x={node.x + r + 12}
                      y={node.y + 4}
                      fill="white"
                      fontSize={12}
                      fontFamily="var(--font-sans, ui-sans-serif)"
                      style={{ pointerEvents: "none", userSelect: "none" }}
                    >
                      {node.id} · {node.title.length > 28 ? node.title.slice(0, 28) + "…" : node.title}
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
              style={{ background: SECTION_COLORS[s], boxShadow: `0 0 4px ${SECTION_COLORS[s]}` }}
            />
            <span className="text-[10px] text-white/50">{s}</span>
          </div>
        ))}
      </div>

      {/* Zoom controls */}
      <div className="absolute top-3 right-3 flex flex-col gap-1">
        {[
          { icon: ZoomIn, action: () => setVb((v) => ({ ...v, scale: Math.min(6, v.scale * 1.3) })) },
          { icon: ZoomOut, action: () => setVb((v) => ({ ...v, scale: Math.max(0.15, v.scale * 0.77) })) },
          { icon: Maximize2, action: resetView },
        ].map(({ icon: Icon, action }, i) => (
          <button
            key={i}
            onClick={action}
            className="p-1.5 rounded-md bg-white/10 hover:bg-white/20 text-white/60 hover:text-white transition-colors"
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        ))}
      </div>

      {/* Node count */}
      <div className="absolute top-3 left-3 text-[10px] text-white/30 pointer-events-none">
        {nodes.length} procedimientos · {edges.length} conexiones
      </div>
    </div>
  );
}

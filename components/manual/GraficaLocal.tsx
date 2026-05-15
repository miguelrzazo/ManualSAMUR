"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Maximize2 } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { ProcedureMeta } from "@/lib/content";

const SECTION_COLORS: Record<string, string> = {
  DRP: "#f97316", Intervinientes: "#14b8a6", Administrativos: "#94a3b8",
  Comunicaciones: "#a78bfa", Operativos: "#f59e0b", SVA: "#ef4444",
  SVB: "#3b82f6", "Psicológicos": "#10b981", Técnicas: "#06b6d4", General: "#94a3b8",
};

type RelType = "related" | "backlink" | "suggested";
function color(s: string) { return SECTION_COLORS[s] ?? SECTION_COLORS.General; }
function trunc(s: string, n: number) { return s.length > n ? s.slice(0, n - 1) + "…" : s; }

interface SimNode {
  id: string; slug: string; label: string; section: string;
  x: number; y: number; vx: number; vy: number; fixed: boolean;
  type: "center" | RelType;
}
interface SimEdge { source: string; target: string; type: RelType }

function buildSim(current: ProcedureMeta, related: ProcedureMeta[], backlinks: ProcedureMeta[], suggested: ProcedureMeta[]) {
  const nodes: SimNode[] = [];
  const edges: SimEdge[] = [];
  const seen = new Set<string>();

  nodes.push({ id: current.id, slug: current.slug, label: current.title, section: current.section, x: 0, y: 0, vx: 0, vy: 0, fixed: true, type: "center" });
  seen.add(current.id);

  const add = (procs: ProcedureMeta[], type: RelType, ring = 160) => {
    procs.forEach((p, i) => {
      if (seen.has(p.id)) return;
      seen.add(p.id);
      const angle = (2 * Math.PI * i) / Math.max(procs.length, 1) - Math.PI / 2;
      nodes.push({ id: p.id, slug: p.slug, label: p.title, section: p.section, x: Math.cos(angle) * ring, y: Math.sin(angle) * ring, vx: 0, vy: 0, fixed: false, type });
      edges.push({ source: current.id, target: p.id, type });
    });
  };
  add(related, "related", 140);
  add(backlinks, "backlink", 170);
  add(suggested, "suggested", 200);
  return { nodes, edges };
}

const REPULSION = 2400;
const LINK_REST = 140;
const LINK_STIFFNESS = 0.04;
const CENTER_GRAVITY = 0.015;
const DAMPING = 0.82;
const ALPHA_DECAY = 0.015;

function tick(nodes: SimNode[], edges: SimEdge[], alpha: number) {
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const d2 = dx * dx + dy * dy + 0.01;
      const f = alpha * REPULSION / d2;
      const fx = f * dx / Math.sqrt(d2), fy = f * dy / Math.sqrt(d2);
      if (!a.fixed) { a.vx -= fx; a.vy -= fy; }
      if (!b.fixed) { b.vx += fx; b.vy += fy; }
    }
  }
  const nodeById = new Map(nodes.map(n => [n.id, n]));
  for (const edge of edges) {
    const s = nodeById.get(edge.source), t = nodeById.get(edge.target);
    if (!s || !t) continue;
    const dx = t.x - s.x, dy = t.y - s.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const f = (d - LINK_REST) * LINK_STIFFNESS * alpha;
    const fx = f * dx / d, fy = f * dy / d;
    if (!s.fixed) { s.vx += fx; s.vy += fy; }
    if (!t.fixed) { t.vx -= fx; t.vy -= fy; }
  }
  for (const n of nodes) {
    if (n.fixed) continue;
    n.vx -= n.x * CENTER_GRAVITY * alpha;
    n.vy -= n.y * CENTER_GRAVITY * alpha;
    n.vx *= DAMPING; n.vy *= DAMPING;
    n.x += n.vx; n.y += n.vy;
  }
}

// Center node radius, regular node radius, invisible hit area radius
const CENTER_R = 9;
const NODE_R = 5;
const HIT_R = 18;

interface GraphProps {
  current: ProcedureMeta;
  related: ProcedureMeta[];
  backlinks: ProcedureMeta[];
  suggested: ProcedureMeta[];
}

function ForceGraph({ current, related, backlinks, suggested }: GraphProps) {
  const router = useRouter();
  const svgRef = useRef<SVGSVGElement>(null);
  const alphaRef = useRef(1);
  const rafRef = useRef<number>(0);
  const dragNodeRef = useRef<SimNode | null>(null);
  const dragStartRef = useRef({ cx: 0, cy: 0 });
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const VIEW_R = Math.max((related.length + backlinks.length + suggested.length) * 12 + 220, 240);
  const [vb, setVb] = useState({ x: -VIEW_R, y: -VIEW_R, w: VIEW_R * 2, h: VIEW_R * 2 });
  const vbRef = useRef(vb);

  const { nodes: initNodes, edges } = buildSim(current, related, backlinks, suggested);
  const nodesRef = useRef<SimNode[]>(initNodes);
  const [, forceUpdate] = useState(0);

  // Compute neighbor set for hover highlight
  const neighborIds = hoveredId
    ? new Set(edges.filter(e => e.source === hoveredId || e.target === hoveredId).flatMap(e => [e.source, e.target]))
    : null;

  useEffect(() => {
    const loop = () => {
      if (alphaRef.current > 0.001) {
        tick(nodesRef.current, edges, alphaRef.current);
        alphaRef.current = Math.max(0, alphaRef.current - ALPHA_DECAY);
        forceUpdate(v => v + 1);
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const f = e.deltaY > 0 ? 1.18 : 1 / 1.18;
      setVb(v => {
        const nv = { x: v.x + v.w * (f - 1) / 2, y: v.y + v.h * (f - 1) / 2, w: Math.min(VIEW_R * 6, Math.max(VIEW_R * 0.3, v.w * f)), h: Math.min(VIEW_R * 6, Math.max(VIEW_R * 0.3, v.h * f)) };
        vbRef.current = nv; return nv;
      });
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [VIEW_R]);

  const svgToWorld = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current; if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const v = vbRef.current;
    return { x: v.x + (clientX - rect.left) * v.w / rect.width, y: v.y + (clientY - rect.top) * v.h / rect.height };
  }, []);

  const panOriginRef = useRef({ cx: 0, cy: 0, vbx: 0, vby: 0 });
  const isPanningRef = useRef(false);

  const onPointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    dragStartRef.current = { cx: e.clientX, cy: e.clientY };
    const world = svgToWorld(e.clientX, e.clientY);
    const hit = nodesRef.current.find(n => {
      const dx = n.x - world.x, dy = n.y - world.y;
      return Math.sqrt(dx * dx + dy * dy) < HIT_R + 2;
    });
    if (hit && hit.type !== "center") {
      dragNodeRef.current = hit;
      hit.fixed = true; hit.vx = 0; hit.vy = 0;
      alphaRef.current = Math.max(alphaRef.current, 0.3);
    } else {
      isPanningRef.current = true;
      panOriginRef.current = { cx: e.clientX, cy: e.clientY, vbx: vbRef.current.x, vby: vbRef.current.y };
    }
    (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
  }, [svgToWorld]);

  const onPointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (dragNodeRef.current) {
      const world = svgToWorld(e.clientX, e.clientY);
      dragNodeRef.current.x = world.x; dragNodeRef.current.y = world.y;
      forceUpdate(v => v + 1);
    } else if (isPanningRef.current) {
      const svg = svgRef.current; if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const v = vbRef.current;
      const dx = (e.clientX - panOriginRef.current.cx) * v.w / rect.width;
      const dy = (e.clientY - panOriginRef.current.cy) * v.h / rect.height;
      const nv = { ...v, x: panOriginRef.current.vbx - dx, y: panOriginRef.current.vby - dy };
      vbRef.current = nv; setVb(nv);
    }
  }, [svgToWorld]);

  const onPointerUp = useCallback(() => {
    if (dragNodeRef.current) {
      dragNodeRef.current.fixed = false;
      dragNodeRef.current = null;
      alphaRef.current = Math.max(alphaRef.current, 0.2);
    }
    isPanningRef.current = false;
  }, []);

  const handleNodeClick = useCallback((e: React.MouseEvent, node: SimNode) => {
    const dx = e.clientX - dragStartRef.current.cx;
    const dy = e.clientY - dragStartRef.current.cy;
    if (Math.abs(dx) < 6 && Math.abs(dy) < 6) router.push(`/manual/${node.slug}`);
  }, [router]);

  const nodes = nodesRef.current;
  return (
    <svg ref={svgRef} viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} width="100%" height="100%"
      className="touch-none select-none cursor-grab active:cursor-grabbing"
      onPointerDown={onPointerDown} onPointerMove={onPointerMove}
      onPointerUp={onPointerUp} onPointerLeave={onPointerUp}
    >
      {/* Edges */}
      {edges.map((edge, i) => {
        const s = nodes.find(n => n.id === edge.source);
        const t = nodes.find(n => n.id === edge.target);
        if (!s || !t) return null;
        const isActive = !neighborIds || (neighborIds.has(edge.source) && neighborIds.has(edge.target));
        const edgeColor = isActive ? (color(t.section)) : "#94a3b8";
        return (
          <line key={i} x1={s.x} y1={s.y} x2={t.x} y2={t.y}
            stroke={edgeColor} strokeWidth={isActive ? 1.5 : 1}
            opacity={neighborIds ? (isActive ? 0.6 : 0.07) : 0.35}
            style={{ transition: "opacity 150ms, stroke-width 150ms" }}
          />
        );
      })}
      {/* Nodes */}
      {nodes.map((node) => {
        const c = color(node.section);
        const isCenter = node.type === "center";
        const r = isCenter ? CENTER_R : NODE_R;
        const isNeighbor = !neighborIds || neighborIds.has(node.id);
        const isHovered = hoveredId === node.id;
        const nodeOpacity = neighborIds ? (isNeighbor ? 1 : 0.12) : 1;

        return (
          <g key={node.id}
            style={{ cursor: isCenter ? "default" : "pointer", opacity: nodeOpacity, transition: "opacity 150ms" }}
            onClick={(e) => !isCenter && handleNodeClick(e, node)}
            onMouseEnter={() => setHoveredId(node.id)}
            onMouseLeave={() => setHoveredId(null)}
          >
            {/* Invisible hit area */}
            <circle r={HIT_R} fill="transparent" />
            {/* Glow on hover */}
            {isHovered && <circle r={r + 4} fill={c} opacity={0.18} />}
            {/* Main node circle */}
            <circle r={r}
              fill={isCenter ? c : `${c}33`}
              stroke={c}
              strokeWidth={isCenter ? 0 : 1}
            />
            {/* Center node label (always visible) */}
            {isCenter && (
              <>
                <text textAnchor="middle" dy={r + 12} fontSize={9} fontWeight="600" fill="currentColor" opacity={0.85}>
                  {node.id}
                </text>
                <text textAnchor="middle" dy={r + 22} fontSize={8} fill="currentColor" opacity={0.55}>
                  {trunc(node.label, 20)}
                </text>
              </>
            )}
            {/* Neighbor labels on hover */}
            {!isCenter && isHovered && (
              <>
                <text textAnchor="middle" dy={-r - 7} fontSize={9} fontWeight="600" fill={c}>
                  {node.id}
                </text>
                <text textAnchor="middle" dy={-r - 17} fontSize={8} fill="currentColor" opacity={0.7}>
                  {trunc(node.label, 22)}
                </text>
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}

interface Props {
  current: ProcedureMeta;
  related: ProcedureMeta[];
  backlinks?: ProcedureMeta[];
  suggested?: ProcedureMeta[];
}

export function GraficaLocal({ current, related, backlinks = [], suggested = [] }: Props) {
  const [modalOpen, setModalOpen] = useState(false);
  const all = related.length + backlinks.length + suggested.length;

  if (all === 0) {
    return <p className="text-xs text-muted-foreground text-center py-6">Sin conexiones registradas.</p>;
  }

  return (
    <>
      <div className="relative rounded-xl border border-border/60 bg-muted/10 overflow-hidden" style={{ height: 320 }}>
        <ForceGraph current={current} related={related} backlinks={backlinks} suggested={suggested} />
        <button type="button" onClick={() => setModalOpen(true)}
          className="absolute top-2 right-2 rounded-lg border border-border/50 bg-background/80 backdrop-blur-sm p-1.5 text-muted-foreground hover:text-foreground transition-colors"
          title="Expandir gráfica"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="w-[95vw] max-w-4xl p-0 gap-0 overflow-hidden" style={{ height: "82vh" }}>
          <DialogTitle className="sr-only">Gráfica — {current.title}</DialogTitle>
          <div className="px-4 pt-4 pb-2 border-b border-border/40">
            <p className="text-sm font-semibold">{current.id} — {trunc(current.title, 50)}</p>
            <p className="text-xs text-muted-foreground">{all} conexiones · arrastra nodos · rueda=zoom · hover=etiqueta · clic=navegar</p>
          </div>
          <div style={{ height: "calc(82vh - 56px)" }}>
            <ForceGraph current={current} related={related} backlinks={backlinks} suggested={suggested} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Maximize2 } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
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

const EDGE_STYLE: Record<string, { stroke: string; dash?: string; opacity: number }> = {
  related:  { stroke: "#94a3b8", opacity: 0.55 },
  backlink: { stroke: "#3b82f6", opacity: 0.65 },
  suggested:{ stroke: "#f59e0b", dash: "4 3", opacity: 0.55 },
};

type RelType = "related" | "backlink" | "suggested";
interface NodeEntry { proc: ProcedureMeta; type: RelType; angle: number }
interface ViewBox { x: number; y: number; w: number; h: number }

function sectionColor(section: string) { return SECTION_COLORS[section] ?? SECTION_COLORS.General; }
function truncate(s: string, max: number) { return s.length > max ? s.slice(0, max - 1) + "…" : s; }

interface GraphProps {
  current: ProcedureMeta;
  related: ProcedureMeta[];
  backlinks: ProcedureMeta[];
  suggested: ProcedureMeta[];
  ringRadius?: number;
  centerR?: number;
  nodeR?: number;
}

function SVGGraph({ current, related, backlinks, suggested, ringRadius = 200, centerR = 55, nodeR = 42 }: GraphProps) {
  const router = useRouter();
  const svgRef = useRef<SVGSVGElement>(null);
  const BASE_W = (ringRadius + nodeR + 24) * 2;
  const BASE_H = (ringRadius + nodeR + 24) * 2;
  const [vb, setVb] = useState<ViewBox>({ x: -BASE_W / 2, y: -BASE_H / 2, w: BASE_W, h: BASE_H });

  const nodes: NodeEntry[] = [];
  const seen = new Set([current.id]);
  const addNodes = (procs: ProcedureMeta[], type: RelType) => {
    for (const p of procs) if (!seen.has(p.id)) { seen.add(p.id); nodes.push({ proc: p, type, angle: 0 }); }
  };
  addNodes(related, "related");
  addNodes(backlinks, "backlink");
  addNodes(suggested, "suggested");
  const n = nodes.length;
  nodes.forEach((node, i) => { node.angle = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(n, 1); });

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 1.18 : 1 / 1.18;
      setVb((v) => ({
        x: v.x + v.w * (factor - 1) / 2,
        y: v.y + v.h * (factor - 1) / 2,
        w: Math.min(BASE_W * 4, Math.max(BASE_W * 0.25, v.w * factor)),
        h: Math.min(BASE_H * 4, Math.max(BASE_H * 0.25, v.h * factor)),
      }));
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [BASE_W, BASE_H]);

  const dragging = useRef(false);
  const dragOrigin = useRef({ cx: 0, cy: 0, vx: 0, vy: 0 });
  const dragDelta = useRef({ dx: 0, dy: 0 });

  const onPointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    dragging.current = true;
    dragDelta.current = { dx: 0, dy: 0 };
    dragOrigin.current = { cx: e.clientX, cy: e.clientY, vx: vb.x, vy: vb.y };
    (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
  }, [vb.x, vb.y]);

  const onPointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragging.current) return;
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const scaleX = vb.w / rect.width;
    const scaleY = vb.h / rect.height;
    const dx = e.clientX - dragOrigin.current.cx;
    const dy = e.clientY - dragOrigin.current.cy;
    dragDelta.current = { dx, dy };
    setVb((v) => ({ ...v, x: dragOrigin.current.vx - dx * scaleX, y: dragOrigin.current.vy - dy * scaleY }));
  }, [vb.w, vb.h]);

  const onPointerUp = useCallback(() => { dragging.current = false; }, []);

  const handleNodeClick = useCallback((slug: string) => {
    const { dx, dy } = dragDelta.current;
    if (Math.abs(dx) < 6 && Math.abs(dy) < 6) router.push(`/manual/${slug}`);
  }, [router]);

  const centerColor = sectionColor(current.section);

  return (
    <svg ref={svgRef} viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} width="100%" height="100%"
      className="cursor-grab active:cursor-grabbing touch-none select-none"
      onPointerDown={onPointerDown} onPointerMove={onPointerMove}
      onPointerUp={onPointerUp} onPointerLeave={onPointerUp}
    >
      {nodes.map((node) => {
        const x = Math.cos(node.angle) * ringRadius;
        const y = Math.sin(node.angle) * ringRadius;
        const e = EDGE_STYLE[node.type];
        return <line key={`e-${node.proc.id}`} x1={0} y1={0} x2={x} y2={y} stroke={e.stroke} strokeWidth={1.5} strokeDasharray={e.dash} opacity={e.opacity} />;
      })}
      {nodes.map((node) => {
        const x = Math.cos(node.angle) * ringRadius;
        const y = Math.sin(node.angle) * ringRadius;
        const color = sectionColor(node.proc.section);
        const e = EDGE_STYLE[node.type];
        return (
          <g key={node.proc.id} transform={`translate(${x},${y})`} onClick={() => handleNodeClick(node.proc.slug)} style={{ cursor: "pointer" }}>
            <circle r={nodeR} fill={`${color}1a`} stroke={e.stroke} strokeWidth={node.type === "related" ? 1.5 : 2} strokeDasharray={node.type === "suggested" ? "4 3" : undefined} />
            <text textAnchor="middle" dy="-5" fontSize={10} fontWeight="700" fill={color}>{node.proc.id}</text>
            <text textAnchor="middle" dy="9" fontSize={8.5} fill="currentColor" opacity={0.75}>{truncate(node.proc.title, 20)}</text>
          </g>
        );
      })}
      <g>
        <circle r={centerR} fill={centerColor} opacity={0.9} />
        <text textAnchor="middle" dy="-10" fontSize={11} fontWeight="800" fill="white">{current.id}</text>
        <text textAnchor="middle" dy="6" fontSize={8.5} fill="white" opacity={0.9}>{truncate(current.title, 22)}</text>
        <text textAnchor="middle" dy="18" fontSize={8} fill="white" opacity={0.6}>{current.section}</text>
      </g>
      {n > 0 && (
        <g transform={`translate(${vb.x + 10},${vb.y + 12})`}>
          {(["related","backlink","suggested"] as RelType[]).map((type, i) => {
            const e = EDGE_STYLE[type];
            const labels: Record<RelType,string> = { related: "Relacionado", backlink: "Cita este", suggested: "Sugerido" };
            return (
              <g key={type} transform={`translate(0,${i * 14})`}>
                <line x1={0} y1={5} x2={14} y2={5} stroke={e.stroke} strokeWidth={1.5} strokeDasharray={e.dash} opacity={0.8} />
                <text x={18} y={9} fontSize={9} fill="currentColor" opacity={0.6}>{labels[type]}</text>
              </g>
            );
          })}
        </g>
      )}
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
      <div className="relative rounded-xl border border-border/60 bg-muted/10 overflow-hidden" style={{ height: 340 }}>
        <SVGGraph current={current} related={related} backlinks={backlinks} suggested={suggested} ringRadius={155} centerR={48} nodeR={38} />
        <button type="button" onClick={() => setModalOpen(true)}
          className="absolute top-2 right-2 rounded-lg border border-border/50 bg-background/80 backdrop-blur-sm p-1.5 text-muted-foreground hover:text-foreground transition-colors"
          title="Expandir gráfica"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="w-[95vw] max-w-4xl p-0 gap-0 overflow-hidden" style={{ height: "82vh" }}>
          <DialogTitle className="sr-only">Gráfica de conexiones — {current.title}</DialogTitle>
          <div className="px-4 pt-4 pb-2 border-b border-border/40">
            <p className="text-sm font-semibold">{current.id} — {truncate(current.title, 50)}</p>
            <p className="text-xs text-muted-foreground">{all} conexiones · arrastra · rueda=zoom · clic=navegar</p>
          </div>
          <div style={{ height: "calc(82vh - 56px)" }}>
            <SVGGraph current={current} related={related} backlinks={backlinks} suggested={suggested} ringRadius={220} centerR={58} nodeR={50} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

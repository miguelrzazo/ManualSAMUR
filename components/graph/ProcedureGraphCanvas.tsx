"use client";

/**
 * Grafo de fuerzas estilo Obsidian sobre <canvas>.
 *
 * Se carga solo mediante `next/dynamic` (ver GraphLoader), así que d3-force y este
 * módulo van en su propio chunk y no pesan en ninguna página hasta que el usuario
 * abre un grafo. Todo el estado interactivo (posiciones, zoom, hover) vive en refs
 * y se pinta en canvas: con ~230 nodos, re-renderizar React en cada tick sería caro.
 */

import { useEffect, useRef } from "react";
import { useTheme } from "next-themes";
import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import { buildAdjacency, type ProcedureGraph, type ProcedureGraphNode } from "@/lib/procedure-graph";
import { sectionColor } from "./graph-data";

export interface GraphController {
  zoomBy(factor: number): void;
  fit(): void;
  focusNode(id: string): void;
  clearSelection(): void;
}

export interface ProcedureGraphCanvasProps {
  graph: ProcedureGraph;
  /** "local": centro fijo, etiquetas siempre visibles y nodos más separados. */
  variant?: "global" | "local";
  hiddenSections?: ReadonlySet<string>;
  /** Resultados de búsqueda: se resaltan y el resto se atenúa. */
  matches?: ReadonlySet<string>;
  /** Nodo destacado (el procedimiento actual o `?foco=`). */
  focusId?: string | null;
  onOpenNode: (node: ProcedureGraphNode) => void;
  onSelectNode?: (node: ProcedureGraphNode | null) => void;
  onController?: (controller: GraphController | null) => void;
  ariaLabel: string;
  className?: string;
}

interface SimNode extends SimulationNodeDatum {
  data: ProcedureGraphNode;
  degree: number;
  r: number;
}

type SimLink = SimulationLinkDatum<SimNode> & { source: SimNode; target: SimNode };

interface Live {
  hiddenSections: ReadonlySet<string>;
  matches: ReadonlySet<string>;
  focusId: string | null;
  onOpenNode: (node: ProcedureGraphNode) => void;
  onSelectNode?: (node: ProcedureGraphNode | null) => void;
}

interface Palette {
  foreground: string;
  background: string;
  muted: string;
  font: string;
}

const EMPTY: ReadonlySet<string> = new Set();
const MIN_ZOOM = 0.15;
const MAX_ZOOM = 6;

function readPalette(el: HTMLElement): Palette {
  const style = getComputedStyle(el);
  const get = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    foreground: get("--foreground", "#111"),
    background: get("--background", "#fff"),
    muted: get("--muted-foreground", "#888"),
    font: style.fontFamily || "system-ui, sans-serif",
  };
}

function truncate(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

export default function ProcedureGraphCanvas({
  graph,
  variant = "global",
  hiddenSections = EMPTY,
  matches = EMPTY,
  focusId = null,
  onOpenNode,
  onSelectNode,
  onController,
  ariaLabel,
  className,
}: ProcedureGraphCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef<Live>({ hiddenSections, matches, focusId, onOpenNode, onSelectNode });
  const paletteRef = useRef<Palette | null>(null);
  const redrawRef = useRef<() => void>(() => {});
  const controllerCallbackRef = useRef(onController);
  const { resolvedTheme } = useTheme();

  // Props que cambian sin rehacer la simulación: se copian a un ref y se repinta.
  useEffect(() => {
    liveRef.current = { hiddenSections, matches, focusId, onOpenNode, onSelectNode };
    redrawRef.current();
  }, [hiddenSections, matches, focusId, onOpenNode, onSelectNode]);

  useEffect(() => {
    controllerCallbackRef.current = onController;
  }, [onController]);

  // Los colores salen de las variables CSS del tema: se releen al cambiar de tema.
  useEffect(() => {
    if (!canvasRef.current) return;
    paletteRef.current = readPalette(canvasRef.current);
    redrawRef.current();
  }, [resolvedTheme]);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!container || !canvas || !ctx) return;

    const local = variant === "local";
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    paletteRef.current ??= readPalette(canvas);

    // ── Modelo ───────────────────────────────────────────────────────────────
    const adjacency = buildAdjacency(graph);
    const initialFocus = liveRef.current.focusId;
    const nodes: SimNode[] = graph.nodes.map((data, index) => {
      const degree = adjacency.get(data.id)?.size ?? 0;
      // Semilla determinista en espiral: el layout no "salta" entre aperturas.
      const angle = index * 2.399963;
      const radius = 12 * Math.sqrt(index + 1);
      return {
        data,
        degree,
        r: local && data.id === initialFocus ? 9 : Math.min(3.5 + Math.sqrt(degree) * 1.7, 12),
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
      };
    });
    const byId = new Map(nodes.map((node) => [node.data.id, node]));
    const links: SimLink[] = graph.edges.flatMap((edge) => {
      const source = byId.get(edge.source);
      const target = byId.get(edge.target);
      return source && target ? [{ source, target }] : [];
    });

    if (local) {
      const center = byId.get(initialFocus ?? "");
      if (center) {
        center.fx = 0;
        center.fy = 0;
      }
    }

    const simulation: Simulation<SimNode, SimLink> = forceSimulation(nodes)
      .force("link", forceLink<SimNode, SimLink>(links).distance(local ? 120 : 38).strength(local ? 0.5 : 0.4))
      .force("charge", forceManyBody<SimNode>().strength(local ? -420 : -55).distanceMax(local ? 600 : 320))
      .force("x", forceX<SimNode>(0).strength(local ? 0.03 : 0.07))
      .force("y", forceY<SimNode>(0).strength(local ? 0.03 : 0.07))
      .force("collide", forceCollide<SimNode>().radius((node) => node.r + 3))
      .stop();

    // Se precalcula casi todo el layout antes del primer pintado; con movimiento
    // reducido se calcula entero y la simulación no vuelve a animarse.
    simulation.tick(reduceMotion ? 320 : 220);

    // ── Vista ────────────────────────────────────────────────────────────────
    const size = { width: 0, height: 0, dpr: 1 };
    const view = { x: 0, y: 0, k: 1 };
    let hoverId: string | null = null;
    let selectedId: string | null = null;
    let frame = 0;
    let tween = 0;
    let hasSized = false;

    const isVisible = (node: SimNode) => !liveRef.current.hiddenSections.has(node.data.section);

    function draw() {
      frame = 0;
      const palette = paletteRef.current;
      if (!palette || !ctx || !size.width) return;
      const { hiddenSections: hidden, matches: found, focusId: focus } = liveRef.current;
      const { k } = view;

      ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
      ctx.clearRect(0, 0, size.width, size.height);
      ctx.translate(view.x, view.y);
      ctx.scale(k, k);

      const active = hoverId ?? selectedId;
      const activeNeighbours = active ? adjacency.get(active) : undefined;
      const searching = found.size > 0;
      const lit = (id: string) =>
        active ? id === active || Boolean(activeNeighbours?.has(id)) : searching ? found.has(id) : true;
      const shown = (node: SimNode) => !hidden.has(node.data.section);

      // Aristas: primero las atenuadas en un solo trazo, luego las resaltadas.
      ctx.lineCap = "round";
      ctx.strokeStyle = palette.muted;
      ctx.lineWidth = 1 / k;
      ctx.globalAlpha = active || searching ? 0.1 : local ? 0.55 : 0.32;
      ctx.beginPath();
      const highlighted: SimLink[] = [];
      for (const link of links) {
        if (!shown(link.source) || !shown(link.target)) continue;
        if (active && (link.source.data.id === active || link.target.data.id === active)) {
          highlighted.push(link);
          continue;
        }
        ctx.moveTo(link.source.x!, link.source.y!);
        ctx.lineTo(link.target.x!, link.target.y!);
      }
      ctx.stroke();
      if (highlighted.length && active) {
        const activeNode = byId.get(active);
        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = activeNode ? sectionColor(activeNode.data.section) : palette.foreground;
        ctx.lineWidth = 1.8 / k;
        ctx.beginPath();
        for (const link of highlighted) {
          ctx.moveTo(link.source.x!, link.source.y!);
          ctx.lineTo(link.target.x!, link.target.y!);
        }
        ctx.stroke();
      }

      // Nodos.
      for (const node of nodes) {
        if (!shown(node)) continue;
        const id = node.data.id;
        ctx.globalAlpha = lit(id) ? 1 : 0.16;
        ctx.fillStyle = sectionColor(node.data.section);
        ctx.beginPath();
        ctx.arc(node.x!, node.y!, node.r, 0, Math.PI * 2);
        ctx.fill();
        const ringed = id === focus || id === active || (searching && found.has(id));
        if (ringed) {
          ctx.globalAlpha = 1;
          ctx.strokeStyle = palette.foreground;
          ctx.lineWidth = 1.6 / k;
          ctx.beginPath();
          ctx.arc(node.x!, node.y!, node.r + 3 / k, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // Etiquetas: al acercar el zoom, en el grafo local, o para lo resaltado.
      const fontSize = 12 / k;
      ctx.font = `500 ${fontSize}px ${palette.font}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.lineJoin = "round";
      const zoomedIn = k >= 1.7;
      const labelled: SimNode[] = [];
      for (const node of nodes) {
        if (!shown(node)) continue;
        const id = node.data.id;
        const important =
          id === active || id === focus || Boolean(active && activeNeighbours?.has(id)) || (searching && found.has(id) && found.size <= 40);
        // Con algo resaltado, las etiquetas atenuadas solo estorban: se omiten.
        const dimmed = (active || searching) && !lit(id);
        if (important || ((local || zoomedIn) && !dimmed)) labelled.push(node);
      }
      // Lo atenuado primero para que lo resaltado quede encima.
      labelled.sort((a, b) => Number(lit(a.data.id)) - Number(lit(b.data.id)));
      for (const node of labelled) {
        const id = node.data.id;
        // Sin zoom, los vecinos y resultados muestran solo el número para no
        // solaparse; el nodo activo/foco siempre lleva el título.
        // En el grafo local estrecho (móvil) los vecinos llevan solo el número.
        const full = (local && size.width >= 640) || zoomedIn || id === active || id === focus || (searching && !active && found.size <= 6);
        const label = full ? `${id} · ${truncate(node.data.title, id === active || id === focus ? 40 : local ? 22 : 28)}` : id;
        const y = node.y! + node.r + 3 / k;
        ctx.globalAlpha = lit(id) ? 1 : 0.3;
        ctx.strokeStyle = palette.background;
        ctx.lineWidth = 3.5 / k;
        ctx.strokeText(label, node.x!, y);
        ctx.fillStyle = palette.foreground;
        ctx.fillText(label, node.x!, y);
      }
      ctx.globalAlpha = 1;
    }

    function requestDraw() {
      if (!frame) frame = requestAnimationFrame(draw);
    }
    redrawRef.current = requestDraw;
    simulation.on("tick", requestDraw);

    function visibleBounds() {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const node of nodes) {
        if (!isVisible(node)) continue;
        minX = Math.min(minX, node.x! - node.r);
        minY = Math.min(minY, node.y! - node.r);
        maxX = Math.max(maxX, node.x! + node.r);
        maxY = Math.max(maxY, node.y! + node.r);
      }
      return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
    }

    function animateTo(target: { x: number; y: number; k: number }) {
      cancelAnimationFrame(tween);
      if (reduceMotion) {
        Object.assign(view, target);
        requestDraw();
        return;
      }
      const from = { ...view };
      const start = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / 320);
        const e = 1 - Math.pow(1 - t, 3);
        view.x = from.x + (target.x - from.x) * e;
        view.y = from.y + (target.y - from.y) * e;
        view.k = from.k + (target.k - from.k) * e;
        draw();
        if (t < 1) tween = requestAnimationFrame(step);
      };
      tween = requestAnimationFrame(step);
    }

    function fitTarget() {
      const bounds = visibleBounds();
      if (!bounds || !size.width) return { ...view };
      const pad = local ? 40 : 32;
      const w = bounds.maxX - bounds.minX || 1;
      const h = bounds.maxY - bounds.minY || 1;
      const k = Math.max(MIN_ZOOM, Math.min(local ? 1.6 : 2.2, Math.min((size.width - pad * 2) / w, (size.height - pad * 2) / h)));
      return {
        k,
        x: size.width / 2 - ((bounds.minX + bounds.maxX) / 2) * k,
        y: size.height / 2 - ((bounds.minY + bounds.maxY) / 2) * k,
      };
    }

    function zoomAt(sx: number, sy: number, factor: number) {
      const k = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, view.k * factor));
      const wx = (sx - view.x) / view.k;
      const wy = (sy - view.y) / view.k;
      view.k = k;
      view.x = sx - wx * k;
      view.y = sy - wy * k;
      requestDraw();
    }

    function select(id: string | null) {
      if (selectedId === id) return;
      selectedId = id;
      liveRef.current.onSelectNode?.(id ? byId.get(id)?.data ?? null : null);
      requestDraw();
    }

    const controller: GraphController = {
      zoomBy(factor) {
        cancelAnimationFrame(tween);
        zoomAt(size.width / 2, size.height / 2, factor);
      },
      fit() {
        animateTo(fitTarget());
      },
      focusNode(id) {
        const node = byId.get(id);
        if (!node) return;
        select(id);
        const k = Math.max(view.k, local ? 1.2 : 1.9);
        animateTo({ k, x: size.width / 2 - node.x! * k, y: size.height / 2 - node.y! * k });
      },
      clearSelection() {
        select(null);
      },
    };
    controllerCallbackRef.current?.(controller);

    // ── Tamaño ───────────────────────────────────────────────────────────────
    const resize = () => {
      const rect = container.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const prevW = size.width;
      const prevH = size.height;
      size.width = rect.width;
      size.height = rect.height;
      size.dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(rect.width * size.dpr);
      canvas.height = Math.round(rect.height * size.dpr);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      if (!hasSized) {
        hasSized = true;
        Object.assign(view, fitTarget());
        const focus = liveRef.current.focusId;
        if (focus && !local && byId.has(focus)) controller.focusNode(focus);
      } else {
        view.x += (rect.width - prevW) / 2;
        view.y += (rect.height - prevH) / 2;
      }
      draw();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();

    // El layout ya está asentado: la simulación solo se reanima al arrastrar un
    // nodo, para que nada se mueva bajo el puntero mientras se lee o se pulsa.

    // ── Puntero: arrastrar nodos, desplazar, pellizcar y hover ───────────────
    const pointers = new Map<number, { x: number; y: number }>();
    let gesture:
      | { kind: "none" }
      | { kind: "single"; startX: number; startY: number; lastX: number; lastY: number; node: SimNode | null; moved: boolean; pointerType: string }
      | { kind: "pinch"; distance: number; k: number; wx: number; wy: number } = { kind: "none" };

    const localPoint = (event: PointerEvent | WheelEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };

    function hitTest(sx: number, sy: number, slop: number): SimNode | null {
      const wx = (sx - view.x) / view.k;
      const wy = (sy - view.y) / view.k;
      let best: SimNode | null = null;
      let bestDistance = Infinity;
      for (const node of nodes) {
        if (!isVisible(node)) continue;
        const distance = Math.hypot(node.x! - wx, node.y! - wy);
        if (distance <= node.r + slop / view.k && distance < bestDistance) {
          best = node;
          bestDistance = distance;
        }
      }
      return best;
    }

    function releaseDrag() {
      if (gesture.kind === "single" && gesture.node && gesture.moved) {
        const node = gesture.node;
        const pinned = local && node.data.id === liveRef.current.focusId;
        if (!pinned) {
          node.fx = null;
          node.fy = null;
        }
        if (!reduceMotion) simulation.alphaTarget(0);
      }
    }

    function startPinch() {
      const [a, b] = [...pointers.values()];
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      gesture = {
        kind: "pinch",
        distance: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        k: view.k,
        wx: (mx - view.x) / view.k,
        wy: (my - view.y) / view.k,
      };
    }

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      cancelAnimationFrame(tween);
      canvas.setPointerCapture(event.pointerId);
      const point = localPoint(event);
      pointers.set(event.pointerId, point);
      if (pointers.size === 2) {
        releaseDrag();
        startPinch();
        return;
      }
      if (pointers.size > 2) return;
      const node = hitTest(point.x, point.y, event.pointerType === "mouse" ? 4 : 14);
      gesture = { kind: "single", startX: point.x, startY: point.y, lastX: point.x, lastY: point.y, node, moved: false, pointerType: event.pointerType };
      canvas.style.cursor = "grabbing";
    };

    const onPointerMove = (event: PointerEvent) => {
      const point = localPoint(event);
      if (!pointers.has(event.pointerId)) {
        // Hover (solo ratón; en táctil el primer toque selecciona).
        if (event.pointerType !== "mouse") return;
        const node = hitTest(point.x, point.y, 4);
        const id = node?.data.id ?? null;
        canvas.style.cursor = node ? "pointer" : "grab";
        if (id !== hoverId) {
          hoverId = id;
          requestDraw();
        }
        return;
      }
      pointers.set(event.pointerId, point);

      if (gesture.kind === "pinch" && pointers.size >= 2) {
        const [a, b] = [...pointers.values()];
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        const distance = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        const k = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, gesture.k * (distance / gesture.distance)));
        view.k = k;
        view.x = mx - gesture.wx * k;
        view.y = my - gesture.wy * k;
        requestDraw();
        return;
      }
      if (gesture.kind !== "single") return;

      const dx = point.x - gesture.lastX;
      const dy = point.y - gesture.lastY;
      gesture.lastX = point.x;
      gesture.lastY = point.y;
      if (!gesture.moved && Math.hypot(point.x - gesture.startX, point.y - gesture.startY) < 5) return;
      const firstMove = !gesture.moved;
      gesture.moved = true;

      if (gesture.node) {
        const node = gesture.node;
        const wx = (point.x - view.x) / view.k;
        const wy = (point.y - view.y) / view.k;
        node.fx = wx;
        node.fy = wy;
        if (reduceMotion) {
          node.x = wx;
          node.y = wy;
          requestDraw();
        } else if (firstMove) {
          simulation.alphaTarget(0.25).restart();
        }
        if (hoverId !== node.data.id) {
          hoverId = node.data.id;
          requestDraw();
        }
      } else {
        view.x += dx;
        view.y += dy;
        requestDraw();
      }
    };

    const onPointerUp = (event: PointerEvent) => {
      if (!pointers.has(event.pointerId)) return;
      pointers.delete(event.pointerId);
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);

      if (gesture.kind === "pinch") {
        // Al levantar un dedo del pellizco, el que queda sigue desplazando sin saltos.
        const remaining = [...pointers.values()][0];
        gesture = remaining
          ? { kind: "single", startX: remaining.x, startY: remaining.y, lastX: remaining.x, lastY: remaining.y, node: null, moved: true, pointerType: "touch" }
          : { kind: "none" };
        return;
      }
      if (gesture.kind !== "single") return;
      const current = gesture;
      releaseDrag();
      gesture = { kind: "none" };
      canvas.style.cursor = current.node && event.pointerType === "mouse" ? "pointer" : "grab";
      if (event.type === "pointercancel" || current.moved) {
        if (current.pointerType !== "mouse" && hoverId) {
          hoverId = null;
          requestDraw();
        }
        return;
      }

      // Toque o clic sin arrastre.
      if (!current.node) {
        select(null);
        return;
      }
      const id = current.node.data.id;
      if (current.pointerType === "mouse" || selectedId === id) {
        liveRef.current.onOpenNode(current.node.data);
      } else {
        // Táctil: el primer toque resalta vecinos y muestra la ficha; el segundo abre.
        select(id);
      }
    };

    const onPointerLeave = (event: PointerEvent) => {
      if (event.pointerType === "mouse" && !pointers.size && hoverId) {
        hoverId = null;
        canvas.style.cursor = "grab";
        requestDraw();
      }
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      cancelAnimationFrame(tween);
      const point = localPoint(event);
      const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
      zoomAt(point.x, point.y, Math.exp(-delta * (event.ctrlKey ? 0.01 : 0.0018)));
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const step = 60;
      switch (event.key) {
        case "+":
        case "=":
          controller.zoomBy(1.25);
          break;
        case "-":
        case "_":
          controller.zoomBy(0.8);
          break;
        case "0":
          controller.fit();
          break;
        case "ArrowLeft":
          view.x += step;
          requestDraw();
          break;
        case "ArrowRight":
          view.x -= step;
          requestDraw();
          break;
        case "ArrowUp":
          view.y += step;
          requestDraw();
          break;
        case "ArrowDown":
          view.y -= step;
          requestDraw();
          break;
        case "Enter":
          if (selectedId) {
            const node = byId.get(selectedId);
            if (node) liveRef.current.onOpenNode(node.data);
          }
          break;
        case "Escape":
          select(null);
          break;
        default:
          return;
      }
      event.preventDefault();
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("pointerleave", onPointerLeave);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("keydown", onKeyDown);

    return () => {
      simulation.stop();
      simulation.on("tick", null);
      observer.disconnect();
      cancelAnimationFrame(frame);
      cancelAnimationFrame(tween);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("keydown", onKeyDown);
      redrawRef.current = () => {};
      controllerCallbackRef.current?.(null);
    };
  }, [graph, variant]);

  return (
    <div ref={containerRef} className={className ?? "relative h-full w-full"}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={ariaLabel}
        tabIndex={0}
        className="block h-full w-full cursor-grab touch-none select-none rounded-[inherit] outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
      />
    </div>
  );
}

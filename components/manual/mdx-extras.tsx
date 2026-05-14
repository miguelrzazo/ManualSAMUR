"use client";

import { useState, useEffect, useRef, useId } from "react";
import { AlertCircle, AlertTriangle, CheckSquare, ChevronDown, Info, Lightbulb, Pill, Square, X, ZoomIn } from "lucide-react";
import Link from "next/link";
import { useTheme } from "next-themes";
import mermaid from "mermaid";
import { buildVademecumHref } from "@/lib/vademecum-utils";

function normalizeManualAssetSrc(src: string): string {
  if (!src) return src;
  if (/^(?:https?:)?\/\//i.test(src) || src.startsWith("/")) return src;

  const stripped = src.replace(/^(?:\.\.\/|\.\/)+/, "").replace(/^\/?/, "");
  return `/${stripped}`;
}

export function KeyPoints({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-5 rounded-r-xl border border-emerald-200 border-l-4 border-l-emerald-500 bg-emerald-50/80 dark:border-emerald-800/50 dark:border-l-emerald-500 dark:bg-emerald-950/30 px-4 py-3.5 not-prose shadow-sm">
      <div className="flex items-center gap-2 mb-2.5">
        <Lightbulb className="h-4 w-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
        <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">Puntos clave</span>
      </div>
      <div className="component-prose text-sm text-emerald-900 dark:text-emerald-100">
        {children}
      </div>
    </div>
  );
}

export function Warning({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-5 rounded-r-xl border border-amber-200 border-l-4 border-l-amber-500 bg-amber-50/80 dark:border-amber-800/50 dark:border-l-amber-500 dark:bg-amber-950/30 px-4 py-3.5 not-prose shadow-sm">
      <div className="flex items-center gap-2 mb-2.5">
        <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
        <span className="text-sm font-semibold text-amber-700 dark:text-amber-300">Advertencia</span>
      </div>
      <div className="component-prose text-sm text-amber-900 dark:text-amber-100">
        {children}
      </div>
    </div>
  );
}

export function Caution({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-5 rounded-r-xl border border-red-200 border-l-4 border-l-red-500 bg-red-50/80 dark:border-red-800/50 dark:border-l-red-500 dark:bg-red-950/30 px-4 py-3.5 not-prose shadow-sm">
      <div className="flex items-center gap-2 mb-2.5">
        <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 flex-shrink-0" />
        <span className="text-sm font-semibold text-red-700 dark:text-red-300">Precaución</span>
      </div>
      <div className="component-prose text-sm text-red-900 dark:text-red-100">
        {children}
      </div>
    </div>
  );
}

export function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-5 rounded-r-xl border border-blue-200 border-l-4 border-l-blue-500 bg-blue-50/80 dark:border-blue-800/50 dark:border-l-blue-500 dark:bg-blue-950/30 px-4 py-3.5 not-prose shadow-sm">
      <div className="flex items-center gap-2 mb-2.5">
        <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
        <span className="text-sm font-semibold text-blue-700 dark:text-blue-300">Nota</span>
      </div>
      <div className="component-prose text-sm text-blue-900 dark:text-blue-100">
        {children}
      </div>
    </div>
  );
}

export function Step({ number, children }: { number: number; children: React.ReactNode }) {
  return (
    <div className="flex gap-4 py-3 border-b border-border/40 last:border-0">
      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center mt-0.5">
        {number}
      </div>
      <div className="component-prose text-sm flex-1 pt-0.5">
        {children}
      </div>
    </div>
  );
}

export function Steps({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-6 rounded-xl border border-border/60 bg-card/60 px-5 py-2 not-prose">
      {children}
    </div>
  );
}

export function Checklist({ items = [] }: { items?: string[] }) {
  const [checked, setChecked] = useState<boolean[]>(() => items.map(() => false));

  function toggle(i: number) {
    setChecked((prev) => prev.map((v, idx) => (idx === i ? !v : v)));
  }

  const doneCount = checked.filter(Boolean).length;

  return (
    <div className="my-6 rounded-xl border border-border bg-card/60 px-5 py-4 not-prose">
      <div className="flex items-center gap-2 mb-3">
        <CheckSquare className="h-4 w-4 text-primary flex-shrink-0" />
        <span className="text-sm font-semibold">Lista de verificación</span>
        <span className="text-xs text-muted-foreground ml-auto tabular-nums">
          {doneCount}/{items.length}
        </span>
      </div>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li
            key={i}
            className="flex items-start gap-3 cursor-pointer group select-none"
            onClick={() => toggle(i)}
          >
            {checked[i] ? (
              <CheckSquare className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
            ) : (
              <Square className="h-4 w-4 text-muted-foreground/60 flex-shrink-0 mt-0.5 group-hover:text-muted-foreground transition-colors" />
            )}
            <span className={`text-sm leading-relaxed transition-colors ${checked[i] ? "line-through text-muted-foreground" : ""}`}>
              {item}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Diagram({ src, alt, caption }: { src: string; alt?: string; caption?: string }) {
  const normalizedSrc = normalizeManualAssetSrc(src);

  return (
    <figure className="my-8 not-prose">
      <div className="rounded-xl border border-border/60 bg-muted/20 overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={normalizedSrc} alt={alt ?? "Diagrama"} className="w-full h-auto block mx-auto" />
      </div>
      {caption && (
        <figcaption className="mt-2 text-center text-xs text-muted-foreground italic">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

export function Collapsible({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details
      className="my-6 rounded-xl border border-border/60 bg-card/60 not-prose group"
      {...(defaultOpen ? { open: true } : {})}
    >
      <summary className="flex items-center justify-between px-5 py-3 cursor-pointer list-none select-none hover:bg-muted/30 rounded-xl transition-colors">
        <span className="text-sm font-semibold">{title}</span>
        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-open:rotate-180" />
      </summary>
      <div className="component-prose px-5 pb-4 pt-1 text-sm">
        {children}
      </div>
    </details>
  );
}

export function MermaidDiagram({ chart, title }: { chart: string; title?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const uid = useId().replace(/[^a-z0-9]/gi, "x");
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: resolvedTheme === "dark" ? "dark" : "default",
      securityLevel: "loose",
    });

    mermaid.render(`m${uid}`, chart).then(({ svg }) => {
      if (containerRef.current) containerRef.current.innerHTML = svg;
    }).catch(() => {
      if (containerRef.current) {
        containerRef.current.innerHTML =
          `<pre class="text-xs text-muted-foreground p-2 whitespace-pre-wrap">${chart}</pre>`;
      }
    });
  }, [chart, resolvedTheme, uid]);

  const inner = (
    <div
      ref={containerRef}
      className="overflow-x-auto w-full py-2 flex justify-center [&>svg]:max-w-full [&>svg]:h-auto"
    />
  );

  if (title) {
    return <Collapsible title={title}>{inner}</Collapsible>;
  }

  return (
    <div className="my-6 rounded-xl border border-border/60 bg-card/60 not-prose overflow-hidden">
      {inner}
    </div>
  );
}

export function DrugLink({ name }: { name: string }) {
  // Reinsert spaces lost when camelCase IDs are used as display names
  const displayName = name
    .replace(/([a-záéíóúüñ])([A-ZÁÉÍÓÚÜÑ])/g, "$1 $2")
    .replace(/([0-9])([A-ZÁÉÍÓÚÜÑ])/g, "$1 $2");
  return (
    <Link
      href={buildVademecumHref(name)}
      className="inline-flex items-center gap-0.5 text-primary font-medium hover:underline underline-offset-2"
    >
      <Pill className="h-3 w-3 opacity-50 flex-shrink-0" />
      {displayName}
    </Link>
  );
}

export function ImageWithLightbox({ src, alt }: { src: string; alt?: string }) {
  const [open, setOpen] = useState(false);
  const normalizedSrc = normalizeManualAssetSrc(src);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group relative block mx-auto my-6 cursor-zoom-in rounded-xl border border-border/60 shadow-sm overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        aria-label={alt ? `Ampliar: ${alt}` : "Ampliar imagen"}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={normalizedSrc}
          alt={alt ?? ""}
          className="block max-w-full h-auto mx-auto"
        />
        <span className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-colors duration-150">
          <span className="opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 text-white rounded-full p-1.5">
            <ZoomIn className="h-4 w-4" />
          </span>
        </span>
      </button>
      {alt && (
        <p className="text-center text-xs text-muted-foreground -mt-4 mb-6 italic">{alt}</p>
      )}

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => setOpen(false)}
        >
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="absolute top-4 right-4 text-white/80 hover:text-white bg-black/40 hover:bg-black/60 rounded-full p-2 transition-colors"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={normalizedSrc}
            alt={alt ?? ""}
            className="max-w-full max-h-[90vh] object-contain rounded-xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}

export function AlgoritmoLabel() {
  return (
    <div className="not-prose my-6 flex items-center gap-3">
      <div className="h-px flex-1 bg-border/60" />
      <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/8 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-primary">
        Algoritmo
      </span>
      <div className="h-px flex-1 bg-border/60" />
    </div>
  );
}

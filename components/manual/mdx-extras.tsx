"use client";

import { useState } from "react";
import { AlertCircle, AlertTriangle, CheckSquare, Info, Lightbulb, Square } from "lucide-react";

export function KeyPoints({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-6 rounded-xl border border-emerald-200 bg-emerald-50 dark:border-emerald-800/50 dark:bg-emerald-950/30 px-5 py-4 not-prose">
      <div className="flex items-center gap-2 mb-3">
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
    <div className="my-6 rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-800/50 dark:bg-amber-950/30 px-5 py-4 not-prose">
      <div className="flex items-center gap-2 mb-3">
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
    <div className="my-6 rounded-xl border border-red-200 bg-red-50 dark:border-red-800/50 dark:bg-red-950/30 px-5 py-4 not-prose">
      <div className="flex items-center gap-2 mb-3">
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
    <div className="my-6 rounded-xl border border-blue-200 bg-blue-50 dark:border-blue-800/50 dark:bg-blue-950/30 px-5 py-4 not-prose">
      <div className="flex items-center gap-2 mb-3">
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
  return (
    <figure className="my-8 not-prose">
      <div className="rounded-xl border border-border/60 bg-muted/20 overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt ?? "Diagrama"} className="w-full h-auto block" />
      </div>
      {caption && (
        <figcaption className="mt-2 text-center text-xs text-muted-foreground italic">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

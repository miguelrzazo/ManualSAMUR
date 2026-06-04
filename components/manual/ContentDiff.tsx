"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, GitCompareArrows, ArrowRight } from "lucide-react";

interface Props {
  changeKind: "nuevo" | "revisado" | "actualizado" | "eliminado" | "sync";
  changedAt: string;
  summary: string;
  diff?: string;
  /** When provided, the banner links to this href (for use in lists/feeds outside the procedure page). */
  procedureHref?: string;
}

const KIND_STYLES: Record<string, { badge: string; label: string }> = {
  nuevo: { badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300", label: "NUEVO" },
  actualizado: { badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300", label: "ACTUALIZADO" },
  revisado: { badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300", label: "REVISADO" },
  eliminado: { badge: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300", label: "ELIMINADO" },
  sync: { badge: "bg-muted text-muted-foreground", label: "SYNC" },
};

function formatRelativeDate(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return isoDate;
  const now = new Date();
  const days = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (days === 0) return "hoy";
  if (days === 1) return "ayer";
  if (days < 30) return `hace ${days} días`;
  return new Intl.DateTimeFormat("es", { dateStyle: "medium" }).format(date);
}

export function ContentDiff({ changeKind, changedAt, summary, diff, procedureHref }: Props) {
  const [open, setOpen] = useState(false);
  const style = KIND_STYLES[changeKind] ?? KIND_STYLES.sync;

  const header = (
    <div
      className={`flex items-center gap-2 px-3 py-2 ${diff && !procedureHref ? "cursor-pointer select-none" : ""}`}
      onClick={diff && !procedureHref ? () => setOpen((v) => !v) : undefined}
    >
      <GitCompareArrows className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide ${style.badge}`}>
        {style.label}
      </span>
      <span className="text-xs text-muted-foreground">{formatRelativeDate(changedAt)}</span>
      <span className="flex-1 truncate text-xs text-foreground/80">{summary}</span>
      {procedureHref && (
        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
      )}
      {diff && !procedureHref && (
        <ChevronDown className={`h-3 w-3 text-muted-foreground flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      )}
    </div>
  );

  return (
    <div className="mb-4 rounded-lg border border-border/60 bg-card/50 overflow-hidden text-sm" data-print-hide>
      {procedureHref ? (
        <Link href={procedureHref} className="block hover:bg-muted/30 transition-colors">
          {header}
        </Link>
      ) : header}

      {diff && open && (
        <div className="border-t border-border/60 bg-muted/20 px-4 py-3 font-mono text-xs leading-relaxed overflow-x-auto overflow-y-auto" style={{ maxHeight: "min(50vh, 400px)" }}>
          {diff.split("\n").map((line, i) => (
            <div
              key={i}
              className={`whitespace-pre px-1 rounded-sm ${
                line.startsWith("+") && !line.startsWith("+++")
                  ? "text-emerald-700 dark:text-emerald-400 bg-emerald-50/60 dark:bg-emerald-950/20"
                  : line.startsWith("-") && !line.startsWith("---")
                  ? "text-red-700 dark:text-red-400 bg-red-50/60 dark:bg-red-950/20"
                  : line.startsWith("@@")
                  ? "text-blue-600 dark:text-blue-400 font-semibold"
                  : "text-muted-foreground"
              }`}
            >
              {line || " "}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

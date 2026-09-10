"use client";

import { ArrowUpRight, Check, ChevronDown, CirclePlus, FileText, Minus, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { readableChangeKindLabel, readableChangeTitle, readableContentChange, type ReadableChangeKind } from "@/packages/manual-content/src/content-diff";

interface Props {
  changeKind: ReadableChangeKind;
  changedAt: string;
  summary: string;
  diff?: string;
  procedureHref?: string;
  defaultOpen?: boolean;
  unread?: boolean;
  categoryLabel?: string;
}

const KIND_STYLES: Record<string, { badge: string; icon: typeof Sparkles }> = {
  nuevo: { badge: "bg-emerald-50 text-emerald-700 ring-emerald-200", icon: CirclePlus },
  actualizado: { badge: "bg-blue-50 text-blue-700 ring-blue-200", icon: Sparkles },
  revisado: { badge: "bg-amber-50 text-amber-700 ring-amber-200", icon: FileText },
  eliminado: { badge: "bg-rose-50 text-rose-700 ring-rose-200", icon: Minus },
  sync: { badge: "bg-slate-100 text-slate-600 ring-slate-200", icon: FileText },
};

function formatDate(value: string): string {
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

function ChangePanel({ title, text, tone }: { title: string; text: string; tone: "before" | "after" | "removed" }) {
  const styles = tone === "before"
    ? "border-slate-200 bg-slate-50 text-slate-600"
    : tone === "removed"
      ? "border-rose-200 bg-rose-50/70 text-rose-950"
      : "border-blue-200 bg-blue-50/70 text-blue-950";
  return <div className={`max-h-64 overflow-y-auto rounded-2xl border p-4 ${styles}`}><div className="flex items-center justify-between gap-2"><p className="text-[10px] font-black uppercase tracking-[0.18em] opacity-65">{title}</p>{tone === "after" && <Check className="h-4 w-4 text-blue-700" />}</div><p className="mt-2 whitespace-pre-line text-sm leading-6">{text}</p></div>;
}

export function ContentDiff({ changeKind, changedAt, summary, diff, procedureHref, defaultOpen = false, unread = false, categoryLabel }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const style = KIND_STYLES[changeKind] ?? KIND_STYLES.sync;
  const Icon = style.icon;
  const title = readableChangeTitle(summary);
  const readable = readableContentChange(diff);
  const hasComparison = readable.before.length > 0 || readable.after.length > 0;
  const changeLabel = readableChangeKindLabel(changeKind);

  return (
    <article className={`overflow-hidden rounded-2xl border bg-card text-sm shadow-sm transition-shadow ${unread ? "border-blue-300 ring-2 ring-blue-100" : "border-border/60"}`} data-print-hide>
      <div className="flex items-start gap-3 px-4 py-4 sm:px-5">
        <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${style.badge}`}><Icon className="h-4 w-4" /></div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-[10px] font-black tracking-wide ring-1 ${style.badge}`}>{changeLabel}</span>{categoryLabel && <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-bold text-muted-foreground">{categoryLabel}</span>}<span className="text-xs text-muted-foreground">{formatDate(changedAt)}</span>{unread && <span className="text-[10px] font-black uppercase tracking-wide text-primary">Sin leer</span>}</div>
          <h3 className="mt-2 text-base font-black leading-snug text-foreground">{title}</h3>
        </div>
        {hasComparison && <button type="button" onClick={() => setOpen((value) => !value)} className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-bold text-primary transition hover:bg-primary/10" aria-expanded={open}>{open ? "Ocultar" : "Ver qué cambió"}<ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} /></button>}
      </div>

      {open && hasComparison && <div className="border-t border-border/60 px-4 py-4 sm:px-5"><p className="mb-3 text-sm leading-6 text-muted-foreground">{summary.includes(":") ? "Se ha actualizado el contenido de este procedimiento." : summary}</p><div className="grid gap-3 md:grid-cols-2">{readable.before.length > 0 && <ChangePanel title="Antes" text={readable.before.join("\n")} tone={changeKind === "eliminado" ? "removed" : "before"} />}{readable.after.length > 0 && <ChangePanel title={readable.before.length > 0 ? "Ahora" : "Se ha añadido"} text={readable.after.join("\n")} tone="after" />}</div></div>}
      {!open && !hasComparison && <p className="px-4 pb-4 pl-[4.75rem] text-sm leading-6 text-muted-foreground sm:px-5 sm:pl-[5.75rem]">{summary}</p>}
      {procedureHref && <div className="flex justify-end border-t border-border/60 px-4 py-3 sm:px-5"><Link href={procedureHref} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-bold text-primary-foreground transition hover:opacity-90">Abrir procedimiento <ArrowUpRight className="h-3.5 w-3.5" /></Link></div>}
    </article>
  );
}

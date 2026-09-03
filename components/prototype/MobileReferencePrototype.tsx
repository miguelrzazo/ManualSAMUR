"use client";

import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Bookmark,
  BookOpen,
  CaseSensitive,
  Check,
  ChevronRight,
  FileText,
  Heart,
  Home,
  LocateFixed,
  Map,
  MapPinned,
  Menu,
  PackageCheck,
  Pill,
  Radio,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { ProcedureNavMeta } from "@/lib/content";

const VARIANTS = ["A", "B", "C"] as const;
type Variant = (typeof VARIANTS)[number];
type Tab = "home" | "search" | "saved" | "map";
type CatalogItem = {
  id: string;
  title: string;
  kind: "Procedimiento" | "Fármaco" | "Código" | "Abreviatura";
  detail: string;
  tone: string;
};

const VARIANT_NAMES: Record<Variant, string> = {
  A: "Centro de mando",
  B: "Respuesta rápida",
  C: "Biblioteca adaptable",
};

const QUICK_ACTIONS = [
  { label: "Procedimientos", hint: "234 disponibles", icon: FileText, tab: "search" as Tab, query: "" },
  { label: "Vademécum", hint: "Dosis y vías", icon: Pill, tab: "search" as Tab, query: "" },
  { label: "Códigos", hint: "Radio y patología", icon: Radio, tab: "search" as Tab, query: "código" },
  { label: "Abreviaturas", hint: "Consulta rápida", icon: CaseSensitive, tab: "search" as Tab, query: "AAS" },
];

const SAMPLE_DRUGS: CatalogItem[] = [
  { id: "aspirina", title: "Ácido acetilsalicílico", kind: "Fármaco", detail: "SCA · 300 mg VO masticado", tone: "rose" },
  { id: "adenosina", title: "Adenosina", kind: "Fármaco", detail: "Antiarrítmico · IV", tone: "violet" },
];

const SAMPLE_CODES: CatalogItem[] = [
  { id: "214", title: "Código 14 · Ictus", kind: "Código", detail: "Activación código ictus", tone: "amber" },
  { id: "213", title: "Código Infarto", kind: "Código", detail: "SCA con elevación ST", tone: "amber" },
];

const SAMPLE_ABBREVIATIONS: CatalogItem[] = [
  { id: "AAS", title: "AAS", kind: "Abreviatura", detail: "Ácido acetil salicílico", tone: "sky" },
  { id: "AESP", title: "AESP", kind: "Abreviatura", detail: "Actividad eléctrica sin pulso", tone: "sky" },
];

interface Props {
  procedures: ProcedureNavMeta[];
  packageVersion: string;
}

function normalizeVariant(value: string | null): Variant {
  return VARIANTS.includes(value as Variant) ? value as Variant : "A";
}

function formatStateDate() {
  return new Intl.DateTimeFormat("es", { day: "2-digit", month: "short", year: "numeric" }).format(new Date());
}

function PrototypeSwitcher({ current, screen, query, savedCount, selected }: {
  current: Variant;
  screen: Tab;
  query: string;
  savedCount: number;
  selected: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function setVariant(next: Variant) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("variant", next);
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  function cycle(direction: -1 | 1) {
    const index = VARIANTS.indexOf(current);
    setVariant(VARIANTS[(index + direction + VARIANTS.length) % VARIANTS.length]);
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, [contenteditable='true']")) return;
      if (event.key === "ArrowLeft") cycle(-1);
      if (event.key === "ArrowRight") cycle(1);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  return (
    <div className="fixed bottom-3 left-1/2 z-[200] w-[min(calc(100%-1.5rem),24rem)] -translate-x-1/2 rounded-2xl border border-slate-700 bg-slate-950/95 p-2 text-white shadow-2xl shadow-slate-950/30 backdrop-blur-xl">
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={() => cycle(-1)} className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-300 hover:bg-white/10 hover:text-white" aria-label="Variante anterior"><ArrowLeft className="h-4 w-4" /></button>
        <div className="min-w-0 flex-1 text-center"><p className="truncate text-xs font-semibold">{current} — {VARIANT_NAMES[current]}</p><p className="truncate text-[10px] text-slate-400">← → para cambiar · solo prototipo</p></div>
        <button type="button" onClick={() => cycle(1)} className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-300 hover:bg-white/10 hover:text-white" aria-label="Variante siguiente"><ArrowRight className="h-4 w-4" /></button>
      </div>
      <div className="mt-2 grid grid-cols-5 gap-1 rounded-xl bg-white/5 px-2 py-1.5 text-[10px] text-slate-400"><span className="col-span-2 truncate">pantalla: <b className="text-slate-200">{screen}</b></span><span className="truncate">q: <b className="text-slate-200">{query || "—"}</b></span><span className="truncate">guardados: <b className="text-slate-200">{savedCount}</b></span><span className="truncate text-right">detalle: <b className="text-slate-200">{selected ? "sí" : "no"}</b></span></div>
    </div>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return <div className="flex items-center gap-2"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-500 text-white shadow-lg shadow-red-500/20"><Activity className="h-5 w-5" strokeWidth={2.5} /></div><div><p className="text-[10px] font-bold uppercase tracking-[0.22em] text-red-500">SAMUR · PC</p><p className={compact ? "text-sm font-bold" : "text-base font-bold"}>Manual de referencia</p></div></div>;
}

function SearchField({ value, onChange, placeholder = "Buscar procedimiento, fármaco o código" }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <label className="flex min-h-14 items-center gap-3 rounded-2xl border border-border/70 bg-background px-4 shadow-sm focus-within:border-red-400 focus-within:ring-4 focus-within:ring-red-500/10"><Search className="h-5 w-5 shrink-0 text-red-500" /><input value={value} onChange={(event) => onChange(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/70" placeholder={placeholder} aria-label="Buscar en el manual" />{value && <button type="button" onClick={() => onChange("")} className="rounded-lg p-1 text-muted-foreground hover:bg-muted" aria-label="Limpiar búsqueda"><X className="h-4 w-4" /></button>}</label>;
}

function PackageStatus({ version }: { version: string }) {
  return <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-3.5 text-emerald-950 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100"><div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-white"><PackageCheck className="h-4 w-4" /></div><div className="min-w-0 flex-1"><p className="text-xs font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Disponible sin conexión</p><p className="mt-0.5 text-xs opacity-75">Paquete validado · {version} · {formatStateDate()}</p></div><Check className="mt-1 h-4 w-4 shrink-0 text-emerald-600" /></div>;
}

function BottomNav({ tab, onChange }: { tab: Tab; onChange: (tab: Tab) => void }) {
  const items = [{ id: "home" as Tab, label: "Inicio", icon: Home }, { id: "search" as Tab, label: "Buscar", icon: Search }, { id: "saved" as Tab, label: "Guardados", icon: Bookmark }, { id: "map" as Tab, label: "Mapa", icon: MapPinned }];
  return <nav className="sticky bottom-0 z-20 grid grid-cols-4 border-t border-border/70 bg-background/95 px-2 pb-[env(safe-area-inset-bottom)] pt-2 backdrop-blur-xl" aria-label="Navegación principal">{items.map(({ id, label, icon: Icon }) => <button type="button" key={id} onClick={() => onChange(id)} className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-semibold transition-colors ${tab === id ? "text-red-500" : "text-muted-foreground hover:bg-muted"}`} aria-current={tab === id ? "page" : undefined}><Icon className={`h-5 w-5 ${tab === id ? "stroke-[2.5]" : ""}`} />{label}</button>)}</nav>;
}

function SectionHeading({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: string }) {
  return <div className="mb-3 flex items-end justify-between gap-3"><div>{eyebrow && <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-red-500">{eyebrow}</p>}<h2 className="text-lg font-bold tracking-tight">{title}</h2></div>{action && <button type="button" className="text-xs font-semibold text-red-500">{action}</button>}</div>;
}

function QuickActions({ onAction, horizontal = false }: { onAction: (tab: Tab, query: string) => void; horizontal?: boolean }) {
  return <div className={horizontal ? "grid grid-cols-4 gap-2" : "grid grid-cols-2 gap-2.5"}>{QUICK_ACTIONS.map(({ label, hint, icon: Icon, tab, query }) => <button type="button" key={label} onClick={() => onAction(tab, query)} className={`group flex ${horizontal ? "min-h-20 flex-col items-center justify-center text-center" : "items-center gap-3 text-left"} rounded-2xl border border-border/70 bg-card p-3.5 transition-all hover:-translate-y-0.5 hover:border-red-300 hover:shadow-md`}><span className={`flex shrink-0 items-center justify-center rounded-xl bg-red-500/10 text-red-500 ${horizontal ? "mb-2 h-9 w-9" : "h-10 w-10"}`}><Icon className="h-5 w-5" /></span><span className="min-w-0"><span className="block text-xs font-bold leading-tight">{label}</span>{!horizontal && <span className="mt-1 block text-[10px] text-muted-foreground">{hint}</span>}</span>{!horizontal && <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5" />}</button>)}</div>;
}

function ProcedureRow({ procedure, onOpen, saved, onToggleSaved, dense = false }: { procedure: ProcedureNavMeta; onOpen: () => void; saved: boolean; onToggleSaved: () => void; dense?: boolean }) {
  return <div className={`group flex items-center gap-3 ${dense ? "py-3" : "rounded-2xl border border-border/70 bg-card p-3.5"}`}><button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 font-mono text-[11px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{procedure.id}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{procedure.title}</span><span className="mt-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{procedure.section}</span></span><ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" /></button><button type="button" onClick={onToggleSaved} className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${saved ? "text-red-500" : "text-muted-foreground/50 hover:bg-muted hover:text-red-500"}`} aria-label={saved ? `Quitar ${procedure.title} de guardados` : `Guardar ${procedure.title}`} aria-pressed={saved}><Heart className={`h-4 w-4 ${saved ? "fill-current" : ""}`} /></button></div>;
}

function CatalogRow({ item, onOpen }: { item: CatalogItem; onOpen: () => void }) {
  const tones: Record<string, string> = { rose: "bg-rose-500/10 text-rose-600", violet: "bg-violet-500/10 text-violet-600", amber: "bg-amber-500/10 text-amber-600", sky: "bg-sky-500/10 text-sky-600" };
  const Icon = item.kind === "Fármaco" ? Pill : item.kind === "Código" ? Radio : CaseSensitive;
  return <button type="button" onClick={onOpen} className="flex w-full items-center gap-3 rounded-2xl border border-border/70 bg-card p-3 text-left transition-colors hover:border-red-300"><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tones[item.tone]}`}><Icon className="h-5 w-5" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{item.title}</span><span className="mt-1 block truncate text-xs text-muted-foreground">{item.detail}</span></span><ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" /></button>;
}

function MobileDetail({ title, kind, onBack, onSave, saved }: { title: string; kind: string; onBack: () => void; onSave: () => void; saved: boolean }) {
  return <div className="absolute inset-0 z-40 flex min-h-full flex-col bg-background"><header className="flex items-center gap-3 border-b border-border/70 px-4 pb-4 pt-[calc(1rem+env(safe-area-inset-top))]"><button type="button" onClick={onBack} className="flex h-10 w-10 items-center justify-center rounded-xl hover:bg-muted" aria-label="Volver"><ArrowLeft className="h-5 w-5" /></button><div className="min-w-0 flex-1"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-red-500">{kind}</p><h1 className="truncate text-base font-bold">{title}</h1></div><button type="button" onClick={onSave} className={`flex h-10 w-10 items-center justify-center rounded-xl ${saved ? "text-red-500" : "text-muted-foreground"}`} aria-label={saved ? "Quitar de guardados" : "Guardar"}><Heart className={`h-5 w-5 ${saved ? "fill-current" : ""}`} /></button></header><div className="flex-1 overflow-y-auto px-4 py-5 pb-24"><div className="mb-5 flex items-center gap-2 text-xs text-muted-foreground"><span className="rounded-full bg-red-500/10 px-2.5 py-1 font-semibold text-red-500">Contenido local</span><span>·</span><span>v2.0</span></div><div className="space-y-5"><div><p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Resumen operativo</p><p className="text-sm leading-6">Consulta rápida del procedimiento con la información disponible en el paquete offline validado.</p></div><div className="rounded-2xl border border-red-200 bg-red-50 p-4 dark:border-red-900/60 dark:bg-red-950/25"><div className="mb-2 flex items-center gap-2 text-red-700 dark:text-red-300"><ShieldCheck className="h-4 w-4" /><p className="text-xs font-bold">Referencia clínica</p></div><p className="text-sm leading-6 text-red-950/80 dark:text-red-100/80">Revisar siempre la versión oficial y el contexto asistencial antes de aplicar cualquier actuación.</p></div><div><p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Acciones</p><div className="divide-y divide-border/60 rounded-2xl border border-border/70 bg-card px-4"><button type="button" className="flex min-h-14 w-full items-center gap-3 text-left text-sm font-semibold"><FileText className="h-4 w-4 text-red-500" /> Abrir contenido completo <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground/50" /></button><button type="button" className="flex min-h-14 w-full items-center gap-3 text-left text-sm font-semibold"><BookOpen className="h-4 w-4 text-red-500" /> Ver relacionados <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground/50" /></button></div></div></div></div></div>;
}

function MapPanel() {
  return <div className="space-y-4"><div className="relative h-48 overflow-hidden rounded-3xl border border-border/70 bg-[#d9e7df] dark:bg-[#1c302a]"><div className="absolute inset-0 opacity-50" style={{ backgroundImage: "linear-gradient(30deg, transparent 47%, rgba(255,255,255,.8) 48%, transparent 50%), linear-gradient(120deg, transparent 48%, rgba(255,255,255,.8) 49%, transparent 51%)", backgroundSize: "62px 62px" }} /><div className="absolute left-[28%] top-[35%] h-3 w-3 rounded-full border-2 border-white bg-red-500 shadow-lg" /><div className="absolute left-[61%] top-[54%] h-3 w-3 rounded-full border-2 border-white bg-red-500 shadow-lg" /><div className="absolute left-[44%] top-[66%] h-3 w-3 rounded-full border-2 border-white bg-amber-500 shadow-lg" /><div className="absolute bottom-3 left-3 rounded-xl bg-background/90 px-3 py-2 text-[10px] font-semibold shadow-sm">Directorio local · Madrid</div><button type="button" className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-xl bg-background/90 shadow-sm" aria-label="Centrar mapa"><LocateFixed className="h-4 w-4" /></button></div><div className="rounded-2xl border border-amber-200 bg-amber-50 p-3.5 text-xs leading-5 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/25 dark:text-amber-100"><p className="font-bold">Directorio disponible sin conexión</p><p className="mt-1 opacity-75">La cartografía completa y el cálculo de ruta requieren conexión.</p></div><div className="space-y-2"><button type="button" className="flex min-h-14 w-full items-center gap-3 rounded-2xl border border-border/70 bg-card px-3 text-left"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-500/10 text-red-500"><MapPinned className="h-4 w-4" /></span><span className="flex-1"><b className="block text-sm">Hospital La Paz</b><span className="text-xs text-muted-foreground">Fuencarral-El Pardo · Urgencias</span></span><ChevronRight className="h-4 w-4 text-muted-foreground/50" /></button><button type="button" className="flex min-h-14 w-full items-center gap-3 rounded-2xl border border-border/70 bg-card px-3 text-left"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10 text-blue-500"><Map className="h-4 w-4" /></span><span className="flex-1"><b className="block text-sm">Base 3 · Chamartín</b><span className="text-xs text-muted-foreground">C/ Federico Salmón, 8</span></span><ChevronRight className="h-4 w-4 text-muted-foreground/50" /></button></div></div>;
}

function SharedTabScreen({ tab, query, setQuery, procedures, saved, toggleSaved, openItem, version }: { tab: Tab; query: string; setQuery: (value: string) => void; procedures: ProcedureNavMeta[]; saved: string[]; toggleSaved: (id: string) => void; openItem: (title: string, kind: string) => void; version: string }) {
  const catalog = useMemo<CatalogItem[]>(() => [...procedures.map((procedure) => ({ id: procedure.id, title: procedure.title, kind: "Procedimiento" as const, detail: procedure.section, tone: "rose" })), ...SAMPLE_DRUGS, ...SAMPLE_CODES, ...SAMPLE_ABBREVIATIONS], [procedures]);
  const filtered = catalog.filter((item) => `${item.title} ${item.detail} ${item.id}`.toLowerCase().includes(query.toLowerCase())).slice(0, 8);
  if (tab === "map") return <><SectionHeading eyebrow="Entrada local" title="Mapa" /><MapPanel /></>;
  if (tab === "saved") {
    const savedProcedures = procedures.filter((procedure) => saved.includes(procedure.id));
    return <><SectionHeading eyebrow="Tu biblioteca" title="Guardados" action="Recientes" /><div className="mb-5 flex gap-2 overflow-x-auto"><span className="rounded-full bg-red-500 px-3 py-1.5 text-xs font-bold text-white">Favoritos · {savedProcedures.length}</span><span className="rounded-full bg-muted px-3 py-1.5 text-xs font-semibold text-muted-foreground">Recientes · 4</span></div><div className="space-y-2">{savedProcedures.length ? savedProcedures.map((procedure) => <ProcedureRow key={procedure.id} procedure={procedure} onOpen={() => openItem(procedure.title, "Procedimiento")} saved={true} onToggleSaved={() => toggleSaved(procedure.id)} dense />) : <EmptyState title="Todavía no hay favoritos" body="Guarda un procedimiento desde cualquier resultado para tenerlo a mano." icon={<Heart className="h-5 w-5" />} />}</div></>;
  }
  return <><SearchField value={query} onChange={setQuery} /><div className="mt-4 flex gap-2 overflow-x-auto pb-1"><span className="rounded-full bg-red-500 px-3 py-1.5 text-xs font-bold text-white">Todo</span><span className="rounded-full bg-muted px-3 py-1.5 text-xs font-semibold text-muted-foreground">Procedimientos</span><span className="rounded-full bg-muted px-3 py-1.5 text-xs font-semibold text-muted-foreground">Fármacos</span><span className="rounded-full bg-muted px-3 py-1.5 text-xs font-semibold text-muted-foreground">Códigos</span></div><div className="mt-5 flex items-center justify-between"><p className="text-xs font-semibold text-muted-foreground">{query ? `${filtered.length} resultados locales` : "Sugerencias para empezar"}</p><button type="button" className="flex items-center gap-1 text-xs font-semibold text-red-500"><SlidersHorizontal className="h-3.5 w-3.5" /> Filtrar</button></div><div className="mt-2 space-y-2">{filtered.map((item) => item.kind === "Procedimiento" ? <ProcedureRow key={item.id} procedure={procedures.find((procedure) => procedure.id === item.id)!} onOpen={() => openItem(item.title, item.kind)} saved={saved.includes(item.id)} onToggleSaved={() => toggleSaved(item.id)} /> : <CatalogRow key={item.id} item={item} onOpen={() => openItem(item.title, item.kind)} />)}{!filtered.length && <EmptyState title="Sin coincidencias" body="Prueba con otro término o vuelve a Inicio para ver accesos rápidos." icon={<Search className="h-5 w-5" />} />}</div><div className="mt-5"><PackageStatus version={version} /></div></>;
}

function EmptyState({ title, body, icon }: { title: string; body: string; icon: ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-border p-7 text-center"><div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-muted text-muted-foreground">{icon}</div><p className="text-sm font-bold">{title}</p><p className="mx-auto mt-1 max-w-[16rem] text-xs leading-5 text-muted-foreground">{body}</p></div>;
}

type VariantContentProps = Omit<VariantProps, "variant">;

function VariantA({ tab, setTab, query, setQuery, procedures, saved, toggleSaved, openItem, version }: VariantContentProps) {
  return <div className="min-h-dvh bg-[#f8f8f7] text-slate-950 dark:bg-[#0d1015] dark:text-white"><div className="mx-auto flex min-h-dvh w-full max-w-[32rem] flex-col"><header className="bg-slate-950 px-5 pb-6 pt-[calc(1.1rem+env(safe-area-inset-top))] text-white"><div className="flex items-center justify-between"><Brand compact /><button type="button" className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10" aria-label="Ajustes"><Settings2 className="h-4 w-4" /></button></div><div className="mt-7"><p className="text-sm text-slate-400">Buenas tardes, equipo</p><h1 className="mt-1 text-2xl font-bold tracking-tight">¿Qué necesitas<br />consultar ahora?</h1></div><div className="mt-5"><SearchField value={query} onChange={(value) => { setQuery(value); setTab("search"); }} placeholder="Buscar en todo el manual" /></div></header><main className="flex-1 space-y-7 px-4 py-5 pb-6">{tab === "home" ? <><section><SectionHeading eyebrow="Accesos directos" title="Consulta por área" /><QuickActions onAction={(nextTab, nextQuery) => { setTab(nextTab); setQuery(nextQuery); }} /></section><section><SectionHeading eyebrow="Continúa donde lo dejaste" title="Últimas consultas" action="Ver todo" /><div className="space-y-2"><ProcedureRow procedure={procedures[0]} onOpen={() => openItem(procedures[0].title, "Procedimiento")} saved={saved.includes(procedures[0].id)} onToggleSaved={() => toggleSaved(procedures[0].id)} /><ProcedureRow procedure={procedures[1] ?? procedures[0]} onOpen={() => openItem((procedures[1] ?? procedures[0]).title, "Procedimiento")} saved={saved.includes((procedures[1] ?? procedures[0]).id)} onToggleSaved={() => toggleSaved((procedures[1] ?? procedures[0]).id)} /></div></section><PackageStatus version={version} /><div className="flex items-start gap-2 px-1 text-[10px] leading-4 text-muted-foreground"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>Referencia no oficial. Comprobar siempre la versión oficial y el contexto asistencial.</span></div></> : <SharedTabScreen tab={tab} query={query} setQuery={setQuery} procedures={procedures} saved={saved} toggleSaved={toggleSaved} openItem={openItem} version={version} />}</main><BottomNav tab={tab} onChange={setTab} /></div></div>;
}

function VariantB({ tab, setTab, query, setQuery, procedures, saved, toggleSaved, openItem, version }: VariantContentProps) {
  return <div className="min-h-dvh bg-[#eef2f5] text-slate-950 dark:bg-[#0b1016] dark:text-white"><div className="mx-auto flex min-h-dvh w-full max-w-[32rem] flex-col"><header className="border-b border-slate-200 bg-white px-4 pb-4 pt-[calc(1rem+env(safe-area-inset-top))] dark:border-slate-800 dark:bg-slate-950"><div className="flex items-center justify-between"><Brand compact /><button type="button" className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800" aria-label="Abrir menú"><Menu className="h-5 w-5" /></button></div>{tab === "search" || tab === "home" ? <div className="mt-5"><div className="mb-2 flex items-center justify-between"><p className="text-xs font-bold uppercase tracking-[0.16em] text-red-500">Modo respuesta</p><span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> offline listo</span></div><SearchField value={query} onChange={(value) => { setQuery(value); setTab("search"); }} placeholder="ID, síntoma, fármaco o código" /></div> : null}</header><main className="flex-1 px-4 py-4 pb-6">{tab === "home" ? <><div className="mb-5 rounded-3xl bg-red-600 p-5 text-white shadow-xl shadow-red-600/20"><div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-red-100">Acción inmediata</p><h1 className="mt-2 max-w-[15rem] text-2xl font-bold leading-tight">Accede al manual en un toque.</h1></div><Sparkles className="h-6 w-6 text-red-200" /></div><button type="button" onClick={() => setTab("search")} className="mt-5 flex min-h-12 w-full items-center justify-between rounded-2xl bg-white px-4 text-left text-sm font-bold text-red-700">Abrir búsqueda global <ArrowRight className="h-4 w-4" /></button></div><div className="mb-5 grid grid-cols-4 gap-2"><QuickActions horizontal onAction={(nextTab, nextQuery) => { setTab(nextTab); setQuery(nextQuery); }} /></div><section><SectionHeading eyebrow="Retomar" title="Actividad reciente" action="Limpiar" /><div className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white px-4 dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-950"><ProcedureRow procedure={procedures[0]} onOpen={() => openItem(procedures[0].title, "Procedimiento")} saved={saved.includes(procedures[0].id)} onToggleSaved={() => toggleSaved(procedures[0].id)} dense /><ProcedureRow procedure={procedures[2] ?? procedures[0]} onOpen={() => openItem((procedures[2] ?? procedures[0]).title, "Procedimiento")} saved={saved.includes((procedures[2] ?? procedures[0]).id)} onToggleSaved={() => toggleSaved((procedures[2] ?? procedures[0]).id)} dense /></div></section></> : <SharedTabScreen tab={tab} query={query} setQuery={setQuery} procedures={procedures} saved={saved} toggleSaved={toggleSaved} openItem={openItem} version={version} />}</main><BottomNav tab={tab} onChange={setTab} /></div></div>;
}

function VariantC({ tab, setTab, query, setQuery, procedures, saved, toggleSaved, openItem, version }: VariantContentProps) {
  const nav = [{ id: "home" as Tab, label: "Inicio", icon: Home }, { id: "search" as Tab, label: "Buscar", icon: Search }, { id: "saved" as Tab, label: "Guardados", icon: Bookmark }, { id: "map" as Tab, label: "Mapa", icon: MapPinned }];
  return <div className="min-h-dvh bg-[#fbfaf8] text-stone-950 dark:bg-[#111111] dark:text-white"><div className="mx-auto grid min-h-dvh w-full max-w-[64rem] md:grid-cols-[14rem_1fr]"><aside className="hidden border-r border-stone-200 bg-stone-100/70 p-4 dark:border-stone-800 dark:bg-stone-950 md:flex md:flex-col"><Brand compact /><p className="mb-2 mt-10 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Espacios</p><div className="space-y-1">{nav.map(({ id, label, icon: Icon }) => <button type="button" key={id} onClick={() => setTab(id)} className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-semibold ${tab === id ? "bg-white text-red-500 shadow-sm dark:bg-stone-900" : "text-muted-foreground hover:bg-white/70 dark:hover:bg-stone-900"}`}><Icon className="h-4 w-4" />{label}</button>)}</div><div className="mt-auto rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-xs dark:border-emerald-900/60 dark:bg-emerald-950/30"><p className="font-bold text-emerald-800 dark:text-emerald-300">Paquete local</p><p className="mt-1 text-emerald-700/70 dark:text-emerald-300/70">Validado · {version}</p></div></aside><div className="flex min-w-0 flex-col"><header className="border-b border-stone-200 px-4 pb-4 pt-[calc(1rem+env(safe-area-inset-top))] dark:border-stone-800 md:px-8"><div className="flex items-center justify-between"><div className="md:hidden"><Brand compact /></div><div className="hidden md:block"><p className="text-xs font-bold uppercase tracking-[0.18em] text-red-500">Biblioteca de guardia</p><h1 className="mt-1 text-2xl font-bold">Referencia SAMUR</h1></div><div className="flex items-center gap-2"><button type="button" className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/70" aria-label="Filtrar"><SlidersHorizontal className="h-4 w-4" /></button><button type="button" className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/70 md:hidden" aria-label="Abrir menú"><Menu className="h-4 w-4" /></button></div></div></header><main className="mx-auto w-full max-w-3xl flex-1 px-4 py-5 pb-6 md:px-8 md:py-8">{tab === "home" ? <><div className="mb-6 grid gap-5 md:grid-cols-[1fr_15rem] md:items-start"><div><p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-red-500">Consulta abierta</p><h2 className="max-w-xl text-3xl font-bold leading-tight tracking-tight">Todo el manual, organizado para encontrarlo.</h2><div className="mt-5"><SearchField value={query} onChange={(value) => { setQuery(value); setTab("search"); }} placeholder="Buscar en el manual" /></div></div><PackageStatus version={version} /></div><div className="mb-7"><SectionHeading eyebrow="Colecciones" title="Atajos" /><QuickActions onAction={(nextTab, nextQuery) => { setTab(nextTab); setQuery(nextQuery); }} /></div><div className="grid gap-7 md:grid-cols-2"><section><SectionHeading eyebrow="Recientes" title="Continúa" action="Ver todo" /><div className="divide-y divide-border/60">{procedures.slice(0, 3).map((procedure) => <ProcedureRow key={procedure.id} procedure={procedure} onOpen={() => openItem(procedure.title, "Procedimiento")} saved={saved.includes(procedure.id)} onToggleSaved={() => toggleSaved(procedure.id)} dense />)}</div></section><section className="rounded-3xl bg-stone-100 p-5 dark:bg-stone-900"><p className="text-xs font-bold uppercase tracking-[0.18em] text-red-500">Estado de la fuente</p><p className="mt-3 text-lg font-bold">Referencia no oficial</p><p className="mt-2 text-sm leading-6 text-muted-foreground">El paquete muestra la versión y la fecha de validación para que puedas juzgar su vigencia.</p><button type="button" className="mt-4 flex items-center gap-1 text-xs font-bold text-red-500">Ver actualizaciones <ChevronRight className="h-4 w-4" /></button></section></div></> : <SharedTabScreen tab={tab} query={query} setQuery={setQuery} procedures={procedures} saved={saved} toggleSaved={toggleSaved} openItem={openItem} version={version} />}</main><div className="md:hidden"><BottomNav tab={tab} onChange={setTab} /></div></div></div></div>;
}

interface VariantProps {
  variant: Variant;
  tab: Tab;
  setTab: (tab: Tab) => void;
  query: string;
  setQuery: (query: string) => void;
  procedures: ProcedureNavMeta[];
  saved: string[];
  toggleSaved: (id: string) => void;
  openItem: (title: string, kind: string) => void;
  version: string;
}

export function MobileReferencePrototype({ procedures, packageVersion }: Props) {
  const searchParams = useSearchParams();
  const variant = normalizeVariant(searchParams.get("variant"));
  const [tab, setTab] = useState<Tab>("home");
  const [query, setQuery] = useState("");
  const [saved, setSaved] = useState<string[]>(procedures[0] ? [procedures[0].id] : []);
  const [selected, setSelected] = useState<{ title: string; kind: string } | null>(null);

  function toggleSaved(id: string) {
    setSaved((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  }

  const variantProps: VariantContentProps = { tab, setTab, query, setQuery, procedures, saved, toggleSaved, openItem: (title, kind) => setSelected({ title, kind }), version: packageVersion };
  return <div data-mobile-prototype className="fixed inset-0 z-[100] overflow-y-auto bg-background"><div className="min-h-full">{variant === "A" && <VariantA {...variantProps} />}{variant === "B" && <VariantB {...variantProps} />}{variant === "C" && <VariantC {...variantProps} />}{selected && <MobileDetail title={selected.title} kind={selected.kind} onBack={() => setSelected(null)} onSave={() => { const procedure = procedures.find((item) => item.title === selected.title); if (procedure) toggleSaved(procedure.id); }} saved={Boolean(procedures.find((item) => item.title === selected.title && saved.includes(item.id)))} />}{process.env.NODE_ENV !== "production" && <PrototypeSwitcher current={variant} screen={tab} query={query} savedCount={saved.length} selected={selected?.title ?? null} />}</div></div>;
}

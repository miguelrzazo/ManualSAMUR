"use client";

import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  CirclePlus,
  FileText,
  History,
  Minus,
  MoveRight,
  Sparkles,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, type ReactNode } from "react";

const VARIANTS = ["A", "B", "C"] as const;
type Variant = (typeof VARIANTS)[number];

const VARIANT_NAMES: Record<Variant, string> = {
  A: "Resumen editorial",
  B: "Antes y ahora",
  C: "Actualización guiada",
};

type Change = {
  kind: "actualizado" | "nuevo" | "eliminado" | "revisado";
  label: string;
  date: string;
  title: string;
  summary: string;
  before?: string;
  after?: string;
  category?: string;
  scope?: "fragmento" | "procedimiento";
  sections?: Array<{ title: string; body: string }>;
};

const CHANGE: Change = {
  kind: "actualizado",
  label: "Contenido actualizado",
  date: "Hoy, 1 de septiembre de 2026",
  title: "Técnicas de comunicación en llamadas de emergencia",
  summary: "Se reorganizaron las recomendaciones iniciales y se aclaró cómo iniciar la llamada con el demandante.",
  before: "Consideraciones generales en el manejo de llamadas de emergencia:\nConteste al teléfono con rapidez, a ser posible antes del tercer tono.",
  after: "Consideraciones generales en el manejo de llamadas de emergencia\nConteste al teléfono con rapidez y, a ser posible, antes del tercer tono. Identifique al SAMUR al descolgar.",
};

const NEW_CHANGE: Change = {
  kind: "nuevo",
  label: "Contenido añadido",
  date: "27 de agosto de 2026",
  title: "Recomendaciones para la finalización de llamadas",
  summary: "Se ha incorporado una nueva sección con pautas para cerrar la llamada de forma clara y segura.",
  after: "Explique qué se va a hacer, despídase con amabilidad y mantenga la línea disponible por si fuera necesario contactar de nuevo.",
};

const REMOVED_CHANGE: Change = {
  kind: "eliminado",
  label: "Contenido retirado",
  date: "25 de agosto de 2026",
  title: "Referencia a un formulario antiguo",
  summary: "Se ha retirado una instrucción que ya no corresponde al circuito actual.",
  before: "Cumplimente el formulario F-12 y entréguelo en papel al finalizar la guardia.",
  category: "Procedimiento",
};

const REVIEWED_FAR_APART_CHANGE: Change = {
  kind: "revisado",
  label: "Contenido revisado",
  date: "22 de agosto de 2026",
  title: "Actuación operativa ante parada cardiorrespiratoria",
  summary: "Se revisaron dos apartados separados del procedimiento: la activación inicial y la transferencia hospitalaria.",
  before: "Activación inicial\nAvise al recurso asistencial disponible.\n\n…\n\nTransferencia hospitalaria\nConfirme el hospital de destino.",
  after: "Activación inicial\nAvise al recurso asistencial disponible y confirme el código operativo.\n\n…\n\nTransferencia hospitalaria\nConfirme el hospital de destino y comunique la evolución del paciente.",
  category: "Procedimiento",
};

const CODE_CHANGE: Change = {
  kind: "actualizado",
  label: "Código actualizado",
  date: "20 de agosto de 2026",
  title: "Código 14 · Ictus",
  summary: "Se actualizó el criterio para activar el código y se añadió una comprobación previa.",
  before: "Activar ante sospecha de ictus con hora de inicio conocida.",
  after: "Activar ante sospecha de ictus y registrar la hora de inicio o la última vez que se vio bien al paciente.",
  category: "Código",
};

const MEDICATION_CHANGE: Change = {
  kind: "revisado",
  label: "Pauta revisada",
  date: "18 de agosto de 2026",
  title: "Adrenalina",
  summary: "Se revisó la pauta de administración en adultos y se aclaró la concentración disponible.",
  before: "Adultos: 1 mg IV cada 3–5 minutos.",
  after: "Adultos: 1 mg IV cada 3–5 minutos. Usar la presentación 1 mg / 10 ml.",
  category: "Vademécum",
};

const NEW_PROCEDURE: Change = {
  kind: "nuevo",
  label: "Procedimiento añadido",
  date: "15 de agosto de 2026",
  title: "Atención inicial ante golpe de calor",
  summary: "Se incorpora un procedimiento completo para reconocer y actuar ante un golpe de calor desde la primera valoración.",
  category: "Procedimiento completo",
  scope: "procedimiento",
  sections: [
    { title: "1. Reconocer la situación", body: "Valore temperatura elevada, alteración del estado mental y exposición prolongada al calor." },
    { title: "2. Actuar de inmediato", body: "Traslade al paciente a una zona fresca, retire el exceso de ropa e inicie medidas de enfriamiento." },
    { title: "3. Coordinar la asistencia", body: "Comunique la evolución al equipo receptor y prepare el traslado según la respuesta clínica." },
  ],
};

const REMOVED_PROCEDURE: Change = {
  kind: "eliminado",
  label: "Procedimiento retirado",
  date: "12 de agosto de 2026",
  title: "Traslado diferido por saturación de recursos",
  summary: "Este procedimiento completo deja de formar parte del manual porque sus indicaciones se han integrado en el circuito operativo actualizado.",
  category: "Procedimiento completo",
  scope: "procedimiento",
  sections: [
    { title: "Cuándo aplicaba", body: "Se utilizaba cuando no había un recurso de traslado disponible de forma inmediata." },
    { title: "Medidas provisionales", body: "Indicaba mantener la observación del paciente hasta recibir instrucciones del centro coordinador." },
  ],
};

const EXAMPLE_CHANGES = [REMOVED_CHANGE, REVIEWED_FAR_APART_CHANGE, CODE_CHANGE, MEDICATION_CHANGE];

function normalizeVariant(value: string | null): Variant {
  return VARIANTS.includes(value as Variant) ? value as Variant : "A";
}

function PrototypeSwitcher({ current }: { current: Variant }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setVariant(next: Variant) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("variant", next);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
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
    <div className="fixed bottom-3 left-1/2 z-50 w-[min(calc(100%-1.5rem),25rem)] -translate-x-1/2 rounded-2xl border border-slate-700 bg-slate-950/95 p-2 text-white shadow-2xl shadow-slate-950/30 backdrop-blur-xl">
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={() => cycle(-1)} className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-300 hover:bg-white/10 hover:text-white" aria-label="Variante anterior"><ArrowLeft className="h-4 w-4" /></button>
        <div className="min-w-0 flex-1 text-center"><p className="truncate text-xs font-semibold">{current} — {VARIANT_NAMES[current]}</p><p className="truncate text-[10px] text-slate-400">← → para cambiar · solo prototipo</p></div>
        <button type="button" onClick={() => cycle(1)} className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-300 hover:bg-white/10 hover:text-white" aria-label="Variante siguiente"><ArrowRight className="h-4 w-4" /></button>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1 rounded-xl bg-white/5 px-2 py-1.5 text-[10px] text-slate-400"><span>web</span><span className="text-center">app</span><span className="text-right">{current}/3</span></div>
    </div>
  );
}

function PrototypeHeader() {
  return (
    <header className="border-b border-slate-200/80 bg-white/90 px-5 py-5 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
        <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-700 text-white shadow-lg shadow-blue-900/15"><FileText className="h-5 w-5" /></div><div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-700">Manual SAMUR · PC</p><p className="text-sm font-bold text-slate-950">Cambios del manual</p></div></div>
        <div className="hidden items-center gap-2 text-xs font-semibold text-slate-500 sm:flex"><History className="h-4 w-4" /> Cambios anteriores</div>
      </div>
    </header>
  );
}

function TypeMark({ kind }: { kind: Change["kind"] }) {
  if (kind === "nuevo") return <CirclePlus className="h-4 w-4" />;
  if (kind === "eliminado") return <Minus className="h-4 w-4" />;
  if (kind === "revisado") return <FileText className="h-4 w-4" />;
  return <Sparkles className="h-4 w-4" />;
}

function TypePill({ change }: { change: Change }) {
  const styles = change.kind === "nuevo"
    ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
    : change.kind === "eliminado"
      ? "bg-rose-50 text-rose-700 ring-rose-200"
      : change.kind === "revisado"
        ? "bg-amber-50 text-amber-700 ring-amber-200"
        : "bg-blue-50 text-blue-700 ring-blue-200";
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-black tracking-wide ring-1 ${styles}`}><TypeMark kind={change.kind} />{change.label}</span>;
}

function ChangeMeta({ change }: { change: Change }) {
  return <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500"><TypePill change={change} />{change.category && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600">{change.category}</span>}<span>·</span><span>{change.date}</span></div>;
}

function Comparison({ change, compact = false }: { change: Change; compact?: boolean }) {
  if (!change.before) {
    return <div className={`rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 ${compact ? "text-sm" : ""}`}><p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">Se ha añadido</p><p className="mt-2 leading-6 text-emerald-950">{change.after}</p></div>;
  }
  if (!change.after) {
    return <div className={`rounded-2xl border border-rose-200 bg-rose-50/70 p-4 ${compact ? "text-sm" : ""}`}><p className="text-[10px] font-black uppercase tracking-[0.18em] text-rose-700">Se ha retirado</p><p className="mt-2 leading-6 text-rose-950">{change.before}</p></div>;
  }
  return <div className={`grid gap-3 ${compact ? "text-sm" : "md:grid-cols-2"}`}><div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Antes</p><p className="mt-2 whitespace-pre-line leading-6 text-slate-600">{change.before}</p></div><div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-700">Ahora</p><p className="mt-2 whitespace-pre-line leading-6 text-blue-950">{change.after}</p></div></div>;
}

function ProcedureSections({ change }: { change: Change }) {
  const isRemoved = change.kind === "eliminado";
  return <div className={`rounded-2xl border p-4 ${isRemoved ? "border-rose-200 bg-rose-50/70" : "border-emerald-200 bg-emerald-50/70"}`}><div className="flex items-center justify-between gap-3"><p className={`text-[10px] font-black uppercase tracking-[0.18em] ${isRemoved ? "text-rose-700" : "text-emerald-700"}`}>{isRemoved ? "Ya no está disponible" : "Ahora incluye"}</p><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${isRemoved ? "bg-white/70 text-rose-700" : "bg-white/70 text-emerald-700"}`}>{change.sections?.length ?? 0} apartados</span></div><div className="mt-3 grid gap-2">{change.sections?.map((section) => <div key={section.title} className="rounded-xl bg-white/70 p-3"><p className={`text-sm font-black ${isRemoved ? "text-rose-950" : "text-emerald-950"}`}>{section.title}</p><p className={`mt-1 text-sm leading-6 ${isRemoved ? "text-rose-900/80" : "text-emerald-900/80"}`}>{section.body}</p></div>)}</div>{isRemoved && <p className="mt-3 text-xs leading-5 text-rose-800">Sus indicaciones se encuentran ahora dentro del circuito operativo actualizado.</p>}</div>;
}

function OpenProcedure({ label = "Abrir procedimiento" }: { label?: string }) {
  return <button type="button" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 text-xs font-black text-white shadow-lg shadow-blue-900/15 transition hover:bg-blue-800">{label}<ArrowUpRight className="h-4 w-4" /></button>;
}

function ChangeGallery() {
  return <section className="mx-auto mt-8 max-w-5xl"><div className="mb-4"><p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-700">Casos que debe resolver</p><h2 className="mt-1 text-xl font-black tracking-tight text-slate-950">No todos los cambios se leen igual</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">La misma experiencia también debe explicar retiradas, revisiones alejadas dentro de un texto, códigos y pautas de medicación.</p></div><div className="grid gap-3 md:grid-cols-2">{EXAMPLE_CHANGES.map((change) => <article key={change.title} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><ChangeMeta change={change} /><h3 className="mt-3 text-base font-black leading-snug text-slate-950">{change.title}</h3><p className="mt-1 text-sm leading-6 text-slate-600">{change.summary}</p><div className="mt-3"><Comparison change={change} compact /></div></article>)}</div><div className="mt-8 mb-4"><p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-700">Cambios de alcance completo</p><h2 className="mt-1 text-xl font-black tracking-tight text-slate-950">Cuando cambia un procedimiento entero</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">En estos casos no enseñamos una línea aislada: explicamos qué entra, qué sale y cómo orientarse.</p></div><div className="grid gap-3 md:grid-cols-2">{[NEW_PROCEDURE, REMOVED_PROCEDURE].map((change) => <article key={change.title} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><ChangeMeta change={change} /><h3 className="mt-3 text-base font-black leading-snug text-slate-950">{change.title}</h3><p className="mt-1 text-sm leading-6 text-slate-600">{change.summary}</p><div className="mt-3"><ProcedureSections change={change} /></div><div className="mt-4 flex justify-end"><OpenProcedure label={change.kind === "nuevo" ? "Ver procedimiento" : "Ver cambios relacionados"} /></div></article>)}</div></section>;
}

function VariantA() {
  return <div className="mx-auto max-w-3xl space-y-6"><div className="rounded-[1.75rem] bg-blue-700 p-6 text-white shadow-xl shadow-blue-900/15 sm:p-8"><div className="flex items-start justify-between gap-5"><div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-200">Novedad del manual</p><h1 className="mt-3 max-w-xl text-3xl font-black leading-tight tracking-tight sm:text-4xl">Ahora es más fácil entender qué ha cambiado.</h1><p className="mt-3 max-w-xl text-sm leading-6 text-blue-100">Revisa las últimas modificaciones del Manual de Procedimientos sin leer comparaciones técnicas.</p></div><div className="hidden rounded-2xl bg-white/10 p-3 sm:block"><Sparkles className="h-6 w-6 text-blue-100" /></div></div><div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-semibold text-blue-100"><span>1 cambio reciente</span><span className="h-1 w-1 rounded-full bg-blue-300" /><span>Actualizado hoy</span></div></div><article className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><ChangeMeta change={CHANGE} /><h2 className="mt-4 text-xl font-black tracking-tight text-slate-950">{CHANGE.title}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{CHANGE.summary}</p><div className="my-5 h-px bg-slate-100" /><Comparison change={CHANGE} /><div className="mt-5 flex justify-end"><OpenProcedure /></div></article><article className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><ChangeMeta change={NEW_CHANGE} /><h2 className="mt-4 text-lg font-black tracking-tight text-slate-950">{NEW_CHANGE.title}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{NEW_CHANGE.summary}</p><div className="mt-4"><Comparison change={NEW_CHANGE} compact /></div></article></div>;
}

function VariantB() {
  return <div className="mx-auto max-w-5xl"><div className="mb-6 flex items-end justify-between gap-4"><div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-700">Técnicas de comunicación</p><h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Antes y ahora</h1><p className="mt-2 text-sm text-slate-500">Una lectura rápida de la modificación.</p></div><OpenProcedure label="Leer completo" /></div><div className="relative pl-8 sm:pl-12"><div className="absolute bottom-10 left-3 top-4 w-px bg-slate-200 sm:left-5" /><div className="relative mb-8"><div className="absolute -left-8 top-0 flex h-6 w-6 items-center justify-center rounded-full bg-blue-700 text-white ring-4 ring-blue-50 sm:-left-12"><Sparkles className="h-3.5 w-3.5" /></div><ChangeMeta change={CHANGE} /><h2 className="mt-3 text-xl font-black tracking-tight text-slate-950">{CHANGE.summary}</h2></div><div className="grid gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-stretch"><div className="rounded-2xl border border-slate-200 bg-slate-50 p-5"><p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Antes</p><p className="mt-4 whitespace-pre-line text-sm leading-7 text-slate-600">{CHANGE.before}</p></div><div className="flex items-center justify-center text-blue-700"><MoveRight className="hidden h-5 w-5 sm:block" /><ChevronDown className="h-5 w-5 sm:hidden" /></div><div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-5"><div className="flex items-center justify-between gap-2"><p className="text-xs font-black uppercase tracking-[0.18em] text-blue-700">Ahora</p><Check className="h-4 w-4 text-blue-700" /></div><p className="mt-4 whitespace-pre-line text-sm leading-7 text-blue-950">{CHANGE.after}</p></div></div><div className="relative mt-8"><div className="absolute -left-8 top-0 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-white ring-4 ring-emerald-50 sm:-left-12"><CirclePlus className="h-3.5 w-3.5" /></div><ChangeMeta change={NEW_CHANGE} /><h2 className="mt-3 text-xl font-black tracking-tight text-slate-950">{NEW_CHANGE.title}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{NEW_CHANGE.summary}</p><div className="mt-4 max-w-2xl"><Comparison change={NEW_CHANGE} compact /></div></div></div></div>;
}

function DetailRow({ label, children, tone = "neutral" }: { label: string; children: ReactNode; tone?: "neutral" | "blue" | "green" }) {
  const toneStyles = tone === "green" ? "border-emerald-200 bg-emerald-50 text-emerald-950" : tone === "blue" ? "border-blue-200 bg-blue-50 text-blue-950" : "border-slate-200 bg-white text-slate-700";
  return <div className={`rounded-2xl border p-4 ${toneStyles}`}><p className="text-[10px] font-black uppercase tracking-[0.18em] opacity-60">{label}</p><div className="mt-2 text-sm leading-6">{children}</div></div>;
}

function VariantC() {
  return <div className="mx-auto max-w-2xl"><div className="mb-5 flex items-center gap-2 text-xs font-bold text-slate-500"><History className="h-4 w-4" /> Cambios anteriores <ArrowRight className="h-3.5 w-3.5" /> 1 de septiembre</div><article className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-xl shadow-slate-900/5"><div className="bg-slate-950 px-6 py-7 text-white sm:px-8"><ChangeMeta change={CHANGE} /><h1 className="mt-4 text-2xl font-black leading-tight tracking-tight sm:text-3xl">{CHANGE.title}</h1><p className="mt-3 text-sm leading-6 text-slate-300">{CHANGE.summary}</p></div><div className="space-y-4 p-5 sm:p-8"><div className="flex items-center gap-3 text-xs font-black uppercase tracking-[0.18em] text-slate-500"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-blue-700">1</span> Lo que necesitas saber</div><DetailRow label="Antes"><span>{CHANGE.before}</span></DetailRow><div className="flex justify-center text-blue-700"><ChevronDown className="h-5 w-5" /></div><DetailRow label="Ahora" tone="blue"><span>{CHANGE.after}</span></DetailRow><div className="rounded-2xl bg-blue-50 p-4"><p className="text-xs font-black text-blue-900">En resumen</p><p className="mt-1 text-sm leading-6 text-blue-950">La información está más ordenada y la identificación inicial del SAMUR queda más clara.</p></div><div className="flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-slate-500">Consulta el procedimiento completo para ver todas las indicaciones.</p><OpenProcedure /></div></div></article></div>;
}

export function DiffExperiencePrototype() {
  const searchParams = useSearchParams();
  const variant = normalizeVariant(searchParams.get("variant"));
  return <div className="min-h-dvh bg-slate-100 text-slate-950"><PrototypeHeader /><main className="mx-auto max-w-6xl px-4 py-6 pb-32 sm:px-6 sm:py-8"><div className="mb-7 max-w-2xl"><p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-700">Prototipo de interfaz</p><h2 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">¿Cómo explicamos los cambios del manual?</h2><p className="mt-2 text-sm leading-6 text-slate-600">Tres direcciones para web y app. El contenido es el mismo; cambia la forma de entenderlo.</p></div>{variant === "A" && <VariantA />}{variant === "B" && <VariantB />}{variant === "C" && <VariantC />}<ChangeGallery /><div className="mx-auto mt-8 max-w-2xl rounded-2xl border border-dashed border-slate-300 bg-white/60 p-4 text-xs leading-5 text-slate-500"><span className="font-bold text-slate-700">Criterio de esta prueba:</span> el usuario debe entender el cambio sin conocer diffs, commits ni formato técnico. La vista se apila en móvil y gana espacio en pantallas grandes.</div></main>{process.env.NODE_ENV !== "production" && <PrototypeSwitcher current={variant} />}</div>;
}

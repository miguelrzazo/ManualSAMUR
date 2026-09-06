"use client";

import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Database,
  ExternalLink,
  FileText,
  Fingerprint,
  LockKeyhole,
  Mail,
  MapPinned,
  Moon,
  RefreshCw,
  Scale,
  ShieldCheck,
  Smartphone,
  Trash2,
  UserRound,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

const VARIANTS = ["A", "B", "C"] as const;
type Variant = (typeof VARIANTS)[number];

const VARIANT_NAMES: Record<Variant, string> = {
  A: "Panel de control",
  B: "Centro de confianza",
  C: "Lista operativa",
};

const PLACEHOLDERS = {
  publisher: "[NOMBRE LEGAL DEL EDITOR]",
  email: "[EMAIL DE SOPORTE]",
  privacy: "[URL DE POLÍTICA DE PRIVACIDAD]",
};

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
    <div className="fixed bottom-3 left-1/2 z-[200] w-[min(calc(100%-1.5rem),25rem)] -translate-x-1/2 rounded-2xl border border-slate-700 bg-slate-950/95 p-2 text-white shadow-2xl backdrop-blur-xl">
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={() => cycle(-1)} className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-300 hover:bg-white/10 hover:text-white" aria-label="Variante anterior"><ArrowLeft className="h-4 w-4" /></button>
        <div className="min-w-0 flex-1 text-center"><p className="truncate text-xs font-semibold">{current} — {VARIANT_NAMES[current]}</p><p className="truncate text-[10px] text-slate-400">← → para cambiar · solo prototipo</p></div>
        <button type="button" onClick={() => cycle(1)} className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-300 hover:bg-white/10 hover:text-white" aria-label="Variante siguiente"><ArrowRight className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

function CompliancePill({ children, tone = "green" }: { children: ReactNode; tone?: "green" | "amber" | "blue" }) {
  const styles = {
    green: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200",
    amber: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200",
    blue: "border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-200",
  };
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold ${styles[tone]}`}><Check className="h-3 w-3" />{children}</span>;
}

function AppHeader({ quiet = false }: { quiet?: boolean }) {
  return <header className={`border-b border-border/70 px-4 pb-5 pt-[calc(1rem+env(safe-area-inset-top))] ${quiet ? "bg-background" : "bg-slate-950 text-white"}`}><div className="mx-auto flex w-full max-w-[34rem] items-center justify-between"><div className="flex items-center gap-3"><div className={`flex h-10 w-10 items-center justify-center rounded-xl ${quiet ? "bg-blue-500/10 text-blue-600" : "bg-blue-500 text-white"}`}><ShieldCheck className="h-5 w-5" /></div><div><p className={`text-[10px] font-bold uppercase tracking-[0.2em] ${quiet ? "text-blue-600" : "text-blue-300"}`}>Manual SAMUR · PC</p><h1 className="text-base font-bold">Información y ajustes</h1></div></div><button type="button" className={`flex h-10 w-10 items-center justify-center rounded-xl ${quiet ? "bg-muted" : "bg-white/10"}`} aria-label="Cerrar ajustes">×</button></div></header>;
}

function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return <div className="mb-3"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-blue-600">{eyebrow}</p><h2 className="mt-1 text-lg font-bold tracking-tight">{title}</h2></div>;
}

function LinkRow({ icon: Icon, label, detail, tone = "blue", href = "#" }: { icon: typeof FileText; label: string; detail: string; tone?: "blue" | "slate" | "amber"; href?: string }) {
  const tones = { blue: "bg-blue-500/10 text-blue-600", slate: "bg-slate-500/10 text-slate-600 dark:text-slate-300", amber: "bg-amber-500/10 text-amber-700" };
  return <a href={href} className="group flex min-h-16 items-center gap-3 border-b border-border/60 px-1 py-3 last:border-b-0"><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tones[tone]}`}><Icon className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-bold">{label}</span><span className="mt-0.5 block text-[11px] leading-4 text-muted-foreground">{detail}</span></span><ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5" /></a>;
}

function DataSummary({ compact = false }: { compact?: boolean }) {
  return <div className={`rounded-2xl border border-blue-200 bg-blue-50/80 text-blue-950 dark:border-blue-900/60 dark:bg-blue-950/25 dark:text-blue-100 ${compact ? "p-3" : "p-4"}`}><div className="flex items-start gap-3"><div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white"><LockKeyhole className="h-4 w-4" /></div><div className="min-w-0"><p className="text-xs font-bold">Privacidad, en resumen</p><p className="mt-1 text-xs leading-5 opacity-80">No hay cuenta, analítica ni datos de pacientes. Favoritos, recientes y preferencias permanecen en este dispositivo.</p>{!compact && <p className="mt-2 text-xs leading-5 opacity-80">La ubicación solo se solicita cuando la pides. El mapa online usa red y muestra su atribución.</p>}</div></div></div>;
}

function DataDeletion({ expanded, onToggle }: { expanded: boolean; onToggle: () => void }) {
  return <div className="rounded-2xl border border-red-200 bg-red-50/70 dark:border-red-900/60 dark:bg-red-950/20"><button type="button" onClick={onToggle} className="flex min-h-14 w-full items-center gap-3 px-4 text-left"><Trash2 className="h-4 w-4 text-red-600" /><span className="flex-1 text-sm font-bold text-red-950 dark:text-red-100">Borrar datos locales</span><ChevronDown className={`h-4 w-4 text-red-700 transition-transform ${expanded ? "rotate-180" : ""}`} /></button>{expanded && <div className="border-t border-red-200 px-4 pb-4 pt-3 text-xs leading-5 text-red-950/75 dark:border-red-900/60 dark:text-red-100/75"><p>Eliminaría favoritos, recientes, búsquedas, preferencias y paquetes descargados. Requiere confirmación antes de ejecutarse.</p><button type="button" className="mt-3 rounded-xl bg-red-600 px-3 py-2 text-xs font-bold text-white">Confirmar borrado (stub)</button></div>}</div>;
}

function LegalSupport({ dense = false }: { dense?: boolean }) {
  return <section className={dense ? "" : "mt-8"}><SectionTitle eyebrow="Al final, cuando lo necesites" title="Legal y soporte" /><div className="divide-y divide-border/60 rounded-2xl border border-border/70 bg-card px-4"><LinkRow icon={FileText} label="Política de privacidad" detail={PLACEHOLDERS.privacy} /><LinkRow icon={Mail} label="Contacto / Enviar comentarios" detail={PLACEHOLDERS.email} /><LinkRow icon={Scale} label="Créditos y licencias" detail="Contenido, iconos, fuentes y cartografía de terceros" tone="slate" /><LinkRow icon={ExternalLink} label="Fuente oficial" detail="servpub.madrid.es/manualsamur" tone="slate" /></div><p className="mt-3 px-1 text-[10px] leading-4 text-muted-foreground">Editor provisional: {PLACEHOLDERS.publisher}. Adaptación no oficial; no implica afiliación, aprobación ni representación institucional.</p></section>;
}

function VersionBlock() {
  return <div className="grid grid-cols-2 gap-2"><div className="rounded-2xl border border-border/70 bg-card p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Versión</p><p className="mt-1 text-sm font-bold">0.1.0 · build 42</p></div><div className="rounded-2xl border border-border/70 bg-card p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Contenido</p><p className="mt-1 text-sm font-bold">Rev. 01/09/2026</p></div></div>;
}

function VariantA() {
  const [expanded, setExpanded] = useState(false);
  return <div className="min-h-dvh bg-[#f7f9fc] text-slate-950 dark:bg-[#0d121a] dark:text-white"><AppHeader /><main className="mx-auto w-full max-w-[34rem] space-y-7 px-4 py-5 pb-24"><section><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">Estado del dispositivo</p><h2 className="mt-1 text-2xl font-bold tracking-tight">Todo listo para consultar</h2></div><CompliancePill>sin cuenta</CompliancePill></div><div className="mt-4 grid gap-2"><div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100"><Database className="h-5 w-5 text-emerald-600" /><div className="flex-1"><p className="text-sm font-bold">Contenido local validado</p><p className="mt-0.5 text-xs opacity-70">Paquete íntegro · disponible sin conexión</p></div><Check className="h-4 w-4 text-emerald-600" /></div><button type="button" className="flex min-h-12 items-center gap-3 rounded-2xl border border-border/70 bg-card px-4 text-left"><RefreshCw className="h-4 w-4 text-blue-600" /><span className="flex-1 text-sm font-bold">Buscar actualización</span><ChevronRight className="h-4 w-4 text-muted-foreground/50" /></button></div></section><section><SectionTitle eyebrow="Controles" title="Preferencias y datos" /><div className="space-y-2"><button type="button" className="flex min-h-14 w-full items-center gap-3 rounded-2xl border border-border/70 bg-card px-4 text-left"><Moon className="h-4 w-4 text-blue-600" /><span className="flex-1"><span className="block text-sm font-bold">Apariencia</span><span className="text-[11px] text-muted-foreground">Sistema</span></span><ChevronRight className="h-4 w-4 text-muted-foreground/50" /></button><DataSummary /><DataDeletion expanded={expanded} onToggle={() => setExpanded((value) => !value)} /></div></section><LegalSupport /><VersionBlock /></main></div>;
}

function VariantB() {
  const [expanded, setExpanded] = useState(false);
  return <div className="min-h-dvh bg-[#fbfaf7] text-stone-950 dark:bg-[#111111] dark:text-white"><AppHeader quiet /><main className="mx-auto w-full max-w-[34rem] px-4 py-5 pb-24"><div className="rounded-3xl bg-stone-950 p-5 text-white shadow-xl shadow-stone-950/20 dark:bg-stone-900"><div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-300">Referencia independiente</p><h2 className="mt-2 text-2xl font-bold leading-tight">Puedes saber qué hace la app.</h2><p className="mt-2 max-w-[18rem] text-sm leading-5 text-stone-300">La información legal y de privacidad está agrupada aquí para que puedas revisarla antes de usar cualquier permiso.</p></div><Fingerprint className="h-7 w-7 shrink-0 text-blue-300" /></div><div className="mt-5 flex flex-wrap gap-2"><CompliancePill>datos locales</CompliancePill><CompliancePill tone="blue">sin analítica</CompliancePill></div></div><section className="mt-7"><SectionTitle eyebrow="Lo esencial" title="Privacidad y permisos" /><DataSummary /><div className="mt-3 divide-y divide-border/60 rounded-2xl border border-border/70 bg-card px-4"><LinkRow icon={MapPinned} label="Ubicación y mapa online" detail="Solo cuando lo solicitas · red y atribución visibles" /><LinkRow icon={UserRound} label="Datos que guardamos" detail="Favoritos, recientes y preferencias en este dispositivo" /><LinkRow icon={CircleHelp} label="Preguntas frecuentes" detail="Cómo funciona el contenido offline y las actualizaciones" tone="slate" /></div></section><section className="mt-7"><SectionTitle eyebrow="Ajustes" title="Personaliza tu consulta" /><div className="grid grid-cols-2 gap-2"><button type="button" className="flex min-h-20 flex-col items-start justify-between rounded-2xl border border-border/70 bg-card p-4 text-left"><Moon className="h-4 w-4 text-blue-600" /><span className="text-sm font-bold">Apariencia</span><span className="text-[11px] text-muted-foreground">Sistema</span></button><button type="button" className="flex min-h-20 flex-col items-start justify-between rounded-2xl border border-border/70 bg-card p-4 text-left"><RefreshCw className="h-4 w-4 text-blue-600" /><span className="text-sm font-bold">Contenido</span><span className="text-[11px] text-muted-foreground">Rev. 01/09/2026</span></button></div><div className="mt-3"><DataDeletion expanded={expanded} onToggle={() => setExpanded((value) => !value)} /></div></section><LegalSupport dense /></main></div>;
}

function VariantC() {
  const [expanded, setExpanded] = useState(false);
  return <div className="min-h-dvh bg-[#eef2f5] text-slate-950 dark:bg-[#0a1017] dark:text-white"><div className="mx-auto min-h-dvh w-full max-w-[34rem] bg-background"><AppHeader quiet /><main className="px-4 py-4 pb-24"><div className="mb-4 flex items-center gap-2 text-xs text-muted-foreground"><Smartphone className="h-4 w-4" /><span>Manual de procedimientos SAMUR PC</span><span className="ml-auto rounded-full bg-amber-500/10 px-2 py-1 text-[10px] font-bold text-amber-700">no oficial</span></div><div className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/70 bg-card"><p className="px-4 pb-2 pt-4 text-[10px] font-bold uppercase tracking-[0.18em] text-blue-600">Contenido y sincronización</p><button type="button" className="flex min-h-16 w-full items-center gap-3 px-4 text-left"><Database className="h-4 w-4 text-emerald-600" /><span className="flex-1"><span className="block text-sm font-bold">Contenido al día</span><span className="text-[11px] text-muted-foreground">01/09/2026 · rev 04daeffd · offline</span></span><ChevronRight className="h-4 w-4 text-muted-foreground/50" /></button><button type="button" className="flex min-h-16 w-full items-center gap-3 px-4 text-left"><RefreshCw className="h-4 w-4 text-blue-600" /><span className="flex-1 text-sm font-bold">Buscar actualización</span><ChevronRight className="h-4 w-4 text-muted-foreground/50" /></button><p className="px-4 pb-2 pt-5 text-[10px] font-bold uppercase tracking-[0.18em] text-blue-600">Consulta rápida</p><button type="button" className="flex min-h-16 w-full items-center gap-3 px-4 text-left"><FileText className="h-4 w-4 text-blue-600" /><span className="flex-1"><span className="block text-sm font-bold">Abreviaturas</span><span className="text-[11px] text-muted-foreground">Búsqueda local por significado</span></span><ChevronRight className="h-4 w-4 text-muted-foreground/50" /></button><p className="px-4 pb-2 pt-5 text-[10px] font-bold uppercase tracking-[0.18em] text-blue-600">Apariencia</p><button type="button" className="flex min-h-16 w-full items-center gap-3 px-4 text-left"><Moon className="h-4 w-4 text-blue-600" /><span className="flex-1"><span className="block text-sm font-bold">Tema</span><span className="text-[11px] text-muted-foreground">Sistema</span></span><ChevronRight className="h-4 w-4 text-muted-foreground/50" /></button></div><div className="mt-4"><DataSummary compact /></div><div className="mt-3"><DataDeletion expanded={expanded} onToggle={() => setExpanded((value) => !value)} /></div><LegalSupport dense /><VersionBlock /></main></div></div>;
}

export function SettingsCompliancePrototype() {
  const searchParams = useSearchParams();
  const variant = normalizeVariant(searchParams.get("variant"));
  return <div data-settings-prototype className="fixed inset-0 z-[100] overflow-y-auto bg-background"><div className="min-h-full">{variant === "A" && <VariantA />}{variant === "B" && <VariantB />}{variant === "C" && <VariantC />}{process.env.NODE_ENV !== "production" && <PrototypeSwitcher current={variant} />}</div></div>;
}

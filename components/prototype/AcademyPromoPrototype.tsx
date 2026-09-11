"use client";

import Image from "next/image";
import { ArrowLeft, ArrowRight, ExternalLink, Sparkles } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

const aptaBlueTutor = "/assets/apta-blue-tutor.png";

// PROTOTYPE — three APTA Academy placements for Settings, switchable with ?variant=.
const VARIANTS = ["A", "B", "C"] as const;
type Variant = (typeof VARIANTS)[number];

const NAMES: Record<Variant, string> = {
  A: "Hero editorial",
  B: "Marca protagonista",
  C: "Sello de autoría",
};

function normalizeVariant(value: string | null): Variant {
  return VARIANTS.includes(value as Variant) ? value as Variant : "A";
}

function Switcher({ current }: { current: Variant }) {
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

  return <div className="fixed bottom-4 left-1/2 z-20 flex w-[min(calc(100%-2rem),24rem)] -translate-x-1/2 items-center justify-between rounded-2xl bg-slate-950 px-2 py-2 text-white shadow-2xl"><button type="button" onClick={() => cycle(-1)} className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-300 hover:bg-white/10" aria-label="Variante anterior"><ArrowLeft className="h-4 w-4" /></button><div className="text-center"><p className="text-xs font-bold">{current} · {NAMES[current]}</p><p className="text-[10px] text-slate-400">← → · solo prototipo</p></div><button type="button" onClick={() => cycle(1)} className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-300 hover:bg-white/10" aria-label="Variante siguiente"><ArrowRight className="h-4 w-4" /></button></div>;
}

function AppHeader() {
  return <header className="border-b border-slate-200 bg-white px-5 pb-5 pt-6"><div className="mx-auto flex max-w-xl items-center justify-between"><div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-700">Manual SAMUR · PC</p><h1 className="mt-1 text-xl font-black tracking-tight text-slate-950">Ajustes</h1></div><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-xl text-slate-700">×</div></div></header>;
}

function Mascot({ className = "h-48 w-40" }: { className?: string }) {
  return <Image src={aptaBlueTutor} alt="Lince azul de APTA Academy" width={1254} height={1254} className={`object-contain ${className}`} />;
}

function VariantA() {
  return <section className="rounded-[1.75rem] border border-blue-700 bg-blue-700 p-5 text-white shadow-xl shadow-blue-900/20"><div className="flex items-center justify-between gap-4"><div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-100">Creada por nosotros</p><h2 className="mt-2 text-3xl font-black tracking-tight">APTA Academy</h2><p className="mt-2 text-sm font-bold leading-5">Esta aplicación está creada por APTA Academy.</p><p className="mt-3 max-w-[16rem] text-base font-black leading-6 text-white">Una forma inteligente de preparar tu oposición.</p><button type="button" className="mt-5 inline-flex items-center gap-2 text-sm font-black text-white">Prepara tu oposición con nosotros <ExternalLink className="h-4 w-4" /></button></div><Mascot className="h-48 w-36 shrink-0" /></div></section>;
}

function VariantB() {
  return <section className="relative overflow-hidden rounded-[1.75rem] bg-blue-700 p-6 text-white shadow-xl shadow-blue-900/20"><div className="absolute -right-7 -top-10 h-48 w-48 rounded-full bg-white/10" /><div className="relative flex min-h-72 flex-col justify-between"><div><div className="flex items-center gap-2 text-sm font-black"><Sparkles className="h-4 w-4 text-blue-200" /> APTA Academy</div><p className="mt-6 max-w-[18rem] text-3xl font-black leading-[1.05] tracking-tight">Una forma inteligente de preparar tu oposición.</p><p className="mt-4 max-w-[18rem] text-sm font-semibold leading-5 text-blue-100">Esta aplicación está creada por APTA Academy.</p></div><button type="button" className="mt-6 flex min-h-12 items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-black text-blue-800">Prepara tu oposición con nosotros <ExternalLink className="h-4 w-4" /></button></div><Mascot className="pointer-events-none absolute -bottom-4 -right-3 h-48 w-36 opacity-95" /></section>;
}

function VariantC() {
  return <section className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-sm"><div className="flex items-center gap-4 bg-slate-950 px-5 py-4 text-white"><Mascot className="h-20 w-16 shrink-0" /><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-300">Detrás de esta app</p><h2 className="mt-1 text-xl font-black">APTA Academy</h2></div></div><div className="p-5"><p className="text-sm font-black leading-5 text-slate-950">Esta aplicación está creada por APTA Academy.</p><p className="mt-3 text-xl font-black leading-6 tracking-tight text-blue-800">Una forma inteligente de preparar tu oposición.</p><p className="mt-3 text-sm leading-5 text-slate-600">Formación, tests y tutor virtual para avanzar con un plan claro.</p><button type="button" className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-300 text-sm font-black text-slate-950">Prepara tu oposición con nosotros <ExternalLink className="h-4 w-4" /></button></div></section>;
}

export function AcademyPromoPrototype() {
  const searchParams = useSearchParams();
  const variant = normalizeVariant(searchParams.get("variant"));
  return <div className="min-h-dvh bg-slate-100 text-slate-950"><AppHeader /><main className="mx-auto max-w-xl space-y-5 px-5 py-6 pb-28"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Formación</p><h2 className="mt-1 text-2xl font-black tracking-tight">Elige la jerarquía del anuncio</h2><p className="mt-2 text-sm leading-5 text-slate-600">Tres composiciones para el bloque de APTA Academy dentro de Ajustes.</p></div>{variant === "A" && <VariantA />}{variant === "B" && <VariantB />}{variant === "C" && <VariantC />}<div className="rounded-2xl border border-slate-200 bg-white p-4 text-xs leading-5 text-slate-600">La app mantiene su aviso legal independiente. Este bloque explica la autoría de APTA Academy y enlaza a la formación.</div></main>{process.env.NODE_ENV !== "production" && <Switcher current={variant} />}</div>;
}

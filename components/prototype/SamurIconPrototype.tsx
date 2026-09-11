"use client";

import { ArrowLeft, ArrowRight, Check, Moon, Sun } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

const VARIANTS = ["A", "B", "C"] as const;
type Variant = (typeof VARIANTS)[number];
type Treatment = "color" | "whiteOnRed" | "black" | "white" | "transparent";

const VARIANT_NAMES: Record<Variant, string> = {
  A: "Nexo de respuesta",
  B: "Rosa de guardia",
  C: "Pulso abierto",
};

const VARIANT_NOTES: Record<Variant, { thesis: string; read: string; recommendation: string }> = {
  A: {
    thesis: "Un gesto compacto de protección y dirección.",
    read: "La unión central crea una cruz abstracta sin dibujar un símbolo clínico literal.",
    recommendation: "La opción más sólida para una marca universal y para tamaños pequeños.",
  },
  B: {
    thesis: "Una brújula geométrica para orientarse bajo presión.",
    read: "El rombo central y las cuatro puntas sugieren navegación, cobertura y disponibilidad.",
    recommendation: "La más distintiva en launcher y mapa; requiere más cuidado en favicon diminuto.",
  },
  C: {
    thesis: "Un pulso de guardia, firme y fácil de reencontrar.",
    read: "La señal abierta conserva movimiento, mientras el campo navy aporta confianza y contraste.",
    recommendation: "Esta segunda pasada es la dirección recomendada: más propia, más legible y menos genérica.",
  },
};

function normalizeVariant(value: string | null): Variant {
  return VARIANTS.includes(value as Variant) ? (value as Variant) : "A";
}

function IconMark({ variant, treatment = "color", size = 96 }: { variant: Variant; treatment?: Treatment; size?: number }) {
  const isColor = treatment === "color";
  const isWhiteOnRed = treatment === "whiteOnRed";
  const foreground = treatment === "transparent" ? "#c8102e" : treatment === "white" || isWhiteOnRed ? "#ffffff" : treatment === "black" ? "#101820" : "#ffffff";
  const background = isColor && variant === "C" ? "#102a43" : isColor ? "#c8102e" : isWhiteOnRed ? "#c8102e" : treatment === "transparent" ? "transparent" : treatment === "white" ? "#c8102e" : "#ffffff";
  const navy = treatment === "black" ? "#101820" : treatment === "white" || isWhiteOnRed ? "#ffffff" : "#102a43";
  const red = treatment === "black" ? "#101820" : "#c8102e";

  return (
    <svg width={size} height={size} viewBox="0 0 256 256" role="img" aria-label={`${VARIANT_NAMES[variant]} · ${treatment}`}>
      {treatment !== "transparent" && <rect width="256" height="256" rx="58" fill={background} />}
      {variant === "A" && (
        <>
          <path d="M128 40 181 93h-31v31h31l-53 53-53-53h31V93H75l53-53Z" fill={foreground} />
          <path d="M128 82 151 105h-12v46h-22v-46h-12l23-23Z" fill={red} opacity={treatment === "black" ? 1 : 0.92} />
          <path d="m57 137 22-22 28 28-22 22-28-28Zm142 0-22-22-28 28 22 22 28-28Z" fill={navy} opacity={treatment === "white" || isWhiteOnRed ? 0.22 : 0.95} />
        </>
      )}
      {variant === "B" && (
        <>
          <path d="m128 32 30 66 66 30-66 30-30 66-30-66-66-30 66-30 30-66Z" fill={foreground} />
          <path d="m128 79 18 49-18 49-18-49 18-49Zm-49 49 49-18 49 18-49 18-49-18Z" fill={red} />
          <path d="m128 104 24 24-24 24-24-24 24-24Z" fill={navy} opacity={treatment === "white" || isWhiteOnRed ? 0.22 : 0.95} />
        </>
      )}
      {variant === "C" && (
        <>
          <path d="M103 42h50v44l30-30 35 35-30 30h44v50h-44l30 30-35 35-30-30v44h-50v-44l-30 30-35-35 30-30H24v-50h44L38 91l35-35 30 30V42Z" fill={isColor ? "#c8102e" : foreground} />
          <path d="M99 99h58v58H99z" fill={isColor ? "#f6f5f2" : red} />
          <path d="M114 114h28v28h-28z" fill={isColor ? "#102a43" : navy} opacity={treatment === "white" || isWhiteOnRed ? 0.22 : 0.98} />
        </>
      )}
      {treatment === "transparent" && <path d="M128 222 75 169h31v-31H75l53-53 53 53h-31v31h31l-53 53Z" fill={red} opacity=".16" />}
    </svg>
  );
}

function IconFrame({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`flex items-center justify-center overflow-hidden ${className}`}>{children}</div>;
}

function VariantSwitcher({ current }: { current: Variant }) {
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
    <div className="fixed bottom-4 left-1/2 z-[200] w-[min(calc(100%-2rem),27rem)] -translate-x-1/2 rounded-2xl border border-slate-700 bg-slate-950/95 p-2 text-white shadow-2xl backdrop-blur-xl">
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={() => cycle(-1)} className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-300 hover:bg-white/10 hover:text-white" aria-label="Variante anterior"><ArrowLeft className="h-4 w-4" /></button>
        <div className="min-w-0 flex-1 text-center"><p className="truncate text-xs font-bold">{current} — {VARIANT_NAMES[current]}</p><p className="truncate text-[10px] text-slate-400">← → para cambiar · solo prototipo</p></div>
        <button type="button" onClick={() => cycle(1)} className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-300 hover:bg-white/10 hover:text-white" aria-label="Variante siguiente"><ArrowRight className="h-4 w-4" /></button>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1 rounded-xl bg-white/5 p-1">
        {VARIANTS.map((variant) => <button key={variant} type="button" onClick={() => setVariant(variant)} className={`rounded-lg py-1.5 text-[10px] font-semibold ${variant === current ? "bg-white/15 text-white" : "text-slate-400 hover:text-white"}`}>{variant} · {VARIANT_NAMES[variant]}</button>)}
      </div>
    </div>
  );
}

function TreatmentStrip({ treatment, onChange }: { treatment: Treatment; onChange: (treatment: Treatment) => void }) {
  const options: Array<{ id: Treatment; label: string }> = [
    { id: "color", label: "Color" },
    { id: "whiteOnRed", label: "Blanco / rojo" },
    { id: "black", label: "Negro" },
    { id: "white", label: "Blanco" },
    { id: "transparent", label: "Transparente" },
  ];
  return <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Tratamientos del icono">{options.map((option) => <button key={option.id} type="button" onClick={() => onChange(option.id)} role="tab" aria-selected={treatment === option.id} className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${treatment === option.id ? "border-red-600 bg-red-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-red-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"}`}>{option.label}</button>)}</div>;
}

export function SamurIconPrototype() {
  const searchParams = useSearchParams();
  const variant = normalizeVariant(searchParams.get("variant"));
  const [treatment, setTreatment] = useState<Treatment>("color");

  return <IconPrototypeBody variant={variant} treatment={treatment} setTreatment={setTreatment} />;
}

function IconPrototypeBody({ variant, treatment, setTreatment }: { variant: Variant; treatment: Treatment; setTreatment: (treatment: Treatment) => void }) {
  const note = VARIANT_NOTES[variant];
  return (
    <div data-icon-prototype className="fixed inset-0 z-[100] overflow-y-auto bg-[#f6f5f2] text-slate-950 dark:bg-[#0c1218] dark:text-white">
      <div className="mx-auto min-h-full max-w-6xl px-4 pb-36 pt-8 sm:px-8 lg:px-12">
        <header className="flex items-start justify-between gap-6 border-b border-slate-200 pb-6 dark:border-slate-800">
          <div><p className="text-[11px] font-bold uppercase tracking-[.22em] text-red-600">PROTOTIPO · ISSUE 47</p><h1 className="mt-2 max-w-2xl text-3xl font-black tracking-tight sm:text-5xl">Una marca para encontrar el camino cuando importa.</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">Tres direcciones geométricas para el icono universal de ManualSAMUR. Sin texto, sin gradientes, reconocible en un vistazo.</p></div>
          <div className="hidden rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 sm:block"><IconMark variant={variant} size={64} /><p className="mt-2 text-center text-[10px] font-bold uppercase tracking-wider text-slate-400">{variant}</p></div>
        </header>

        <main className="grid gap-8 py-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <section className="space-y-8">
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
              <div className="flex min-h-[22rem] items-center justify-center rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:min-h-[28rem]"><IconMark variant={variant} treatment={treatment} size={280} /></div>
              <div className="space-y-4"><div className="rounded-2xl bg-[#102a43] p-5 text-white"><p className="text-[10px] font-bold uppercase tracking-[.18em] text-red-300">Dirección {variant}</p><h2 className="mt-2 text-xl font-black">{VARIANT_NAMES[variant]}</h2><p className="mt-2 text-sm leading-5 text-slate-200">{note.thesis}</p></div><div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"><p className="text-[10px] font-bold uppercase tracking-[.18em] text-slate-400">Lectura</p><p className="mt-2 text-sm leading-5 text-slate-600 dark:text-slate-300">{note.read}</p></div></div>
            </div>
            <div><p className="mb-3 text-xs font-bold uppercase tracking-[.16em] text-slate-400">Tratamientos maestros</p><TreatmentStrip treatment={treatment} onChange={setTreatment} /></div>

            <section><div className="mb-4 flex items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-slate-400">Prueba de contexto</p><h2 className="mt-1 text-2xl font-black tracking-tight">¿Se reconoce fuera de la portada?</h2></div><p className="hidden text-right text-xs text-slate-400 sm:block">Launcher · navegación · mapa</p></div><div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <IconContext label="Launcher iOS" size={108} className="bg-[#d8e0e6]" radius="rounded-[2rem]" variant={variant} /><IconContext label="Android adaptive" size={108} className="bg-[#d8e0e6]" radius="rounded-full" variant={variant} /><IconContext label="Header" size={56} className="bg-white dark:bg-slate-900" radius="rounded-xl" variant={variant} /><IconContext label="Mapa" size={42} className="bg-[#e6efe8] dark:bg-emerald-950" radius="rounded-full" variant={variant} /></div><div className="mt-4 flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-5 py-4 dark:border-slate-800 dark:bg-slate-900"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-slate-400">Prueba de tamaño</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">La silueta debe conservar un único gesto reconocible.</p></div><div className="flex items-end gap-4"><SmallMark variant={variant} size={16} label="16" /><SmallMark variant={variant} size={24} label="24" /><SmallMark variant={variant} size={32} label="32" /></div></div></section>

            <section><div className="mb-4"><p className="text-xs font-bold uppercase tracking-[.16em] text-slate-400">Handoff de superficies</p><h2 className="mt-1 text-2xl font-black tracking-tight">Un master, varios usos.</h2></div><div className="grid gap-3 sm:grid-cols-2"><SurfaceGuide title="Launcher y store" detail="Exportar master 1024 px; mantener el gesto dentro del área segura y dejar que iOS/Android apliquen su máscara." /><SurfaceGuide title="Splash" detail="Usar campo rojo completo y el mark centrado; no añadir texto ni forzar una forma de icono alrededor." /><SurfaceGuide title="Favicon y PWA" detail="Derivar 16, 32, 180, 192 y 512 px; preferir mark rojo sobre transparente o campo blanco." /><SurfaceGuide title="Notificación y mapa" detail="Usar tratamiento monocromo blanco sobre el tinte del sistema y mark rojo/blanco con contorno limpio en mapa." /></div></section>
          </section>

          <aside className="space-y-4 lg:pt-0">
            <div className="rounded-[2rem] bg-[#102a43] p-6 text-white shadow-xl shadow-slate-900/10"><div className="flex items-center gap-2 text-red-300"><Check className="h-4 w-4" /><p className="text-xs font-bold uppercase tracking-[.16em]">Criterio de elección</p></div><p className="mt-4 text-lg font-bold leading-7">Debe sobrevivir a la urgencia, la escala y el contexto.</p><ul className="mt-5 space-y-3 text-sm leading-5 text-slate-200"><li><b className="text-white">01</b> Silueta propia en 16 px.</li><li><b className="text-white">02</b> Contraste alto en light y dark.</li><li><b className="text-white">03</b> Recorte seguro en máscaras redondas.</li><li><b className="text-white">04</b> Un solo gesto, sin texto ni detalle frágil.</li></ul></div>
            <div className="rounded-[2rem] border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"><p className="text-xs font-bold uppercase tracking-[.16em] text-slate-400">Recomendación de esta ronda</p><p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">{note.recommendation}</p><div className="mt-5 flex items-center gap-2 border-t border-slate-200 pt-4 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400"><Sun className="h-4 w-4" /> light <span className="text-slate-300">/</span> <Moon className="h-4 w-4" /> dark</div><div className="mt-4 flex items-center gap-2"><span className="h-5 w-5 rounded-md bg-[#102a43] ring-1 ring-black/10" title="Azul navy de confianza" /><span className="h-5 w-5 rounded-md bg-[#c8102e] ring-1 ring-black/10" title="Rojo SAMUR" /><span className="h-5 w-5 rounded-md bg-[#f6f5f2] ring-1 ring-black/10" title="Blanco cálido" /><span className="ml-1 text-[10px] font-semibold text-slate-400">navy · rojo · blanco cálido</span></div></div>
            <div className="rounded-[2rem] border border-dashed border-red-300 bg-red-50/70 p-6 dark:border-red-900 dark:bg-red-950/20"><p className="text-xs font-bold uppercase tracking-[.16em] text-red-700 dark:text-red-300">Pregunta para revisión</p><p className="mt-3 text-lg font-black leading-6 text-red-950 dark:text-red-100">¿Cuál de las tres recordarías después de verla una sola vez?</p><p className="mt-3 text-xs leading-5 text-red-900/70 dark:text-red-200/70">La selección desbloquea la exportación del master, safe-area y assets de plataforma.</p></div>
          </aside>
        </main>
      </div>
      {process.env.NODE_ENV !== "production" && <VariantSwitcher current={variant} />}
    </div>
  );
}

function IconContext({ label, size, className, radius, variant }: { label: string; size: number; className: string; radius: string; variant: Variant }) {
  return <div className="flex flex-col items-center gap-2"><IconFrame className={`aspect-square w-full ${className} ${radius}`}><IconMark variant={variant} size={size} /></IconFrame><p className="text-center text-[10px] font-semibold text-slate-500 dark:text-slate-400">{label}</p></div>;
}

function SmallMark({ variant, size, label }: { variant: Variant; size: number; label: string }) {
  return <div className="flex flex-col items-center gap-1"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#d8e0e6]"><IconMark variant={variant} size={size} /></div><span className="font-mono text-[9px] text-slate-400">{label}px</span></div>;
}

function SurfaceGuide({ title, detail }: { title: string; detail: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><p className="text-sm font-bold">{title}</p><p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{detail}</p></div>;
}

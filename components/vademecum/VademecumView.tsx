"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Droplets,
  Table2,
  Tags,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { VADEMECUM_TABS, type VademecumTabKey } from "@/lib/vademecum-config";
import { buildAlphabetSections } from "@/lib/vademecum-utils";

interface Drug {
  id: string;
  name: string;
  synonyms: string[];
  category: string;
  subcategory: string;
  presentation: string;
  indication: string;
  dose: string;
  route: string[];
  contraindications: string;
  notes?: string;
}

interface Perfusion {
  id: string;
  drug: string;
  drugId?: string;
  category: string;
  indication: string;
  recipe: string;
  recipeAlt?: string;
  rate: string;
  preparation: string;
  notes: string;
}

interface FluidRow {
  id: string;
  name: string;
  presentation: string;
  type: string;
  osmolarity: string;
  sodium: string;
  chloride: string;
  glucose: string;
  calcium: string;
  potassium: string;
  lactate: string;
  ph: string;
  contraindications: string[];
}

interface CommercialRow {
  drugId: string;
  activeIngredient: string;
  presentation: string;
  brandNames: string[];
}

interface Props {
  drugs: Drug[];
  perfusiones: Perfusion[];
  fluidos: FluidRow[];
  comerciales: CommercialRow[];
  highlightedDrugId?: string | null;
}

const CATEGORY_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  "Cardiovascular": { bg: "bg-red-100 dark:bg-red-900/20", text: "text-red-700 dark:text-red-300", dot: "bg-red-500" },
  "Analgesia y Sedación": { bg: "bg-violet-100 dark:bg-violet-900/20", text: "text-violet-700 dark:text-violet-300", dot: "bg-violet-500" },
  "Respiratorio": { bg: "bg-sky-100 dark:bg-sky-900/20", text: "text-sky-700 dark:text-sky-300", dot: "bg-sky-500" },
  "Metabólico": { bg: "bg-teal-100 dark:bg-teal-900/20", text: "text-teal-700 dark:text-teal-300", dot: "bg-teal-500" },
  "Antídotos": { bg: "bg-amber-100 dark:bg-amber-900/20", text: "text-amber-700 dark:text-amber-300", dot: "bg-amber-500" },
  "Obstétrico": { bg: "bg-pink-100 dark:bg-pink-900/20", text: "text-pink-700 dark:text-pink-300", dot: "bg-pink-500" },
  "Psiquiátrico": { bg: "bg-purple-100 dark:bg-purple-900/20", text: "text-purple-700 dark:text-purple-300", dot: "bg-purple-500" },
  "Fluidos IV": { bg: "bg-blue-100 dark:bg-blue-900/20", text: "text-blue-700 dark:text-blue-300", dot: "bg-blue-500" },
  "Vasoactivos": { bg: "bg-red-100 dark:bg-red-900/20", text: "text-red-700 dark:text-red-300", dot: "bg-red-500" },
  "Antiarrítmicos": { bg: "bg-orange-100 dark:bg-orange-900/20", text: "text-orange-700 dark:text-orange-300", dot: "bg-orange-500" },
  "Pendiente de clasificar": { bg: "bg-amber-100 dark:bg-amber-900/20", text: "text-amber-800 dark:text-amber-300", dot: "bg-amber-500" },
  "Otros": { bg: "bg-slate-100 dark:bg-slate-800", text: "text-slate-600 dark:text-slate-300", dot: "bg-slate-400" },
};

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const LETTER_SCROLL_OFFSET = 56;

function getColor(category: string) {
  return CATEGORY_COLORS[category] ?? CATEGORY_COLORS["Otros"];
}

function RouteChip({ route }: { route: string }) {
  return (
    <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
      {route}
    </span>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">{label}</p>
      <p className="text-sm leading-relaxed whitespace-pre-line">{value}</p>
    </div>
  );
}

function DrugCard({ drug, isHighlighted }: { drug: Drug; isHighlighted: boolean }) {
  const [open, setOpen] = useState(isHighlighted);
  const color = getColor(drug.category);

  return (
    <div
      id={`drug-${drug.id}`}
      data-drug-id={drug.id}
      className={cn(
        "rounded-xl border border-border/60 overflow-hidden transition-shadow scroll-mt-28",
        open && "shadow-md",
        isHighlighted && "ring-2 ring-primary/40 ring-offset-2 ring-offset-background",
      )}
    >
      <button
        onClick={() => setOpen((value) => !value)}
        className="w-full flex items-start gap-3 p-4 text-left hover:bg-muted/30 transition-colors"
      >
        <div className={cn("w-1 self-stretch rounded-full flex-shrink-0", color.dot)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-sm">{drug.name}</span>
            {drug.synonyms.length > 0 && (
              <span className="text-xs text-muted-foreground">({drug.synonyms.join(", ")})</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 leading-snug line-clamp-2">
            {drug.indication}
          </p>
          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", color.bg, color.text)}>
              {drug.category}
            </span>
            <span className="text-xs text-muted-foreground/60">·</span>
            <span className="text-xs text-muted-foreground">{drug.presentation}</span>
          </div>
        </div>
        {open ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
        )}
      </button>

      {open && (
        <div className="border-t border-border/40 px-4 pt-3 pb-4 bg-muted/10 space-y-3">
          <InfoRow label="Indicación" value={drug.indication} />
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Dosis</p>
            <div className="bg-background rounded-lg px-3 py-2 border border-border/50">
              {drug.dose.split("\n").map((line, index) => (
                <p key={index} className="text-sm leading-relaxed">{line}</p>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Vía</p>
            <div className="flex gap-1.5 flex-wrap">
              {drug.route.map((route) => <RouteChip key={route} route={route} />)}
            </div>
          </div>
          <InfoRow label="Contraindicaciones" value={drug.contraindications} />
          {drug.notes && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Notas</p>
              <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-line">{drug.notes}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PerfusionCard({ perf }: { perf: Perfusion }) {
  const [open, setOpen] = useState(false);
  const color = getColor(perf.category);

  return (
    <div className={cn("rounded-xl border border-border/60 overflow-hidden transition-shadow", open && "shadow-md")}>
      <button
        onClick={() => setOpen((value) => !value)}
        className="w-full flex items-start gap-3 p-4 text-left hover:bg-muted/30 transition-colors"
      >
        <div className={cn("w-1 self-stretch rounded-full flex-shrink-0", color.dot)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-sm">{perf.drug}</span>
            <Droplets className="h-3.5 w-3.5 text-blue-400 flex-shrink-0" />
          </div>
          <p className="text-xs font-mono text-blue-600 dark:text-blue-400 mt-1 font-semibold">
            {perf.recipe}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5 leading-snug line-clamp-1">
            {perf.indication}
          </p>
          <div className="flex items-center gap-1.5 mt-2">
            <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", color.bg, color.text)}>
              {perf.category}
            </span>
          </div>
        </div>
        {open ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
        )}
      </button>

      {open && (
        <div className="border-t border-border/40 px-4 pt-3 pb-4 bg-muted/10 space-y-3">
          <InfoRow label="Indicación" value={perf.indication} />

          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Dilución</p>
            <div className="bg-background rounded-lg px-3 py-2.5 border border-border/50 space-y-1">
              <p className="text-sm font-mono font-bold text-blue-600 dark:text-blue-400">{perf.recipe}</p>
              {perf.recipeAlt && (
                <p className="text-xs font-mono text-muted-foreground">{perf.recipeAlt}</p>
              )}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Velocidad de infusión</p>
            <div className="bg-background rounded-lg px-3 py-2 border border-border/50">
              {perf.rate.split("\n").map((line, index) => (
                <p key={index} className="text-sm leading-relaxed">{line}</p>
              ))}
            </div>
          </div>

          <InfoRow label="Preparación" value={perf.preparation} />

          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Notas</p>
            <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-line">{perf.notes}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function FluidCard({ fluid }: { fluid: FluidRow }) {
  return (
    <div className="rounded-xl border border-border/60 overflow-hidden">
      <div className="p-4 border-b border-border/40 bg-muted/15">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-sm">{fluid.name}</h3>
            <p className="text-xs text-muted-foreground mt-1">{fluid.presentation}</p>
          </div>
          <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
            {fluid.type}
          </span>
        </div>
      </div>
      <div className="p-4 space-y-3 text-sm">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            ["Osmolaridad", fluid.osmolarity],
            ["Na", fluid.sodium],
            ["Cl", fluid.chloride],
            ["Glucosa", fluid.glucose],
            ["Ca", fluid.calcium],
            ["K", fluid.potassium],
            ["Lactato", fluid.lactate],
            ["pH", fluid.ph],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-border/40 bg-background px-3 py-2">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
              <div className="font-medium mt-1">{value}</div>
            </div>
          ))}
        </div>
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Contraindicaciones y precauciones</p>
          <div className="flex flex-wrap gap-1.5">
            {fluid.contraindications.map((item) => (
              <span
                key={item}
                className="rounded-full bg-rose-50 px-2.5 py-1 text-xs text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
              >
                {item}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function CommercialCard({ row }: { row: CommercialRow }) {
  return (
    <div className="rounded-xl border border-border/60 p-4 space-y-3">
      <div>
        <h3 className="font-semibold text-sm">{row.activeIngredient}</h3>
        <p className="text-xs text-muted-foreground mt-1">{row.presentation}</p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {row.brandNames.map((brand) => (
          <span
            key={brand}
            className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
          >
            {brand}
          </span>
        ))}
      </div>
    </div>
  );
}

type Tab = VademecumTabKey;

function AlphabetNav({
  activeLetter,
  availableLetters,
  onSelectLetter,
}: {
  activeLetter: string | null;
  availableLetters: Set<string>;
  onSelectLetter: (letter: string) => void;
}) {
  const letters = availableLetters.has("#") ? ["#", ...ALPHABET] : ALPHABET;

  return (
    <div className="sticky top-0 z-10 border-b border-border/40 bg-background/95 px-4 py-3 backdrop-blur-md md:px-6">
      <div className="flex gap-1 overflow-x-auto scrollbar-none">
        {letters.map((letter) => {
          const enabled = availableLetters.has(letter);
          return (
            <button
              key={letter}
              onClick={() => enabled && onSelectLetter(letter)}
              disabled={!enabled}
              className={cn(
                "h-7 min-w-7 px-2 rounded-full text-[11px] font-semibold transition-colors",
                activeLetter === letter && enabled
                  ? "bg-primary text-primary-foreground"
                  : enabled
                    ? "bg-muted/60 text-foreground hover:bg-muted"
                    : "bg-transparent text-muted-foreground/35 cursor-not-allowed",
              )}
            >
              {letter}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function VademecumView({
  drugs,
  perfusiones,
  fluidos,
  comerciales,
  highlightedDrugId = null,
}: Props) {
  const [tab, setTab] = useState<Tab>("farmacos");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [activeLetter, setActiveLetter] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const drugCategories = useMemo(() => [...new Set(drugs.map((drug) => drug.category))], [drugs]);
  const perfCategories = useMemo(() => [...new Set(perfusiones.map((perf) => perf.category))], [perfusiones]);
  const fluidTypes = useMemo(() => [...new Set(fluidos.map((fluid) => fluid.type))], [fluidos]);

  const filteredDrugs = useMemo(() => {
    const items = activeCategory ? drugs.filter((drug) => drug.category === activeCategory) : drugs;
    return [...items].sort((left, right) => left.name.localeCompare(right.name, "es", { sensitivity: "base" }));
  }, [activeCategory, drugs]);

  const filteredPerfusions = useMemo(() => {
    const items = activeCategory ? perfusiones.filter((perf) => perf.category === activeCategory) : perfusiones;
    return [...items].sort((left, right) => left.drug.localeCompare(right.drug, "es", { sensitivity: "base" }));
  }, [activeCategory, perfusiones]);

  const filteredFluids = useMemo(() => {
    const items = activeCategory ? fluidos.filter((fluid) => fluid.type === activeCategory) : fluidos;
    return [...items].sort((left, right) => left.name.localeCompare(right.name, "es", { sensitivity: "base" }));
  }, [activeCategory, fluidos]);

  const normalizedCommercials = useMemo(() => {
    const seen = new Set<string>();
    const rows = [
      ...comerciales,
      ...drugs
        .filter((drug) => !comerciales.some((row) => row.drugId === drug.id))
        .map((drug) => ({
          drugId: drug.id,
          activeIngredient: drug.name,
          presentation: drug.presentation,
          brandNames: drug.synonyms.length > 0 ? drug.synonyms : [drug.name],
        })),
    ];

    return rows.filter((row) => {
      if (seen.has(row.drugId)) return false;
      seen.add(row.drugId);
      return true;
    });
  }, [comerciales, drugs]);

  const filteredCommercials = useMemo(
    () => [...normalizedCommercials].sort((left, right) => left.activeIngredient.localeCompare(right.activeIngredient, "es", { sensitivity: "base" })),
    [normalizedCommercials],
  );

  const drugSections = useMemo(() => buildAlphabetSections(filteredDrugs, (drug) => drug.name), [filteredDrugs]);
  const commercialSections = useMemo(
    () => buildAlphabetSections(filteredCommercials, (row) => row.activeIngredient),
    [filteredCommercials],
  );

  const alphabetSections = useMemo(
    () => (tab === "farmacos" ? drugSections : tab === "comerciales" ? commercialSections : []),
    [commercialSections, drugSections, tab],
  );
  const showAlphabetNav = tab === "farmacos" || tab === "comerciales";
  const availableLetters = useMemo(() => new Set(alphabetSections.map((section) => section.key)), [alphabetSections]);
  const displayedActiveLetter =
    showAlphabetNav && activeLetter && availableLetters.has(activeLetter)
      ? activeLetter
      : alphabetSections[0]?.key ?? null;

  const categories =
    tab === "farmacos"
      ? drugCategories
      : tab === "perfusiones"
        ? perfCategories
        : tab === "fluidos"
          ? fluidTypes
          : [];

  const resultCount =
    tab === "farmacos"
      ? filteredDrugs.length
      : tab === "perfusiones"
        ? filteredPerfusions.length
        : tab === "fluidos"
          ? filteredFluids.length
          : filteredCommercials.length;

  const totalCount =
    tab === "farmacos"
      ? drugs.length
      : tab === "perfusiones"
        ? perfusiones.length
        : tab === "fluidos"
          ? fluidos.length
          : normalizedCommercials.length;

  const scrollToTop = useCallback(() => {
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const jumpToLetter = useCallback((letter: string) => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const section = container.querySelector<HTMLElement>(`[data-section-key="${letter}"]`);
    if (!section) return;

    const containerTop = container.getBoundingClientRect().top;
    const sectionTop = section.getBoundingClientRect().top;
    container.scrollBy({
      top: sectionTop - containerTop - LETTER_SCROLL_OFFSET,
      behavior: "smooth",
    });
  }, []);

  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    setShowBackToTop(container.scrollTop > 200);

    if (!showAlphabetNav) return;

    const sections = Array.from(container.querySelectorAll<HTMLElement>("[data-letter-section]"));
    if (sections.length === 0) return;

    const containerTop = container.getBoundingClientRect().top;
    let currentSectionKey = sections[0]?.dataset.sectionKey ?? null;

    for (const section of sections) {
      const top = section.getBoundingClientRect().top - containerTop;
      if (top <= LETTER_SCROLL_OFFSET + 8) {
        currentSectionKey = section.dataset.sectionKey ?? currentSectionKey;
      } else {
        break;
      }
    }

    setActiveLetter(currentSectionKey);
  }, [showAlphabetNav]);

  useEffect(() => {
    if (!highlightedDrugId || tab !== "farmacos") return;

    const frame = window.requestAnimationFrame(() => {
      const container = scrollContainerRef.current;
      if (!container) return;

      const target = container.querySelector<HTMLElement>(`[data-drug-id="${highlightedDrugId}"]`);
      if (!target) return;

      const containerTop = container.getBoundingClientRect().top;
      const targetTop = target.getBoundingClientRect().top;
      container.scrollBy({
        top: targetTop - containerTop - LETTER_SCROLL_OFFSET,
        behavior: "smooth",
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [filteredDrugs, highlightedDrugId, tab]);

  function handleTabChange(nextTab: Tab) {
    setTab(nextTab);
    setActiveCategory(null);
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-border/60 px-4 md:px-6 pt-5 pb-0">
        <div className="flex gap-0 overflow-x-auto -mb-px scrollbar-none">
          {VADEMECUM_TABS.map((tabConfig) => {
            const item = {
              key: tabConfig.key,
              label: tabConfig.label,
              count:
                tabConfig.key === "farmacos"
                  ? drugs.length
                  : tabConfig.key === "perfusiones"
                    ? perfusiones.length
                    : tabConfig.key === "fluidos"
                      ? fluidos.length
                      : normalizedCommercials.length,
              icon:
                tabConfig.key === "perfusiones"
                  ? <Droplets className="h-3.5 w-3.5" />
                  : tabConfig.key === "fluidos"
                    ? <Table2 className="h-3.5 w-3.5" />
                    : tabConfig.key === "comerciales"
                      ? <Tags className="h-3.5 w-3.5" />
                      : null,
              active:
                tabConfig.key === "farmacos"
                  ? "border-current text-primary"
                  : tabConfig.key === "perfusiones"
                    ? "border-blue-500 text-blue-600 dark:text-blue-400"
                    : tabConfig.key === "fluidos"
                      ? "border-cyan-500 text-cyan-700 dark:text-cyan-300"
                      : "border-amber-500 text-amber-700 dark:text-amber-300",
            };

            return (
              <button
                key={item.key}
                onClick={() => handleTabChange(item.key)}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-3 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap",
                  tab === item.key
                    ? item.active
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {item.icon}
                {item.label}
                <span className="text-xs font-normal text-muted-foreground tabular-nums">{item.count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {categories.length > 0 && (
        <div className="px-4 md:px-6 py-3 flex flex-wrap gap-2 items-center border-b border-border/40 bg-muted/10">
          <div className="flex flex-wrap gap-1.5">
            {categories.map((category) => {
              const color = tab === "fluidos" ? getColor("Fluidos IV") : getColor(category);
              return (
                <button
                  key={category}
                  onClick={() => setActiveCategory(activeCategory === category ? null : category)}
                  className={cn(
                    "flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium transition-colors border",
                    activeCategory === category
                      ? `border-transparent ${color.bg} ${color.text}`
                      : "border-border/60 text-muted-foreground hover:border-border hover:text-foreground bg-background",
                  )}
                >
                  <span className={cn("h-1.5 w-1.5 rounded-full flex-shrink-0", color.dot)} />
                  {category}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-y-auto relative"
      >
        {showAlphabetNav && alphabetSections.length > 0 && (
          <AlphabetNav
            activeLetter={displayedActiveLetter}
            availableLetters={availableLetters}
            onSelectLetter={jumpToLetter}
          />
        )}

        <div className="px-4 md:px-6 py-4">
          {resultCount === 0 ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
              Sin resultados
            </div>
          ) : tab === "farmacos" ? (
            <div className="space-y-6">
              {drugSections.map((section) => (
                <section key={section.key} data-letter-section data-section-key={section.key} className="space-y-3 scroll-mt-28">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-sm font-semibold text-foreground">
                      {section.key}
                    </div>
                    <div className="h-px flex-1 bg-border/50" />
                  </div>
                  <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {section.items.map((drug) => (
                      <DrugCard
                        key={`${drug.id}-${highlightedDrugId === drug.id ? "highlighted" : "plain"}`}
                        drug={drug}
                        isHighlighted={highlightedDrugId === drug.id}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : tab === "fluidos" ? (
            <div className="grid gap-3 xl:grid-cols-2">
              {filteredFluids.map((fluid) => (
                <FluidCard key={fluid.id} fluid={fluid} />
              ))}
            </div>
          ) : tab === "comerciales" ? (
            <div className="space-y-6">
              {commercialSections.map((section) => (
                <section key={section.key} data-letter-section data-section-key={section.key} className="space-y-3 scroll-mt-28">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 flex items-center justify-center text-sm font-semibold">
                      {section.key}
                    </div>
                    <div className="h-px flex-1 bg-border/50" />
                  </div>
                  <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {section.items.map((row) => (
                      <CommercialCard key={`${section.key}-${row.drugId}`} row={row} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {filteredPerfusions.map((perf) => (
                <PerfusionCard key={perf.id} perf={perf} />
              ))}
            </div>
          )}
        </div>
      </div>

      {showBackToTop && (
        <button
          onClick={scrollToTop}
          className="fixed bottom-6 right-6 z-50 flex h-9 w-9 items-center justify-center rounded-full bg-background border border-border/60 shadow-md text-muted-foreground hover:text-foreground hover:border-border transition-colors"
          aria-label="Volver al inicio"
        >
          <ChevronUp className="h-4 w-4" />
        </button>
      )}

      <div className="px-4 py-2.5 text-xs text-muted-foreground border-t border-border/30 bg-muted/10 sticky bottom-0">
        {resultCount} de {totalCount}{" "}
        {tab === "farmacos"
          ? "fármacos"
          : tab === "perfusiones"
            ? "perfusiones"
            : tab === "fluidos"
              ? "fluidos"
              : "relaciones comerciales"}
      </div>
    </div>
  );
}

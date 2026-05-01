"use client";

import { useState, useMemo } from "react";
import { Search, X, ChevronDown, ChevronUp, Droplets } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

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

interface Props {
  drugs: Drug[];
  perfusiones: Perfusion[];
}

const CATEGORY_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  "Cardiovascular":        { bg: "bg-red-100 dark:bg-red-900/20",      text: "text-red-700 dark:text-red-300",       dot: "bg-red-500" },
  "Analgesia y Sedación":  { bg: "bg-violet-100 dark:bg-violet-900/20", text: "text-violet-700 dark:text-violet-300", dot: "bg-violet-500" },
  "Respiratorio":          { bg: "bg-sky-100 dark:bg-sky-900/20",       text: "text-sky-700 dark:text-sky-300",       dot: "bg-sky-500" },
  "Metabólico":            { bg: "bg-teal-100 dark:bg-teal-900/20",     text: "text-teal-700 dark:text-teal-300",     dot: "bg-teal-500" },
  "Antídotos":             { bg: "bg-amber-100 dark:bg-amber-900/20",   text: "text-amber-700 dark:text-amber-300",   dot: "bg-amber-500" },
  "Obstétrico":            { bg: "bg-pink-100 dark:bg-pink-900/20",     text: "text-pink-700 dark:text-pink-300",     dot: "bg-pink-500" },
  "Psiquiátrico":          { bg: "bg-purple-100 dark:bg-purple-900/20", text: "text-purple-700 dark:text-purple-300", dot: "bg-purple-500" },
  "Fluidos IV":            { bg: "bg-blue-100 dark:bg-blue-900/20",     text: "text-blue-700 dark:text-blue-300",     dot: "bg-blue-500" },
  "Vasoactivos":           { bg: "bg-red-100 dark:bg-red-900/20",       text: "text-red-700 dark:text-red-300",       dot: "bg-red-500" },
  "Antiarrítmicos":        { bg: "bg-orange-100 dark:bg-orange-900/20", text: "text-orange-700 dark:text-orange-300", dot: "bg-orange-500" },
  "Otros":                 { bg: "bg-slate-100 dark:bg-slate-800",      text: "text-slate-600 dark:text-slate-300",   dot: "bg-slate-400" },
};

function getColor(category: string) {
  return CATEGORY_COLORS[category] ?? CATEGORY_COLORS["Otros"];
}

function normalize(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
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
      <p className="text-sm leading-relaxed">{value}</p>
    </div>
  );
}

function DrugCard({ drug }: { drug: Drug }) {
  const [open, setOpen] = useState(false);
  const color = getColor(drug.category);

  return (
    <div className={cn(
      "rounded-xl border border-border/60 overflow-hidden transition-shadow",
      open && "shadow-md"
    )}>
      <button
        onClick={() => setOpen((v) => !v)}
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
          <p className="text-xs text-muted-foreground mt-0.5 leading-snug line-clamp-1">
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
              {drug.dose.split("\n").map((line, i) => (
                <p key={i} className="text-sm leading-relaxed">{line}</p>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Vía</p>
            <div className="flex gap-1.5 flex-wrap">
              {drug.route.map((r) => <RouteChip key={r} route={r} />)}
            </div>
          </div>
          <InfoRow label="Contraindicaciones" value={drug.contraindications} />
          {drug.notes && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Notas</p>
              <p className="text-sm leading-relaxed text-muted-foreground">{drug.notes}</p>
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
    <div className={cn(
      "rounded-xl border border-border/60 overflow-hidden transition-shadow",
      open && "shadow-md"
    )}>
      <button
        onClick={() => setOpen((v) => !v)}
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
              {perf.rate.split("\n").map((line, i) => (
                <p key={i} className="text-sm leading-relaxed">{line}</p>
              ))}
            </div>
          </div>

          <InfoRow label="Preparación" value={perf.preparation} />

          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Notas</p>
            <p className="text-sm leading-relaxed text-muted-foreground">{perf.notes}</p>
          </div>
        </div>
      )}
    </div>
  );
}

type Tab = "farmacos" | "perfusiones";

export function VademecumView({ drugs, perfusiones }: Props) {
  const [tab, setTab] = useState<Tab>("farmacos");
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const drugCategories = useMemo(() => [...new Set(drugs.map((d) => d.category))], [drugs]);
  const perfCategories = useMemo(() => [...new Set(perfusiones.map((p) => p.category))], [perfusiones]);

  const filteredDrugs = useMemo(() => {
    let items = drugs;
    if (activeCategory) items = items.filter((d) => d.category === activeCategory);
    if (query.trim().length >= 1) {
      const q = normalize(query);
      items = items.filter(
        (d) =>
          normalize(d.name).includes(q) ||
          d.synonyms.some((s) => normalize(s).includes(q)) ||
          normalize(d.indication).includes(q) ||
          normalize(d.subcategory).includes(q) ||
          normalize(d.category).includes(q)
      );
    }
    return items;
  }, [drugs, query, activeCategory]);

  const filteredPerf = useMemo(() => {
    let items = perfusiones;
    if (activeCategory) items = items.filter((p) => p.category === activeCategory);
    if (query.trim().length >= 1) {
      const q = normalize(query);
      items = items.filter(
        (p) =>
          normalize(p.drug).includes(q) ||
          normalize(p.indication).includes(q) ||
          normalize(p.category).includes(q) ||
          normalize(p.recipe).includes(q)
      );
    }
    return items;
  }, [perfusiones, query, activeCategory]);

  const categories = tab === "farmacos" ? drugCategories : perfCategories;
  const resultCount = tab === "farmacos" ? filteredDrugs.length : filteredPerf.length;
  const totalCount = tab === "farmacos" ? drugs.length : perfusiones.length;

  function handleTabChange(t: Tab) {
    setTab(t);
    setActiveCategory(null);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="border-b border-border/60 px-4 md:px-6 pt-5 pb-0">
        <div className="flex gap-0 -mb-px">
          <button
            onClick={() => handleTabChange("farmacos")}
            className={cn(
              "px-4 py-3 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap",
              tab === "farmacos"
                ? "border-current text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            Fármacos
            <span className="ml-1.5 text-xs font-normal text-muted-foreground tabular-nums">{drugs.length}</span>
          </button>
          <button
            onClick={() => handleTabChange("perfusiones")}
            className={cn(
              "flex items-center gap-1.5 px-4 py-3 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap",
              tab === "perfusiones"
                ? "border-blue-500 text-blue-600 dark:text-blue-400"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <Droplets className="h-3.5 w-3.5" />
            Perfusiones
            <span className="text-xs font-normal text-muted-foreground tabular-nums">{perfusiones.length}</span>
          </button>
        </div>
      </div>

      {/* Search + category filters */}
      <div className="px-4 md:px-6 py-3 flex flex-wrap gap-2 items-center border-b border-border/40 bg-muted/10">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tab === "farmacos" ? "Nombre, indicación..." : "Fármaco, indicación..."}
            className="pl-8 h-8 text-sm bg-background"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {categories.map((cat) => {
            const color = getColor(cat);
            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
                className={cn(
                  "flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium transition-colors border",
                  activeCategory === cat
                    ? `border-transparent ${color.bg} ${color.text}`
                    : "border-border/60 text-muted-foreground hover:border-border hover:text-foreground bg-background"
                )}
              >
                <span className={cn("h-1.5 w-1.5 rounded-full flex-shrink-0", color.dot)} />
                {cat}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-4 md:px-6 py-4">
        {resultCount === 0 ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
            Sin resultados
          </div>
        ) : tab === "farmacos" ? (
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {filteredDrugs.map((drug) => (
              <DrugCard key={drug.id} drug={drug} />
            ))}
          </div>
        ) : (
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {filteredPerf.map((perf) => (
              <PerfusionCard key={perf.id} perf={perf} />
            ))}
          </div>
        )}
      </div>

      <div className="px-4 py-2.5 text-xs text-muted-foreground border-t border-border/30 bg-muted/10 sticky bottom-0">
        {resultCount} de {totalCount} {tab === "farmacos" ? "fármacos" : "perfusiones"}
      </div>
    </div>
  );
}

"use client";

import { useState, useMemo } from "react";
import { Search, X, Globe } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { extractCodeFamily } from "@/lib/manual-data";

interface Code {
  code: string;
  name: string;
  category: string;
  description: string;
}

interface Props {
  incidente: Code[];
  sva: Code[];
  svb: Code[];
  upsi: Code[];
  pc: Code[];
  icao: Code[];
  comms: Code[];
}

const TABS = [
  { key: "incidente", label: "Incidente", color: "#d97706", pill: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300", text: "text-amber-700 dark:text-amber-400" },
  { key: "sva",       label: "SVA",       color: "#dc2626", pill: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",       text: "text-red-700 dark:text-red-400" },
  { key: "svb",       label: "SVB",       color: "#2563eb", pill: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",   text: "text-blue-700 dark:text-blue-400" },
  { key: "upsi",      label: "UPSI",      color: "#059669", pill: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300", text: "text-emerald-700 dark:text-emerald-400" },
  { key: "pc",        label: "PC/Lima",   color: "#7c3aed", pill: "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300", text: "text-violet-700 dark:text-violet-400" },
  { key: "comms",     label: "Comms",     color: "#ea580c", pill: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300", text: "text-orange-700 dark:text-orange-400" },
  { key: "icao",      label: "ICAO",      color: "#0284c7", pill: "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300",       text: "text-sky-700 dark:text-sky-400" },
] as const;

type TabKey = typeof TABS[number]["key"];

function normalize(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function matchesQuery(code: Code, q: string): boolean {
  return (
    normalize(code.code).includes(q) ||
    normalize(code.name).includes(q) ||
    normalize(code.description).includes(q) ||
    normalize(code.category).includes(q)
  );
}

interface GlobalResult extends Code {
  tabKey: TabKey;
  tabLabel: string;
  tabPill: string;
}

const FAMILY_LABELS: Partial<Record<TabKey, Record<string, string>>> = {
  incidente: {
    "1": "Accidentes de tráfico",
    "2": "Traumáticos",
    "3": "Enfermedad / Patología",
    "4": "Bomberos / especiales",
    "5": "Judicial / social",
    "6": "Ubicación",
    "7": "Especial / masivos",
    "8": "Despliegue operativo",
    "9": "Donante",
    "10": "Actuación conjunta",
    "11": "Código infarto",
    "13": "Código 13",
    "15": "Politrauma",
    "16": "SCASEST",
    "18": "Sepsis",
    "19": "TEP",
    "33": "Síncope post esfuerzo",
  },
  sva: {
    C: "Cardiovasculares",
    R: "Respiratorios",
    N: "Neurológicos",
    X: "Intoxicaciones",
    A: "Anafilaxia",
    PS: "Psiquiátricos",
    E: "Endocrino-metabólicos",
    F: "Agentes físicos",
    W: "Cierres y no asistenciales",
    T: "Traumáticos",
  },
  svb: {
    C: "Cardiovasculares",
    R: "Respiratorios",
    N: "Neurológicos",
    D: "Digestivos",
    G: "Gineco-obstétricos",
    F: "Agentes físicos",
    I: "Intoxicaciones",
    PS: "Psiquiátricos",
    M: "Miscelánea",
    W: "Cierres y no asistenciales",
    T: "Traumáticos",
  },
};

function getFamilyMeta(tabKey: TabKey, code: string) {
  const family = extractCodeFamily(code);
  const label = FAMILY_LABELS[tabKey]?.[family] ?? `Familia ${family}`;
  return { family, label };
}

export function CodigosView({ incidente, sva, svb, upsi, pc, icao, comms }: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>("incidente");
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [globalSearch, setGlobalSearch] = useState(false);

  const dataMap = useMemo<Record<TabKey, Code[]>>(
    () => ({ incidente, sva, svb, upsi, pc, icao, comms }),
    [comms, icao, incidente, pc, sva, svb, upsi],
  );
  const currentData = useMemo(() => dataMap[activeTab] ?? [], [activeTab, dataMap]);
  const tabInfo = TABS.find((t) => t.key === activeTab)!;

  const categories = useMemo(
    () => [...new Set(currentData.map((c) => c.category))],
    [currentData]
  );

  // Local filtered results
  const localFiltered = useMemo(() => {
    let items = currentData;
    if (activeCategory) items = items.filter((c) => c.category === activeCategory);
    if (query.trim().length >= 1) {
      const q = normalize(query);
      items = items.filter((c) => matchesQuery(c, q));
    }
    return items;
  }, [currentData, query, activeCategory]);

  // Global search results (across all tabs)
  const globalResults = useMemo((): GlobalResult[] => {
    if (!globalSearch || query.trim().length < 1) return [];
    const q = normalize(query);
    const results: GlobalResult[] = [];
    for (const tab of TABS) {
      for (const code of dataMap[tab.key]) {
        if (matchesQuery(code, q)) {
          results.push({ ...code, tabKey: tab.key, tabLabel: tab.label, tabPill: tab.pill });
        }
      }
    }
    return results;
  }, [globalSearch, query, dataMap]);

  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      <div className="border-b border-border/60 px-4 md:px-6 pt-5 pb-0">
        <div className="flex gap-0 overflow-x-auto -mb-px scrollbar-none">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => {
                setActiveTab(tab.key);
                setActiveCategory(null);
                setGlobalSearch(false);
              }}
              className={cn(
                "flex items-center gap-1.5 px-4 py-3 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap",
                activeTab === tab.key && !globalSearch
                  ? `border-current ${tab.text}`
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: tab.color }} />
              {tab.label}
              <span className="text-xs font-normal text-muted-foreground tabular-nums">
                {dataMap[tab.key].length}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Search bar */}
      <div className="px-4 md:px-6 py-3 flex flex-wrap gap-2 items-center border-b border-border/40 bg-muted/10">
        <div className="relative flex-1 min-w-[180px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={globalSearch ? "Buscar en todos los tabs…" : `Buscar en ${tabInfo.label}…`}
            className="pl-8 h-8 text-sm bg-background"
          />
          {query && (
            <button onClick={() => setQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Global/Local toggle */}
        <button
          onClick={() => { setGlobalSearch((v) => !v); setActiveCategory(null); }}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors",
            globalSearch
              ? "bg-primary text-primary-foreground border-primary"
              : "border-border/60 text-muted-foreground hover:border-border hover:text-foreground bg-background"
          )}
          title={globalSearch ? "Búsqueda global activa" : "Activar búsqueda global"}
        >
          <Globe className="h-3.5 w-3.5" />
          Global
        </button>

        {/* Category chips — only in local mode */}
        {!globalSearch && (
          <div className="flex flex-wrap gap-1.5">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
                className={cn(
                  "text-xs px-2.5 py-1 rounded-full font-medium transition-colors border",
                  activeCategory === cat
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border/60 text-muted-foreground hover:border-border hover:text-foreground bg-background"
                )}
              >
                {cat}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Results */}
      <div className="flex-1 overflow-auto">
        {globalSearch && query.trim().length >= 1 ? (
          // Global results grouped by tab
          globalResults.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">Sin resultados</div>
          ) : (
            <div>
              {TABS.map((tab) => {
                const tabResults = globalResults.filter((r) => r.tabKey === tab.key);
                if (tabResults.length === 0) return null;
                return (
                  <div key={tab.key}>
                    <div className="sticky top-0 px-4 md:px-6 py-2 bg-muted/60 backdrop-blur-sm border-b border-border/30 flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ background: tab.color }} />
                      <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{tab.label}</span>
                      <span className="text-xs text-muted-foreground ml-1 tabular-nums">{tabResults.length}</span>
                    </div>
                    <CodeList codes={tabResults} tabPill={tab.pill} tabKey={tab.key} />
                  </div>
                );
              })}
            </div>
          )
        ) : (
          // Local tab results
          localFiltered.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">Sin resultados</div>
          ) : (
            <CodeList codes={localFiltered} tabPill={tabInfo.pill} tabKey={tabInfo.key} />
          )
        )}

        <div className="px-4 py-2.5 text-xs text-muted-foreground border-t border-border/30 bg-muted/10 sticky bottom-0">
          {globalSearch && query.trim().length >= 1
            ? `${globalResults.length} resultados en todos los tabs`
            : `${localFiltered.length} de ${currentData.length} en ${tabInfo.label}`}
        </div>
      </div>
    </div>
  );
}

function CodeList({
  codes, tabPill, tabKey,
}: {
  codes: (Code & { tabKey?: string; tabPill?: string })[];
  tabPill: string;
  tabKey: string;
}) {
  const grouped = codes.reduce<Record<string, { label: string; items: (Code & { tabKey?: string; tabPill?: string })[] }>>((acc, code) => {
    const { family, label } = getFamilyMeta(tabKey as TabKey, code.code);
    if (!acc[family]) {
      acc[family] = { label, items: [] };
    }
    acc[family].items.push(code);
    return acc;
  }, {});

  return (
    <div>
      {Object.entries(grouped).map(([family, group]) => (
        <section key={family} className="border-b border-border/30">
          <div className="sticky top-0 z-10 border-b border-border/40 bg-background/95 px-4 py-3 backdrop-blur-md md:px-6">
            <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-muted/25 px-3 py-2 shadow-sm">
              <span className={cn("rounded-full px-2.5 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.18em]", tabPill)}>
                {family}
              </span>
              <span className="text-sm font-semibold">{group.label}</span>
              <span className="text-xs text-muted-foreground tabular-nums">{group.items.length}</span>
            </div>
          </div>

          <div className="divide-y divide-border/20">
            {group.items.map((code, i) => {
              const pill = code.tabPill ?? tabPill;

              return (
                <div key={`${tabKey}-${family}-${code.code}-${i}`} className="px-4 py-3.5 transition-colors hover:bg-muted/20 md:px-6">
                  <div className="flex items-start gap-3 text-left">
                    <span className={cn(
                      "font-mono font-bold text-sm px-2.5 py-1 rounded-lg flex-shrink-0 min-w-[4.2rem] text-center tabular-nums",
                      pill,
                    )}>
                      {code.code}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold leading-snug">{code.name}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                          {group.label}
                        </span>
                        <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full inline-flex flex-shrink-0 whitespace-nowrap">
                          {code.category}
                        </span>
                      </div>
                      {code.description && (
                        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                          {code.description}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

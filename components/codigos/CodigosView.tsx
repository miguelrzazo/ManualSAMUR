"use client";

import { useState, useMemo } from "react";
import { Search, X, Globe, FileX, MapPin, Navigation } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { extractCodeFamily } from "@/lib/manual-data";

// ─── Types ──────────────────────────────────────────────────────────────────

interface Code {
  code: string;
  name: string;
  category: string;
  description?: string;
  noReport?: boolean;
}

interface Indicativo {
  code: string;
  name: string;
  group: string;
}

interface Base {
  id: string;
  number: number;
  name: string;
  district: string;
  address: string;
  lat: number;
  lng: number;
}

interface Hospital {
  id: string;
  name: string;
  shortName: string;
  address: string;
  district: string;
  status4?: number | null;
}

interface Props {
  incidente: Code[];
  sva: Code[];
  svb: Code[];
  upsi: Code[];
  icao: { code: string; name: string }[];
  indicativos: Indicativo[];
  claves: Code[];
  bases: Base[];
  hospitals: Hospital[];
  status4: { status: number; hospitalId: string | null }[];
  lima: Code[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

type TopTabKey = "incidente" | "svb" | "sva" | "upsi" | "upsq" | "otros";

const TOP_TABS: Array<{ key: TopTabKey; label: string; color: string; pill: string; text: string; placeholder?: boolean }> = [
  { key: "incidente", label: "Incidente", color: "#d97706", pill: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300", text: "text-amber-700 dark:text-amber-400" },
  { key: "svb",       label: "SVB",       color: "#2563eb", pill: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",   text: "text-blue-700 dark:text-blue-400" },
  { key: "sva",       label: "SVA",       color: "#dc2626", pill: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",       text: "text-red-700 dark:text-red-400" },
  { key: "upsi",      label: "UPSI",      color: "#059669", pill: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300", text: "text-emerald-700 dark:text-emerald-400" },
  { key: "upsq",      label: "UPSQ",      color: "#94a3b8", pill: "bg-slate-100 text-slate-600 dark:bg-slate-800/50 dark:text-slate-400", text: "text-slate-500 dark:text-slate-400", placeholder: true },
  { key: "otros",     label: "Otros",     color: "#7c3aed", pill: "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300", text: "text-violet-700 dark:text-violet-400" },
];

type OtrosTabKey = "icao" | "indicativos" | "claves" | "bases" | "hospitales" | "tetra" | "comunicaciones" | "distritos" | "lima";

const OTROS_TABS: Array<{ key: OtrosTabKey; label: string }> = [
  { key: "icao",          label: "ICAO" },
  { key: "indicativos",   label: "Indicativos" },
  { key: "claves",        label: "Claves" },
  { key: "bases",         label: "Bases" },
  { key: "hospitales",    label: "Hospitales" },
  { key: "tetra",         label: "TETRA" },
  { key: "comunicaciones", label: "Comunicaciones" },
  { key: "distritos",     label: "Distritos" },
  { key: "lima",          label: "Lima" },
];

// Per-family colors for SVA/SVB
const FAMILY_COLORS: Record<string, { pill: string; text: string; dot: string }> = {
  C:  { pill: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",           text: "text-red-700 dark:text-red-400",       dot: "#dc2626" },
  R:  { pill: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",       text: "text-blue-700 dark:text-blue-400",     dot: "#2563eb" },
  N:  { pill: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",   text: "text-amber-700 dark:text-amber-400",   dot: "#d97706" },
  T:  { pill: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300", text: "text-orange-700 dark:text-orange-400", dot: "#ea580c" },
  X:  { pill: "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300", text: "text-violet-700 dark:text-violet-400", dot: "#7c3aed" },
  I:  { pill: "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300", text: "text-violet-700 dark:text-violet-400", dot: "#7c3aed" },
  A:  { pill: "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300",       text: "text-teal-700 dark:text-teal-400",     dot: "#0d9488" },
  PS: { pill: "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300",       text: "text-pink-700 dark:text-pink-400",     dot: "#db2777" },
  E:  { pill: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300", text: "text-emerald-700 dark:text-emerald-400", dot: "#059669" },
  F:  { pill: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300", text: "text-yellow-700 dark:text-yellow-400", dot: "#ca8a04" },
  W:  { pill: "bg-slate-100 text-slate-600 dark:bg-slate-800/50 dark:text-slate-400",   text: "text-slate-600 dark:text-slate-400",   dot: "#64748b" },
  D:  { pill: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",   text: "text-green-700 dark:text-green-400",   dot: "#16a34a" },
  G:  { pill: "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300",       text: "text-rose-700 dark:text-rose-400",     dot: "#e11d48" },
  M:  { pill: "bg-gray-100 text-gray-700 dark:bg-gray-800/50 dark:text-gray-300",       text: "text-gray-600 dark:text-gray-400",     dot: "#6b7280" },
};

const FAMILY_LABELS: Partial<Record<TopTabKey, Record<string, string>>> = {
  incidente: {
    "1": "Accidentes de tráfico", "2": "Traumáticos", "3": "Enfermedad / Patología",
    "4": "Bomberos / especiales", "5": "Judicial / social", "6": "Ubicación",
    "7": "Especial / masivos", "8": "Despliegue operativo", "9": "Donante",
    "10": "Actuación conjunta", "11": "Código infarto", "13": "Código 13",
    "15": "Politrauma", "16": "SCASEST", "18": "Sepsis", "19": "TEP",
    "33": "Síncope post esfuerzo",
  },
  sva: {
    C: "Cardiovasculares", R: "Respiratorios", N: "Neurológicos", X: "Intoxicaciones",
    A: "Anafilaxia", PS: "Psiquiátricos", E: "Endocrino-metabólicos",
    F: "Agentes físicos", W: "Cierres y no asistenciales", T: "Traumáticos",
  },
  svb: {
    C: "Cardiovasculares", R: "Respiratorios", N: "Neurológicos", D: "Digestivos",
    G: "Gineco-obstétricos", F: "Agentes físicos", I: "Intoxicaciones",
    PS: "Psiquiátricos", M: "Miscelánea", W: "Cierres y no asistenciales", T: "Traumáticos",
  },
};

const DISTRICT_NUM: Record<string, number> = {
  "Centro": 1, "Arganzuela": 2, "Retiro": 3, "Salamanca": 4, "Chamartín": 5,
  "Tetuán": 6, "Chamberí": 7, "Fuencarral-El Pardo": 8, "Moncloa-Aravaca": 9,
  "Latina": 10, "Carabanchel": 11, "Usera": 12, "Puente de Vallecas": 13,
  "Moratalaz": 14, "Ciudad Lineal": 15, "Hortaleza": 16, "Villaverde": 17,
  "Villa de Vallecas": 18, "Vicálvaro": 19, "San Blas-Canillejas": 20, "Barajas": 21,
};

const HOSPITAL_ACCESS: Record<string, string> = {
  HCO: "Av. Reyes Católicos, 2",
  HGM: "C/ Ibiza, 47",
  HDO: "Glorieta de Málaga",
  HCL: "C/ Prof. Martín Lagos, s/n",
  HLP: "Paseo de la Castellana, 261",
  HRC: "C/ San Modesto, 42",
  HPR: "C/ Maldonado, 50",
  HIL: "Av. Gran Vía del Este, 80",
  HGU: "Glorieta del Ejército, 1",
};

const HGU_EXTRA: Hospital = {
  id: "HGU",
  name: "Hospital General Universitario Gómez Ulla / Defensa",
  shortName: "Gómez Ulla",
  address: "Glorieta del Ejército, 1",
  district: "Carabanchel",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalize(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function matchesQuery(code: Code, q: string) {
  return normalize(code.code).includes(q) || normalize(code.name).includes(q) || normalize(code.category).includes(q);
}

function getFamilyMeta(tabKey: TopTabKey, code: string) {
  const family = extractCodeFamily(code);
  const label = FAMILY_LABELS[tabKey]?.[family] ?? `Familia ${family}`;
  return { family, label };
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function CodigosView({ incidente, sva, svb, upsi, icao, indicativos, claves, bases, hospitals, status4, lima }: Props) {
  const [activeTab, setActiveTab] = useState<TopTabKey>("incidente");
  const [activeOtrosTab, setActiveOtrosTab] = useState<OtrosTabKey>("icao");
  const [query, setQuery] = useState("");
  const [otrosQuery, setOtrosQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [globalSearch, setGlobalSearch] = useState(false);

  const codeDataMap = useMemo<Record<string, Code[]>>(
    () => ({ incidente, sva, svb, upsi }),
    [incidente, sva, svb, upsi],
  );

  const isCodeTab = activeTab !== "otros" && activeTab !== "upsq";
  const tabInfo = TOP_TABS.find((t) => t.key === activeTab)!;

  const currentData = useMemo(
    () => (isCodeTab ? codeDataMap[activeTab] ?? [] : []),
    [activeTab, codeDataMap, isCodeTab],
  );

  const perFamilyColor = activeTab === "sva" || activeTab === "svb";
  const groupByCategory = activeTab === "upsi";

  const categories = useMemo(
    () => [...new Set(currentData.map((c) => c.category))],
    [currentData],
  );

  const localFiltered = useMemo(() => {
    let items = currentData;
    if (activeCategory) items = items.filter((c) => c.category === activeCategory);
    if (query.trim().length >= 1) {
      const q = normalize(query);
      items = items.filter((c) => matchesQuery(c, q));
    }
    return items;
  }, [currentData, query, activeCategory]);

  const globalResults = useMemo(() => {
    if (!globalSearch || query.trim().length < 1) return [];
    const q = normalize(query);
    return TOP_TABS.filter((t) => !t.placeholder && t.key !== "otros")
      .flatMap((tab) =>
        (codeDataMap[tab.key] ?? [])
          .filter((c) => matchesQuery(c, q))
          .map((c) => ({ ...c, tabKey: tab.key, tabLabel: tab.label, tabPill: tab.pill })),
      );
  }, [globalSearch, query, codeDataMap]);

  const hasNoReport = perFamilyColor && localFiltered.some((c) => c.noReport);

  const switchTab = (key: TopTabKey) => {
    setActiveTab(key);
    setActiveCategory(null);
    setQuery("");
    setGlobalSearch(false);
  };

  // Hospitales: status4 joined with hospitals, plus HGU
  const hospitalesData = useMemo(() => {
    const byId = Object.fromEntries(hospitals.map((h) => [h.id, h]));
    const rows = status4
      .filter((s) => s.hospitalId)
      .map((s) => ({ ...byId[s.hospitalId!], status4: s.status }))
      .filter(Boolean);
    return [...rows, HGU_EXTRA];
  }, [hospitals, status4]);

  return (
    <div className="flex flex-col h-full">
      {/* ── Top tabs ── */}
      <div className="border-b border-border/60 px-4 md:px-6 pt-5 pb-0">
        <div className="flex gap-0 overflow-x-auto -mb-px scrollbar-none">
          {TOP_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => switchTab(tab.key)}
              className={cn(
                "flex items-center gap-1.5 px-4 py-3 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap",
                activeTab === tab.key
                  ? `border-current ${tab.text}`
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: tab.color }} />
              {tab.label}
              {!tab.placeholder && (
                <span className="text-xs font-normal text-muted-foreground tabular-nums">
                  {(codeDataMap[tab.key] ?? []).length || ""}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Otros sub-tabs ── */}
      {activeTab === "otros" && (
        <div className="border-b border-border/40 px-4 md:px-6 py-2 bg-muted/20">
          <div className="flex gap-1 overflow-x-auto scrollbar-none">
            {OTROS_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => { setActiveOtrosTab(tab.key); setOtrosQuery(""); }}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors",
                  activeOtrosTab === tab.key
                    ? "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Search bar (code tabs only) ── */}
      {isCodeTab && (
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
              <button onClick={() => setQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <button
            onClick={() => { setGlobalSearch((v) => !v); setActiveCategory(null); }}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors",
              globalSearch
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border/60 text-muted-foreground hover:border-border hover:text-foreground bg-background",
            )}
          >
            <Globe className="h-3.5 w-3.5" />
            Global
          </button>
          {!globalSearch && !perFamilyColor && (
            <div className="flex flex-wrap gap-1.5">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
                  className={cn(
                    "text-xs px-2.5 py-1 rounded-full font-medium transition-colors border",
                    activeCategory === cat
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border/60 text-muted-foreground hover:border-border hover:text-foreground bg-background",
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── No-report legend (SVA/SVB only) ── */}
      {perFamilyColor && hasNoReport && (
        <div className="px-4 md:px-6 py-2 flex items-center gap-2 text-xs text-muted-foreground border-b border-border/30 bg-muted/5">
          <FileX className="h-3.5 w-3.5 flex-shrink-0" />
          <span>Los códigos marcados con este icono <strong>no generan informe asistencial</strong></span>
        </div>
      )}

      {/* ── Content ── */}
      <div className="flex-1 overflow-auto">
        {activeTab === "upsq" ? (
          <UpsqPlaceholder />
        ) : activeTab === "otros" ? (
          <OtrosContent
            tab={activeOtrosTab}
            query={otrosQuery}
            setQuery={setOtrosQuery}
            icao={icao}
            indicativos={indicativos}
            claves={claves}
            bases={bases}
            hospitales={hospitalesData}
            lima={lima}
          />
        ) : globalSearch && query.trim().length >= 1 ? (
          globalResults.length === 0 ? (
            <Empty />
          ) : (
            <div>
              {TOP_TABS.filter((t) => !t.placeholder && t.key !== "otros").map((tab) => {
                const rows = globalResults.filter((r) => r.tabKey === tab.key);
                if (!rows.length) return null;
                return (
                  <div key={tab.key}>
                    <div className="sticky top-0 px-4 md:px-6 py-2 bg-muted/60 backdrop-blur-sm border-b border-border/30 flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ background: tab.color }} />
                      <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{tab.label}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">{rows.length}</span>
                    </div>
                    <CodeList codes={rows} tabKey={tab.key as TopTabKey} defaultPill={tab.pill} perFamilyColor={false} groupByCategory={tab.key === "upsi"} />
                  </div>
                );
              })}
            </div>
          )
        ) : localFiltered.length === 0 ? (
          <Empty />
        ) : (
          <CodeList codes={localFiltered} tabKey={activeTab} defaultPill={tabInfo.pill} perFamilyColor={perFamilyColor} groupByCategory={groupByCategory} />
        )}

        {isCodeTab && (
          <div className="px-4 py-2.5 text-xs text-muted-foreground border-t border-border/30 bg-muted/10 sticky bottom-0">
            {globalSearch && query.trim().length >= 1
              ? `${globalResults.length} resultados en todos los tabs`
              : `${localFiltered.length} de ${currentData.length} en ${tabInfo.label}`}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Code List ────────────────────────────────────────────────────────────────

function CodeList({
  codes, tabKey, defaultPill, perFamilyColor, groupByCategory,
}: {
  codes: (Code & { tabKey?: string; tabPill?: string })[];
  tabKey: TopTabKey;
  defaultPill: string;
  perFamilyColor: boolean;
  groupByCategory: boolean;
}) {
  const grouped = useMemo(() => {
    const acc: Record<string, { label: string; items: typeof codes; familyColor?: typeof FAMILY_COLORS[string] }> = {};
    for (const code of codes) {
      let key: string;
      let label: string;
      let familyColor: typeof FAMILY_COLORS[string] | undefined;

      if (groupByCategory) {
        key = code.category;
        label = code.category;
      } else {
        const { family, label: l } = getFamilyMeta(tabKey, code.code);
        key = family;
        label = l;
        if (perFamilyColor) familyColor = FAMILY_COLORS[family];
      }

      if (!acc[key]) acc[key] = { label, items: [], familyColor };
      acc[key].items.push(code);
    }
    return acc;
  }, [codes, tabKey, perFamilyColor, groupByCategory]);

  return (
    <div>
      {Object.entries(grouped).map(([key, group]) => {
        const headerDot = group.familyColor?.dot;
        const headerText = group.familyColor?.text ?? "text-muted-foreground";
        const headerPill = group.familyColor?.pill ?? defaultPill;

        return (
          <section key={key} className="border-b border-border/30">
            <div className="sticky top-0 z-10 border-b border-border/40 bg-background/95 px-4 py-3 backdrop-blur-md md:px-6">
              <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-muted/25 px-3 py-2 shadow-sm">
                {headerDot ? (
                  <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ background: headerDot }} />
                ) : null}
                <span className={cn("rounded-full px-2.5 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.18em]", headerPill)}>
                  {key}
                </span>
                <span className={cn("text-sm font-semibold", headerText)}>{group.label}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{group.items.length}</span>
              </div>
            </div>

            <div className="divide-y divide-border/20">
              {group.items.map((code, i) => {
                const pill = perFamilyColor
                  ? (FAMILY_COLORS[extractCodeFamily(code.code)]?.pill ?? defaultPill)
                  : (code.tabPill ?? defaultPill);

                return (
                  <div key={`${tabKey}-${key}-${code.code}-${i}`} className="px-4 py-3 transition-colors hover:bg-muted/20 md:px-6">
                    <div className="flex items-center gap-3">
                      <span className={cn("font-mono font-bold text-sm px-2.5 py-1 rounded-lg flex-shrink-0 min-w-[4rem] text-center tabular-nums", pill)}>
                        {code.code}
                      </span>
                      {code.noReport && (
                        <FileX className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" aria-label="Sin informe asistencial" />
                      )}
                      <span className="text-sm font-medium leading-snug">{code.name}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

// ─── UPSQ Placeholder ────────────────────────────────────────────────────────

function UpsqPlaceholder() {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-3 text-center px-6">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 dark:bg-slate-800/50 px-3 py-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
        Próximamente
      </span>
      <p className="text-sm text-muted-foreground max-w-xs">
        Los códigos de la Unidad de Psiquiatría (UPSQ) se añadirán próximamente.
      </p>
    </div>
  );
}

// ─── Empty State ─────────────────────────────────────────────────────────────

function Empty() {
  return <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">Sin resultados</div>;
}

// ─── Otros Content ────────────────────────────────────────────────────────────

function OtrosContent({
  tab, query, setQuery, icao, indicativos, claves, bases, hospitales, lima,
}: {
  tab: OtrosTabKey;
  query: string;
  setQuery: (q: string) => void;
  icao: { code: string; name: string }[];
  indicativos: Indicativo[];
  claves: Code[];
  bases: Base[];
  hospitales: Hospital[];
  lima: Code[];
}) {
  const filteredIcao = useMemo(() => {
    if (!query.trim()) return icao;
    const q = normalize(query);
    return icao.filter((i) => normalize(i.code).includes(q) || normalize(i.name).includes(q));
  }, [icao, query]);

  const filteredIndicativos = useMemo(() => {
    if (!query.trim()) return indicativos;
    const q = normalize(query);
    return indicativos.filter((i) => normalize(i.code).includes(q) || normalize(i.name).includes(q));
  }, [indicativos, query]);

  const filteredClaves = useMemo(() => {
    if (!query.trim()) return claves;
    const q = normalize(query);
    return claves.filter((c) => normalize(c.code).includes(q) || normalize(c.name).includes(q));
  }, [claves, query]);

  const filteredHospitales = useMemo(() => {
    if (!query.trim()) return hospitales;
    const q = normalize(query);
    return hospitales.filter((h) => normalize(h.name).includes(q) || normalize(h.shortName ?? "").includes(q) || normalize(h.id).includes(q));
  }, [hospitales, query]);

  const filteredLima = useMemo(() => {
    if (!query.trim()) return lima;
    const q = normalize(query);
    return lima.filter((c) => normalize(c.code).includes(q) || normalize(c.name).includes(q));
  }, [lima, query]);

  const showSearch = ["icao", "indicativos", "claves", "hospitales", "lima"].includes(tab);

  return (
    <div className="flex flex-col h-full">
      {showSearch && (
        <div className="px-4 md:px-6 py-3 border-b border-border/40 bg-muted/10">
          <div className="relative max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Buscar…`}
              className="pl-8 h-8 text-sm bg-background"
            />
            {query && (
              <button onClick={() => setQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-auto">
        {tab === "icao" && <IcaoList items={filteredIcao} />}
        {tab === "indicativos" && <IndicativosList items={filteredIndicativos} />}
        {tab === "claves" && <ClavesList items={filteredClaves} />}
        {tab === "bases" && <BasesList bases={bases} />}
        {tab === "hospitales" && <HospitalesList hospitales={filteredHospitales} />}
        {tab === "tetra" && <TetraContent />}
        {tab === "comunicaciones" && <ComunicacionesContent />}
        {tab === "distritos" && <DistritosContent bases={bases} />}
        {tab === "lima" && <LimaList items={filteredLima} />}
      </div>
    </div>
  );
}

// ─── ICAO List ────────────────────────────────────────────────────────────────

function IcaoList({ items }: { items: { code: string; name: string }[] }) {
  return (
    <div className="divide-y divide-border/20">
      {items.map((item) => (
        <div key={item.code} className="flex items-center gap-4 px-4 md:px-6 py-3 hover:bg-muted/20 transition-colors">
          <span className="font-mono font-bold text-base w-10 text-center flex-shrink-0 bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300 rounded-lg px-2 py-0.5">
            {item.code}
          </span>
          <span className="text-sm font-medium">{item.name}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Indicativos List ─────────────────────────────────────────────────────────

function IndicativosList({ items }: { items: Indicativo[] }) {
  const grouped = useMemo(() => {
    const acc: Record<string, Indicativo[]> = {};
    for (const item of items) {
      (acc[item.group] ??= []).push(item);
    }
    return acc;
  }, [items]);

  return (
    <div>
      {Object.entries(grouped).map(([group, groupItems]) => (
        <section key={group} className="border-b border-border/30">
          <div className="sticky top-0 z-10 border-b border-border/40 bg-background/95 px-4 py-3 backdrop-blur-md md:px-6">
            <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-muted/25 px-3 py-2 shadow-sm">
              <span className="text-sm font-semibold">{group}</span>
              <span className="text-xs text-muted-foreground tabular-nums">{groupItems.length}</span>
            </div>
          </div>
          <div className="divide-y divide-border/20">
            {groupItems.map((item, i) => (
              <div key={`${group}-${i}`} className="flex items-start gap-4 px-4 md:px-6 py-3 hover:bg-muted/20 transition-colors">
                <span className="font-mono font-semibold text-sm flex-shrink-0 min-w-[7rem] text-primary">
                  {item.code}
                </span>
                <span className="text-sm text-muted-foreground leading-snug">{item.name}</span>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

// ─── Claves List ──────────────────────────────────────────────────────────────

function ClavesList({ items }: { items: Code[] }) {
  const grouped = useMemo(() => {
    const acc: Record<string, Code[]> = {};
    for (const item of items) {
      (acc[item.category] ??= []).push(item);
    }
    return acc;
  }, [items]);

  return (
    <div>
      {Object.entries(grouped).map(([cat, catItems]) => (
        <section key={cat} className="border-b border-border/30">
          <div className="sticky top-0 z-10 border-b border-border/40 bg-background/95 px-4 py-3 backdrop-blur-md md:px-6">
            <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-muted/25 px-3 py-2 shadow-sm">
              <span className="text-sm font-semibold">{cat}</span>
              <span className="text-xs text-muted-foreground tabular-nums">{catItems.length}</span>
            </div>
          </div>
          <div className="divide-y divide-border/20">
            {catItems.map((item, i) => (
              <div key={`${cat}-${i}`} className="flex items-center gap-4 px-4 md:px-6 py-3 hover:bg-muted/20 transition-colors">
                <span className="font-mono font-bold text-sm flex-shrink-0 min-w-[4rem] text-center bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300 rounded-lg px-2 py-0.5">
                  {item.code}
                </span>
                <span className="text-sm font-medium">{item.name}</span>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

// ─── Bases List ───────────────────────────────────────────────────────────────

function BasesList({ bases }: { bases: Base[] }) {
  return (
    <div className="divide-y divide-border/20">
      {bases.map((base) => {
        const distNum = DISTRICT_NUM[base.district];
        const mapsUrl = `https://www.google.com/maps?q=${base.lat},${base.lng}`;
        const navUrl = `https://www.google.com/maps/dir/?api=1&destination=${base.lat},${base.lng}`;

        return (
          <div key={base.id} className="flex items-start gap-4 px-4 md:px-6 py-4 hover:bg-muted/20 transition-colors">
            <span className="font-mono font-bold text-sm flex-shrink-0 w-10 text-center bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 rounded-lg px-2 py-1">
              {base.number}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold leading-snug">{base.name}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{base.address}</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {base.district}
                {distNum && (
                  <span className="ml-1 text-[10px] text-muted-foreground/60">(D{distNum})</span>
                )}
              </div>
            </div>
            <div className="flex gap-1.5 flex-shrink-0">
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg border border-border/60 text-muted-foreground hover:text-foreground hover:border-border transition-colors"
                title="Ver en mapa"
              >
                <MapPin className="h-3 w-3" />
              </a>
              <a
                href={navUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg border border-border/60 text-muted-foreground hover:text-foreground hover:border-border transition-colors"
                title="Navegar"
              >
                <Navigation className="h-3 w-3" />
              </a>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Hospitales List ──────────────────────────────────────────────────────────

function HospitalesList({ hospitales }: { hospitales: Hospital[] }) {
  return (
    <div className="divide-y divide-border/20">
      {hospitales.map((h) => {
        const accessAddr = HOSPITAL_ACCESS[h.id] ?? h.address;
        return (
          <div key={h.id} className="flex items-center gap-4 px-4 md:px-6 py-3.5 hover:bg-muted/20 transition-colors">
            <div className="flex-shrink-0 flex flex-col items-center gap-1 w-14">
              <span className="font-mono font-bold text-xs bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300 rounded px-1.5 py-0.5">
                {h.id}
              </span>
              {h.status4 != null ? (
                <span className="text-[10px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 rounded px-1.5 py-0.5 tabular-nums">
                  4+{h.status4}
                </span>
              ) : (
                <span className="text-[10px] text-muted-foreground/50">—</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold leading-snug truncate">{h.name ?? h.shortName}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{accessAddr}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Lima List ────────────────────────────────────────────────────────────────

function LimaList({ items }: { items: Code[] }) {
  const grouped = useMemo(() => {
    const acc: Record<string, Code[]> = {};
    for (const item of items) {
      (acc[item.category] ??= []).push(item);
    }
    return acc;
  }, [items]);

  return (
    <div>
      {Object.entries(grouped).map(([cat, catItems]) => (
        <section key={cat} className="border-b border-border/30">
          <div className="sticky top-0 z-10 border-b border-border/40 bg-background/95 px-4 py-3 backdrop-blur-md md:px-6">
            <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-muted/25 px-3 py-2 shadow-sm">
              <span className="text-sm font-semibold">{cat}</span>
              <span className="text-xs text-muted-foreground tabular-nums">{catItems.length}</span>
            </div>
          </div>
          <div className="divide-y divide-border/20">
            {catItems.map((item, i) => (
              <div key={`${cat}-${i}`} className="flex items-center gap-3 px-4 md:px-6 py-3 hover:bg-muted/20 transition-colors">
                <span className="font-mono font-bold text-sm flex-shrink-0 min-w-[5rem] text-center bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300 rounded-lg px-2 py-0.5">
                  {item.code}
                </span>
                <span className="text-sm font-medium">{item.name}</span>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

// ─── TETRA Content ────────────────────────────────────────────────────────────

function TetraContent() {
  const items = [
    {
      title: "Activar localización GPS",
      steps: ["Menú → Ubicación → Interfaz → Activar → Selecc."],
    },
    {
      title: "Pasar a Metro",
      steps: [
        "Paso 1 – Selección de red: Menú → Redes → Selec. Red → Cualquier red → Selecc.",
        "Paso 2 – Selección grupo Metro: Pulsación prolongada botón verde (lateral izquierdo). En pantalla aparecerá METRO / SAMUR MTR si hay cobertura.",
      ],
    },
    {
      title: "Bloquear / Desbloquear teclado",
      steps: ["Tecla Menú + *"],
    },
    {
      title: "Cambiar modo Red (TMO) ↔ Directo (DMO)",
      steps: ["Pulsación prolongada de # ó *"],
    },
    {
      title: 'Llamada privada o "cerrada"',
      steps: [
        "Recepción: Mientras suena el tono de llamada, pulsar el PTT para descolgar.",
        "Emisión: En la pantalla principal teclear el número al que se quiere llamar y pulsar el PTT.",
        "* Solo para los casos descritos en el Manual de Procedimientos.",
      ],
    },
  ];

  return (
    <div className="px-4 md:px-6 py-4 space-y-3">
      {items.map((item) => (
        <div key={item.title} className="rounded-xl border border-border/50 bg-muted/20 px-4 py-3">
          <p className="text-sm font-semibold mb-2">{item.title}</p>
          <div className="space-y-1">
            {item.steps.map((step, i) => (
              <p key={i} className="text-xs text-muted-foreground font-mono leading-relaxed">{step}</p>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Comunicaciones Content ───────────────────────────────────────────────────

function ComunicacionesContent() {
  const frases = [
    {
      title: "Operatividad (Por SAMUR-2)",
      body: "Clave 11, Clave 0, con TETRA 12___ y 12___, Móvil ___.\nNos dirigimos al (preventivo de ______ / retén / otro).\n[Estaremos ubicados en __] [A la escucha en canal SAMUR __]",
    },
    {
      title: "Solicitud Clave 16 de SVA (Por SAMUR-1)",
      body: "Solicito Clave 16 de SVA para (sexo) (edad) por (motivo principal)\n(FR), (SpO₂), (FC), (TA) y (nivel de consciencia).\n(Si trauma: mecanismo lesional y lesiones principales)\n(Otra información relevante)",
    },
    {
      title: "Paso a Clave 0 — en el lugar (Por SAMUR-3)",
      body: "Clave 0 en el punto.\n[Se hace cargo la SAMUR XXX / 091 / 092 / SAMUR Social / …]\nCódigo final _.__ y código de valoración _.__.__ \n[Otra información relevante]",
    },
    {
      title: "Paso a Clave 0 — en el hospital (Por SAMUR-3)",
      body: "Clave 0 en el hospital ______.\nCódigo final _.__ y código de valoración _.__.__",
    },
    {
      title: "Finalización del servicio",
      body: "En el lugar: Solicitamos Clave 14 [por finalización del evento]\n[, (sin asistencias / con __ asistencias)].\nAl llegar a B0: Clave 12.",
    },
    {
      title: "Estructura de un mensaje de aviso",
      body: "8___ / _.__ / Lugar / __ / XXXXXX / Información / HH:MM / H__\n│     │       │       │    │           │            │       │\n│     │       │       │    │           │            Hora   Hospi ref. pto.\n│     │       │       │    │           Observaciones\n│     │       │       │    Nº de informe\n│     │       │       Distrito\n│     │       Ubicación\n│     Cód. Ini.\nUnidad",
    },
  ];

  const grupos = [
    { grupo: "SAMUR-1", uso: "Operativo ordinario",     indicativo: "—" },
    { grupo: "SAMUR-2", uso: "Operatividad (C11, C12)", indicativo: "Central" },
    { grupo: "SAMUR-3", uso: "Cierres (C0), Traslados (C4)", indicativo: "Central, Base, Eco 0, Lima, Sierra…" },
    { grupo: "SAMUR-XX", uso: "Preventivos, Otros",     indicativo: "—" },
  ];

  const estatus = [
    { num: 1, desc: "Clave 1" },
    { num: 2, desc: "Clave 2 / Solo desde el TETRA del vehículo, sino por voz" },
    { num: 3, desc: "Clave 3" },
    { num: 4, desc: "Clave 4 / Indicar hospital por status o voz por SAMUR-3" },
    { num: 5, desc: "Clave 5" },
    { num: 7, desc: "Aceptar solicitud mensaje Clave Victor o Clave 14" },
    { num: 8, desc: "Rechazar solicitud mensaje Clave Victor o Clave 14" },
    { num: 9, desc: "Paso a Clave 0 después de inoperatividad (C6.1, C22…)" },
  ];

  return (
    <div className="px-4 md:px-6 py-4 space-y-6">
      {/* Frases típicas */}
      <div>
        <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Frases típicas</h3>
        <div className="space-y-2">
          {frases.map((f) => (
            <div key={f.title} className="rounded-xl border border-border/50 bg-muted/20 px-4 py-3">
              <p className="text-sm font-semibold mb-1.5">{f.title}</p>
              <pre className="text-xs text-muted-foreground font-mono whitespace-pre-wrap leading-relaxed">{f.body}</pre>
            </div>
          ))}
        </div>
      </div>

      {/* Grupos de habla */}
      <div>
        <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Asignación de grupos de habla</h3>
        <div className="rounded-xl border border-border/50 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/40 bg-muted/30">
                <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Grupo</th>
                <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Uso</th>
                <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Indicativo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {grupos.map((g) => (
                <tr key={g.grupo} className="hover:bg-muted/20">
                  <td className="px-4 py-2 font-mono font-semibold text-sm">{g.grupo}</td>
                  <td className="px-4 py-2 text-sm text-muted-foreground">{g.uso}</td>
                  <td className="px-4 py-2 text-sm text-muted-foreground">{g.indicativo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Estatus */}
      <div>
        <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Estatus</h3>
        <div className="rounded-xl border border-border/50 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/40 bg-muted/30">
                <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground w-16">Estatus</th>
                <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Descripción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {estatus.map((e) => (
                <tr key={e.num} className="hover:bg-muted/20">
                  <td className="px-4 py-2">
                    <span className="inline-flex items-center justify-center font-mono font-bold text-sm w-7 h-7 rounded-lg bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                      {e.num}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-sm text-muted-foreground">{e.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Distritos Content ────────────────────────────────────────────────────────

function DistritosContent({ bases }: { bases: Base[] }) {
  const distritos = useMemo(() => {
    const byDistrict: Record<string, Base[]> = {};
    for (const base of bases) {
      (byDistrict[base.district] ??= []).push(base);
    }
    return Object.entries(DISTRICT_NUM)
      .sort(([, a], [, b]) => a - b)
      .map(([name, num]) => ({
        num,
        name,
        bases: (byDistrict[name] ?? []).sort((a, b) => a.number - b.number),
      }));
  }, [bases]);

  return (
    <div className="divide-y divide-border/20">
      {distritos.map(({ num, name, bases: distBases }) => (
        <div key={num} className="px-4 md:px-6 py-4 hover:bg-muted/20 transition-colors">
          <div className="flex items-start gap-3">
            <span className="flex-shrink-0 font-mono font-bold text-xs bg-muted rounded-full w-7 h-7 flex items-center justify-center text-muted-foreground">
              {num}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">{name}</p>
              {distBases.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {distBases.map((b) => {
                    const mapsUrl = `https://www.google.com/maps?q=${b.lat},${b.lng}`;
                    return (
                      <a
                        key={b.id}
                        href={mapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border border-border/60 text-muted-foreground hover:text-foreground hover:border-border transition-colors"
                        title={`Base ${b.number}: ${b.name}`}
                      >
                        <MapPin className="h-2.5 w-2.5" />
                        B{b.number} · {b.name}
                      </a>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground/50 mt-1">Sin bases operativas</p>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

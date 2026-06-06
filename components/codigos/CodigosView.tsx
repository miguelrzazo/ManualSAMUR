"use client";

import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { FileX, Hospital, MapPin, Navigation, Radio } from "lucide-react";
import { BackToTop } from "@/components/shared/BackToTop";
import { cn } from "@/lib/utils";
import { extractCodeFamily } from "@/lib/manual-data";

// ─── Types ──────────────────────────────────────────────────────────────────

interface Code {
  code: string;
  name: string;
  category: string;
  group?: string;
  description?: string;
  noReport?: boolean;
  tetra?: boolean;
  addedAt?: string;
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
  type?: string;
  lat?: number;
  lng?: number;
  status4?: number | null;
}

interface Props {
  incidente: Code[];
  sva: Code[];
  svb: Code[];
  upsi: Code[];
  upsq: Code[];
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
const TOP_TAB_KEYS = new Set<TopTabKey>(["incidente", "svb", "sva", "upsi", "upsq", "otros"]);

const TOP_TABS: Array<{ key: TopTabKey; label: string; color: string; pill: string; text: string; placeholder?: boolean }> = [
  { key: "incidente", label: "Incidente", color: "#d97706", pill: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300", text: "text-amber-700 dark:text-amber-400" },
  { key: "svb",       label: "SVB",       color: "#2563eb", pill: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",   text: "text-blue-700 dark:text-blue-400" },
  { key: "sva",       label: "SVA",       color: "#dc2626", pill: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",       text: "text-red-700 dark:text-red-400" },
  { key: "upsi",      label: "UPSI",      color: "#059669", pill: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300", text: "text-emerald-700 dark:text-emerald-400" },
  { key: "upsq",      label: "UPSQ",      color: "#94a3b8", pill: "bg-slate-100 text-slate-600 dark:bg-slate-800/50 dark:text-slate-400", text: "text-slate-500 dark:text-slate-400" },
  { key: "otros",     label: "Otros",     color: "#7c3aed", pill: "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300", text: "text-violet-700 dark:text-violet-400" },
];

type OtrosTabKey = "icao" | "indicativos" | "claves" | "bases" | "hospitales" | "comunicaciones" | "distritos" | "lima";
const OTROS_TAB_KEYS = new Set<OtrosTabKey>(["icao", "indicativos", "claves", "bases", "hospitales", "comunicaciones", "distritos", "lima"]);

const OTROS_TABS: Array<{ key: OtrosTabKey; label: string }> = [
  { key: "icao",          label: "ICAO" },
  { key: "indicativos",   label: "Indicativos" },
  { key: "claves",        label: "Claves" },
  { key: "bases",         label: "Bases" },
  { key: "hospitales",    label: "Hospitales" },
  { key: "comunicaciones", label: "Comunicaciones" },
  { key: "distritos",     label: "Distritos" },
  { key: "lima",          label: "Lima" },
];

const FAMILY_ORDER: Partial<Record<TopTabKey, string[]>> = {
  svb: ["T", "C", "R", "N", "D", "G", "F", "I", "PS", "M", "W"],
  sva: ["T", "D", "N", "U", "I", "O", "G", "C", "R", "A", "PS", "X", "E", "F", "V", "RR", "M", "W"],
};

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

// Per-category colors for Incidente
const CATEGORY_COLORS: Record<string, { pill: string; text: string; dot: string }> = {
  "Accidentes": { pill: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300", text: "text-red-700 dark:text-red-400", dot: "#dc2626" },
  "Traumáticos": { pill: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300", text: "text-orange-700 dark:text-orange-400", dot: "#ea580c" },
  "Enfermedad": { pill: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300", text: "text-blue-700 dark:text-blue-400", dot: "#2563eb" },
  "Bomberos": { pill: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300", text: "text-amber-700 dark:text-amber-400", dot: "#d97706" },
  "Psiquiátricos": { pill: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300", text: "text-purple-700 dark:text-purple-400", dot: "#9333ea" },
  "Sociosanitario": { pill: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300", text: "text-purple-700 dark:text-purple-400", dot: "#9333ea" },
  "Cadáver": { pill: "bg-slate-100 text-slate-600 dark:bg-slate-800/50 dark:text-slate-400", text: "text-slate-600 dark:text-slate-400", dot: "#64748b" },
  "Psicológicos": { pill: "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300", text: "text-teal-700 dark:text-teal-400", dot: "#0d9488" },
  "URO": { pill: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300", text: "text-yellow-700 dark:text-yellow-400", dot: "#ca8a04" },
  "FOXTROT": { pill: "bg-lime-100 text-lime-800 dark:bg-lime-900/30 dark:text-lime-300", text: "text-lime-700 dark:text-lime-400", dot: "#65a30d" },
  "Eventos especiales": { pill: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300", text: "text-indigo-700 dark:text-indigo-400", dot: "#4338ca" },
  "Recursos solicitados": { pill: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300", text: "text-emerald-700 dark:text-emerald-400", dot: "#059669" },
  "Donante": { pill: "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300", text: "text-pink-700 dark:text-pink-400", dot: "#db2777" },
  "Componente Herido": { pill: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300", text: "text-cyan-700 dark:text-cyan-400", dot: "#0891b2" },
  "Especificos": { pill: "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300", text: "text-violet-700 dark:text-violet-400", dot: "#7c3aed" },
};

const FAMILY_LABELS: Partial<Record<TopTabKey, Record<string, string>>> = {
  incidente: {
    "1": "Accidentes de tráfico", "2": "Traumáticos", "3": "Enfermedad / Patología",
    "4": "Bomberos / especiales", "5": "Sociosanitario", "6": "Cadáver",
    "7": "Especial / masivos", "8": "Programados", "9": "Donante",
    "10": "Componente Herido", "11": "Código infarto", "13": "Código 13",
    "15": "Psicológicos", "16": "URO", "17": "FOXTROT", "18": "Sepsis", "19": "TEP",
    "33": "Síncope post esfuerzo",
  },
  sva: {
    T: "Traumáticos",
    D: "Digestivos",
    N: "Neurológicos",
    U: "Urológicos",
    I: "Infecciosos",
    O: "Obstétricos",
    G: "Ginecológicos",
    C: "Cardiovasculares",
    R: "Respiratorios",
    A: "Anafilaxia",
    PS: "Psiquiátricos",
    X: "Intoxicaciones",
    E: "Endocrino-metabólicos",
    F: "Agentes físicos",
    V: "Oftalmológicas",
    RR: "ORL",
    M: "Miscelánea",
    W: "Otros",
  },
  svb: {
    T: "Traumáticos",
    C: "Cardiovasculares",
    R: "Respiratorios",
    N: "Neurológicos",
    D: "Digestivos",
    G: "Gineco / obstétricos",
    F: "Físicos",
    I: "Intoxicaciones",
    PS: "Psiquiátricos",
    M: "Miscelánea",
    W: "Otros",
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

function getFamilyMeta(tabKey: TopTabKey, code: string) {
  const family = extractCodeFamily(code);
  const label = FAMILY_LABELS[tabKey]?.[family] ?? `Familia ${family}`;
  return { family, label };
}

function getFamilyOrderIndex(tabKey: TopTabKey, family: string) {
  const order = FAMILY_ORDER[tabKey];
  if (!order) return Number.POSITIVE_INFINITY;
  const index = order.indexOf(family);
  return index === -1 ? Number.POSITIVE_INFINITY : index;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function CodigosView({ incidente, sva, svb, upsi, upsq, icao, indicativos, claves, bases, hospitals, status4, lima }: Props) {
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const requestedSubtab = searchParams.get("subtab");
  const highlightedCode = searchParams.get("code");
  const initialTab = requestedTab && TOP_TAB_KEYS.has(requestedTab as TopTabKey)
    ? requestedTab as TopTabKey
    : "incidente";
  const initialSubtab = requestedSubtab && OTROS_TAB_KEYS.has(requestedSubtab as OtrosTabKey)
    ? requestedSubtab as OtrosTabKey
    : "icao";
  const [activeTab, setActiveTab] = useState<TopTabKey>(initialTab);
  const [activeOtrosTab, setActiveOtrosTab] = useState<OtrosTabKey>(initialSubtab);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const jumpToSection = useCallback((key: string) => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const el = container.querySelector(`[data-section-key="${key}"]`) as HTMLElement | null;
    if (!el) return;
    const containerRect = container.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    container.scrollBy({ top: elRect.top - containerRect.top, behavior: "smooth" });
  }, []);

  const codeAnchor = useCallback((code: string) => code.replace(/[^a-z0-9_-]/gi, "_"), []);

  const codeDataMap = useMemo<Record<string, Code[]>>(
    () => ({ incidente, sva, svb, upsi, upsq }),
    [incidente, sva, svb, upsi, upsq],
  );

  const isCodeTab = activeTab !== "otros";
  const tabInfo = TOP_TABS.find((t) => t.key === activeTab)!;

  const currentData = useMemo(
    () => (isCodeTab ? codeDataMap[activeTab] ?? [] : []),
    [activeTab, codeDataMap, isCodeTab],
  );

  const perFamilyColor = activeTab === "sva" || activeTab === "svb";
  const perCategoryColor = activeTab === "incidente";
  const groupByCategory = activeTab === "upsi" || activeTab === "upsq";

  const localFiltered = useMemo(() => {
    if (activeCategory) return currentData.filter((c) => c.category === activeCategory);
    return currentData;
  }, [currentData, activeCategory]);

  const hasNoReport = perFamilyColor && localFiltered.some((c) => c.noReport);

  const jumpGroups = useMemo(() => {
    if (!isCodeTab) return [];
    const seen = new Set<string>();
    const result: { key: string; label: string; pill?: string }[] = [];
    for (const code of localFiltered) {
      let key: string;
      let label: string;
      let pill: string | undefined;
      if (groupByCategory) {
        key = code.category;
        label = code.category;
      } else if (activeTab === "incidente" && code.category === "Especificos") {
        key = "Especificos";
        label = "Especificos";
        pill = CATEGORY_COLORS["Especificos"]?.pill;
      } else {
        const { family, label: familyLabel } = getFamilyMeta(activeTab as TopTabKey, code.code);
        key = family;
        label = familyLabel;
        if (perFamilyColor) pill = FAMILY_COLORS[family]?.pill;
        else if (perCategoryColor && code.category) pill = CATEGORY_COLORS[code.category]?.pill;
      }
      if (!seen.has(key)) {
        seen.add(key);
        result.push({ key, label, pill });
      }
    }
    if (perFamilyColor) {
      result.sort((a, b) => getFamilyOrderIndex(activeTab, a.key) - getFamilyOrderIndex(activeTab, b.key));
    }
    return result;
  }, [localFiltered, isCodeTab, groupByCategory, perFamilyColor, perCategoryColor, activeTab]);

  const switchTab = (key: TopTabKey) => {
    setActiveTab(key);
    setActiveCategory(null);
  };

  useEffect(() => {
    if (requestedTab && TOP_TAB_KEYS.has(requestedTab as TopTabKey)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- keep deep-linked code tabs in sync after client-side navigation.
      setActiveTab(requestedTab as TopTabKey);
      setActiveCategory(null);
    }
    if (requestedSubtab && OTROS_TAB_KEYS.has(requestedSubtab as OtrosTabKey)) {
      setActiveOtrosTab(requestedSubtab as OtrosTabKey);
    }
  }, [requestedSubtab, requestedTab]);

  useEffect(() => {
    if (!highlightedCode) return;
    const anchor = codeAnchor(highlightedCode);
    const tryScroll = (delay: number) =>
      setTimeout(() => {
        const container = scrollContainerRef.current;
        if (!container) return;
        const target = container.querySelector<HTMLElement>(`[data-code-anchor="${anchor}"]`);
        if (!target) return;
        const containerRect = container.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        container.scrollBy({ top: targetRect.top - containerRect.top - 96, behavior: "smooth" });
        target.focus({ preventScroll: true });
      }, delay);
    const t1 = tryScroll(80);
    const t2 = tryScroll(280);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [codeAnchor, highlightedCode, activeTab, activeOtrosTab]);

  // Hospitales: All public hospitals enriched with status4 info, sorted by type and name
  const hospitalesData = useMemo(() => {
    const byId = Object.fromEntries(status4.map((s) => [s.hospitalId, s.status]));
    // Show all public hospitals and all private hospitals, enriched with status4 if available
    const publicHospitals = hospitals.filter((h) => h.type === "public");
    const privateHospitals = hospitals.filter((h) => h.type === "private");
    const allRelevantHospitals = [...publicHospitals, ...privateHospitals];
    
    return allRelevantHospitals
      .map((h) => ({
        ...h,
        status4: byId[h.id] ?? null,
      }))
      .sort((a, b) => {
        // Sort: public first, then private; then by name
        if (a.type !== b.type) {
          return a.type === "public" ? -1 : 1;
        }
        return (a.shortName || a.name).localeCompare(b.shortName || b.name);
      });
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
                onClick={() => setActiveOtrosTab(tab.key)}
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


      {/* ── Content ── */}
      <div id="codigos-scroll" ref={scrollContainerRef} className="flex-1 min-h-0 overflow-y-auto relative">
        {/* ── No-report legend (SVA/SVB only) ── */}
        {perFamilyColor && hasNoReport && (
          <div className="px-4 md:px-6 py-2 flex items-center gap-2 text-xs text-muted-foreground border-b border-border/30 bg-muted/5">
            <FileX className="h-3.5 w-3.5 flex-shrink-0" />
            <span>Los códigos marcados con este icono <strong>no generan informe asistencial</strong></span>
          </div>
        )}
        {/* ── TETRA legend (Incidente only) ── */}
        {activeTab === "incidente" && (
          <div className="px-4 md:px-6 py-2 flex items-center gap-2 text-xs text-muted-foreground border-b border-border/30 bg-muted/5">
            <Radio className="h-3.5 w-3.5 flex-shrink-0 text-sky-500" />
            <span>Transmitir por <strong>TETRA y llamada de voz</strong>, salvo levedad contrastada</span>
          </div>
        )}
        {/* ── Section jump nav (scrolls with content) ── */}
        {isCodeTab && jumpGroups.length > 1 && (
          <div className="px-4 md:px-6 py-2.5 flex flex-wrap gap-1.5 border-b border-border/30">
            {jumpGroups.map((g) => {
              const displayLabel = groupByCategory
                ? g.label
                : perFamilyColor
                  ? g.label
                  : g.key === "Especificos"
                    ? g.label
                    : `${g.key}. ${g.label.split(" ")[0]}`;
                return (
                  <button
                    key={g.key}
                    onClick={() => jumpToSection(g.key)}
                    className={cn(
                      "px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors whitespace-nowrap",
                      g.pill
                        ? g.pill + " hover:opacity-80"
                        : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground",
                    )}
                  >
                    {g.key === "Especificos" ? (
                      "Específicos"
                    ) : (
                      displayLabel
                    )}
                  </button>
                );
            })}
          </div>
        )}

        {activeTab === "otros" ? (
          <OtrosContent
            tab={activeOtrosTab}
            icao={icao}
            indicativos={indicativos}
            claves={claves}
            bases={bases}
            hospitales={hospitalesData}
            lima={lima}
          />
        ) : localFiltered.length === 0 ? (
          <Empty />
        ) : (
          <CodeList
            codes={localFiltered}
            tabKey={activeTab}
            defaultPill={tabInfo.pill}
            perFamilyColor={perFamilyColor}
            groupByCategory={groupByCategory}
            perCategoryColor={perCategoryColor}
            highlightedCode={highlightedCode}
          />
        )}
      </div>

      {/* ── Back to top ── */}
      <BackToTop scrollContainerId="codigos-scroll" />
    </div>
  );
}

// ─── Code List ────────────────────────────────────────────────────────────────

function CodeList({
  codes, tabKey, defaultPill, perFamilyColor, groupByCategory, perCategoryColor = false, highlightedCode,
}: {
  codes: (Code & { tabKey?: string; tabPill?: string })[];
  tabKey: TopTabKey;
  defaultPill: string;
  perFamilyColor: boolean;
  groupByCategory: boolean;
  perCategoryColor?: boolean;
  highlightedCode?: string | null;
}) {
  const grouped = useMemo(() => {
    const acc: Record<string, { label: string; items: typeof codes; familyColor?: typeof FAMILY_COLORS[string]; categoryColor?: typeof CATEGORY_COLORS[string] }> = {};
    for (const code of codes) {
      let key: string;
      let label: string;
      let familyColor: typeof FAMILY_COLORS[string] | undefined;
      let categoryColor: typeof CATEGORY_COLORS[string] | undefined;

      if (groupByCategory) {
        key = code.category;
        label = code.category;
      } else if (tabKey === "incidente" && code.category === "Especificos") {
        key = "Especificos";
        label = "Especificos";
        categoryColor = CATEGORY_COLORS["Especificos"];
      } else {
        const { family, label: l } = getFamilyMeta(tabKey, code.code);
        key = family;
        label = l;
        if (perFamilyColor) familyColor = FAMILY_COLORS[family];
        else if (perCategoryColor && code.category) categoryColor = CATEGORY_COLORS[code.category];
      }

      if (!acc[key]) acc[key] = { label, items: [], familyColor, categoryColor };
      acc[key].items.push(code);
    }
    return acc;
  }, [codes, tabKey, perFamilyColor, groupByCategory, perCategoryColor]);

  return (
    <div>
      {(perFamilyColor
        ? Object.entries(grouped).sort(
          ([keyA], [keyB]) => getFamilyOrderIndex(tabKey, keyA) - getFamilyOrderIndex(tabKey, keyB),
        )
        : Object.entries(grouped)
      ).map(([key, group]) => {
        const headerText = group.categoryColor?.text ?? group.familyColor?.text ?? "text-muted-foreground";
        const headerPill = group.categoryColor?.pill ?? group.familyColor?.pill ?? defaultPill;
        const rows: Array<
          | { type: "subgroup"; title: string }
          | { type: "code"; item: (typeof codes)[number]; isGrouped: boolean }
        > = [];
        let lastSubgroup: string | null = null;

        for (const item of group.items) {
          const subgroup = item.group?.trim();
          if (subgroup && subgroup !== lastSubgroup) {
            rows.push({ type: "subgroup", title: subgroup });
            lastSubgroup = subgroup;
          } else if (!subgroup) {
            lastSubgroup = null;
          }

          const isThreePart = tabKey === "incidente" && item.code.split(".").length > 2;
          rows.push({ type: "code", item, isGrouped: Boolean(subgroup) || isThreePart });
        }

        return (
          <section key={key} data-section-key={key} className="border-b border-border/30">
            <div className="sticky top-0 z-10 border-b border-border/40 bg-background px-4 py-3 md:px-6">
              <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-muted/25 px-3 py-2 shadow-sm">
                {!groupByCategory && (
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.18em]",
                      headerPill,
                    )}
                  >
                    {key === "Especificos" ? (
                      "Específicos"
                    ) : (
                      key
                    )}
                  </span>
                )}
                <span className={cn("text-sm font-semibold", headerText)}>{group.label}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{group.items.length}</span>
              </div>
            </div>

            <div className="divide-y divide-border/20">
              {rows.map((row, i) => {
                if (row.type === "subgroup") {
                  return (
                    <div
                      key={`${tabKey}-${key}-subgroup-${row.title}-${i}`}
                      className="sticky top-[60px] z-[5] px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground bg-background/95 border-b border-border/20 md:px-6"
                    >
                      {row.title}
                    </div>
                  );
                }

                const { item } = row;
                const pill = perFamilyColor
                  ? (FAMILY_COLORS[extractCodeFamily(item.code)]?.pill ?? defaultPill)
                  : perCategoryColor && item.category
                    ? (CATEGORY_COLORS[item.category]?.pill ?? defaultPill)
                    : (item.tabPill ?? defaultPill);
                const highlighted = highlightedCode?.toLowerCase() === item.code.toLowerCase();
                const anchor = item.code.replace(/[^a-z0-9_-]/gi, "_");

                return (
                  <div
                    key={`${tabKey}-${key}-${item.code}-${i}`}
                    tabIndex={highlighted ? 0 : -1}
                    data-code-anchor={anchor}
                    className={cn(
                      "py-3 transition-colors hover:bg-muted/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                      highlighted && "animate-[highlight-fade_3s_ease-out]",
                      row.isGrouped ? "pl-10 pr-4 md:pl-12 md:pr-6" : "px-4 md:px-6",
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <span className={cn("font-mono font-bold text-sm px-2.5 py-1 rounded-lg flex-shrink-0 min-w-[4rem] text-center tabular-nums", pill)}>
                        {item.code}
                      </span>
                      {item.noReport && (
                        <FileX className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" aria-label="Sin informe asistencial" />
                      )}
                      {item.tetra && (
                        <Radio className="h-3.5 w-3.5 flex-shrink-0 text-sky-500" aria-label="Transmitir por TETRA y llamada de voz" />
                      )}
                      <span className="text-sm font-medium leading-snug">{item.name}</span>
                      {item.addedAt && Date.now() - new Date(item.addedAt).getTime() < 30 * 24 * 60 * 60 * 1000 && (
                        <span className="flex-shrink-0 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide animate-in zoom-in-95 fade-in duration-300">
                          Nuevo
                        </span>
                      )}
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

// ─── Empty State ─────────────────────────────────────────────────────────────

function Empty() {
  return <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">Sin resultados</div>;
}

// ─── Otros Content ────────────────────────────────────────────────────────────

function OtrosContent({
  tab, icao, indicativos, claves, bases, hospitales, lima,
}: {
  tab: OtrosTabKey;
  icao: { code: string; name: string }[];
  indicativos: Indicativo[];
  claves: Code[];
  bases: Base[];
  hospitales: Hospital[];
  lima: Code[];
}) {
  const [showPrivateHospitals, setShowPrivateHospitals] = useState(false);

  const filteredIcao = useMemo(() => {
    return icao;
  }, [icao]);

  const filteredIndicativos = useMemo(() => {
    return indicativos.filter((i) => i.group !== "Propios · Bases");
  }, [indicativos]);

  const filteredClaves = useMemo(() => {
    return claves;
  }, [claves]);

  const filteredHospitales = useMemo(() => {
    if (showPrivateHospitals) {
      return hospitales.filter((h) => h.type === "private");
    }
    return hospitales.filter((h) => h.type === "public");
  }, [hospitales, showPrivateHospitals]);

  const filteredLima = useMemo(() => {
    return lima;
  }, [lima]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 min-h-0 overflow-y-auto">
        {tab === "icao" && <IcaoList items={filteredIcao} />}
        {tab === "indicativos" && <IndicativosList items={filteredIndicativos} />}
        {tab === "claves" && <ClavesList items={filteredClaves} />}
        {tab === "bases" && <BasesList bases={bases} />}
        {tab === "hospitales" && (
          <HospitalesList
            allHospitales={hospitales}
            hospitales={filteredHospitales}
            showPrivate={showPrivateHospitals}
            onShowPrivateChange={setShowPrivateHospitals}
          />
        )}
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
  return (
    <div className="divide-y divide-border/20">
      {items.map((item, i) => (
        <div key={`${item.code}-${i}`} className="flex items-center gap-4 px-4 md:px-6 py-3 hover:bg-muted/20 transition-colors">
          <span className="font-mono font-bold text-sm flex-shrink-0 min-w-[4rem] text-center bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300 rounded-lg px-2 py-0.5">
            {item.code}
          </span>
          <span className="text-sm font-medium">{item.name}</span>
        </div>
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

function HospitalesList({
  allHospitales,
  hospitales,
  showPrivate,
  onShowPrivateChange,
}: {
  allHospitales: Hospital[];
  hospitales: Hospital[];
  showPrivate: boolean;
  onShowPrivateChange: (show: boolean) => void;
}) {
  const publicCount = allHospitales.filter((h) => !h.type || h.type === "public").length;
  const privateCount = allHospitales.filter((h) => h.type === "private").length;

  return (
    <div className="flex flex-col h-full">
      {/* Filter buttons */}
      <div className="sticky top-0 z-10 border-b border-border/40 bg-background/95 px-4 md:px-6 py-2.5 backdrop-blur-md flex gap-2">
        <button
          onClick={() => onShowPrivateChange(false)}
          className={cn(
            "px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors",
            !showPrivate
              ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
          )}
        >
          Públicos ({publicCount})
        </button>
        <button
          onClick={() => onShowPrivateChange(true)}
          className={cn(
            "px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors",
            showPrivate
              ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
          )}
        >
          Privados ({privateCount})
        </button>
      </div>

      {/* List */}
      <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-border/20">
        {hospitales.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
            Sin hospitales
          </div>
        ) : (
          hospitales.map((h) => {
            const accessAddr = HOSPITAL_ACCESS[h.id] ?? h.address;
            const mapsUrl = `https://www.google.com/maps?q=${h.lat},${h.lng}`;
            const navUrl = `https://www.google.com/maps/dir/?api=1&destination=${h.lat},${h.lng}`;
            const isPrivate = h.type === "private";
            const badgeBg = isPrivate
              ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
              : "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300";

            return (
              <div key={h.id} className="flex items-start gap-4 px-4 md:px-6 py-3.5 hover:bg-muted/20 transition-colors">
                <div className="flex-shrink-0 flex flex-col items-center gap-1 w-14">
                  <span className={cn("font-mono font-bold text-xs rounded px-1.5 py-0.5", badgeBg)}>
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
                {h.lat && h.lng && (
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
                )}
              </div>
            );
          })
        )}
      </div>
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
    <div className="space-y-3">
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
      {/* TETRA */}
      <div>
        <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Tetra</h3>
        <TetraContent />
      </div>

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

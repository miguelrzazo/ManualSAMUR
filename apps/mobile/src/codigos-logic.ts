/**
 * Pure logic for the Códigos tab. Mirrors the grouping/filtering rules that
 * `components/codigos/CodigosView.tsx` implements for the web, so the native
 * screen shows the *same organisation and the same data* — expressed with
 * native gestures (SectionList, scrollToLocation) instead of a DOM port.
 *
 * Kept free of React Native imports so it can run under plain Node in tests.
 */

export type TopTabKey = "incidente" | "svb" | "sva" | "upsi" | "upsq" | "otros";
export type OtrosTabKey =
  | "icao"
  | "indicativos"
  | "claves"
  | "bases"
  | "hospitales"
  | "comunicaciones"
  | "distritos"
  | "lima";

export interface TopTabMeta {
  key: TopTabKey;
  label: string;
  /** Identity colour for the tab, matching the web's TOP_TABS. */
  color: string;
}

export interface OtrosTabMeta {
  key: OtrosTabKey;
  label: string;
}

export const TOP_TABS: readonly TopTabMeta[] = [
  { key: "incidente", label: "Incidente", color: "#d97706" },
  { key: "svb", label: "SVB", color: "#2563eb" },
  { key: "sva", label: "SVA", color: "#dc2626" },
  { key: "upsi", label: "UPSI", color: "#059669" },
  { key: "upsq", label: "UPSQ", color: "#94a3b8" },
  { key: "otros", label: "Otros", color: "#7c3aed" },
] as const;

export const OTROS_TABS: readonly OtrosTabMeta[] = [
  { key: "icao", label: "ICAO" },
  { key: "indicativos", label: "Indicativos" },
  { key: "claves", label: "Claves" },
  { key: "bases", label: "Bases" },
  { key: "hospitales", label: "Hospitales" },
  { key: "comunicaciones", label: "Comunicaciones" },
  { key: "distritos", label: "Distritos" },
  { key: "lima", label: "Lima" },
] as const;

const CODE_TAB_KEYS = new Set<TopTabKey>(["incidente", "svb", "sva", "upsi", "upsq"]);

export function isCodeTab(tab: TopTabKey): boolean {
  return CODE_TAB_KEYS.has(tab);
}

// ─── Codes (Incidente / SVA / SVB / UPSI / UPSQ) ────────────────────────────

export interface CodigosCode {
  code: string;
  name: string;
  category?: string;
  group?: string;
  description?: string;
  noReport?: boolean;
  tetra?: boolean;
  addedAt?: string;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

export function asCodigosCodes(values: unknown): CodigosCode[] {
  if (!Array.isArray(values)) return [];
  return values
    .map(record)
    .filter((v): v is Record<string, unknown> => Boolean(v))
    .map((v) => ({
      code: typeof v.code === "string" ? v.code : String(v.code ?? ""),
      name: typeof v.name === "string" ? v.name : String(v.name ?? ""),
      category: typeof v.category === "string" ? v.category : undefined,
      group: typeof v.group === "string" ? v.group : undefined,
      description: typeof v.description === "string" ? v.description : undefined,
      noReport: Boolean(v.noReport),
      tetra: Boolean(v.tetra),
      addedAt: typeof v.addedAt === "string" ? v.addedAt : undefined,
    }))
    .filter((c) => c.code.length > 0);
}

/** Leading alphabetic or numeric run of a code — its "family" (e.g. "T.1.1" → "T", "1.1" → "1"). */
export function extractCodeFamily(code: string): string {
  const alpha = code.match(/^([A-Z]+)/);
  if (alpha) return alpha[1];
  const numeric = code.match(/^(\d+)/);
  if (numeric) return numeric[1];
  return code;
}

const FAMILY_ORDER: Partial<Record<TopTabKey, string[]>> = {
  svb: ["T", "C", "R", "N", "D", "G", "F", "I", "PS", "M", "W"],
  sva: ["T", "D", "N", "U", "I", "O", "G", "C", "R", "A", "PS", "X", "E", "F", "V", "RR", "M", "W"],
};

const FAMILY_COLORS: Record<string, string> = {
  C: "#dc2626",
  R: "#2563eb",
  N: "#d97706",
  T: "#ea580c",
  X: "#7c3aed",
  I: "#7c3aed",
  A: "#0d9488",
  PS: "#db2777",
  E: "#059669",
  F: "#ca8a04",
  W: "#64748b",
  D: "#16a34a",
  G: "#e11d48",
  M: "#6b7280",
};

const CATEGORY_COLORS: Record<string, string> = {
  "Accidentes": "#dc2626",
  "Traumáticos": "#ea580c",
  "Enfermedad": "#2563eb",
  "Bomberos": "#d97706",
  "Psiquiátricos": "#9333ea",
  "Sociosanitario": "#9333ea",
  "Cadáver": "#64748b",
  "Psicológicos": "#0d9488",
  "URO": "#ca8a04",
  "FOXTROT": "#65a30d",
  "Eventos especiales": "#4338ca",
  "Recursos solicitados": "#059669",
  "Donante": "#db2777",
  "Componente Herido": "#0891b2",
  "Especificos": "#7c3aed",
};

/**
 * Identity colour for a category. `CATEGORY_COLORS` covers the categories the web app
 * names explicitly; anything else (UPSI/UPSQ carry their own vocabulary) gets a stable
 * colour derived from the name, so a chip is never left uncoloured and never changes
 * colour between launches.
 */
const CATEGORY_FALLBACK_COLORS = ["#0d9488", "#4338ca", "#b45309", "#9333ea", "#0891b2", "#65a30d", "#be123c", "#475569"];

export function categoryAccentColor(category: string): string {
  const named = CATEGORY_COLORS[category];
  if (named) return named;
  let hash = 0;
  for (const character of category) hash = (hash * 31 + character.codePointAt(0)!) >>> 0;
  return CATEGORY_FALLBACK_COLORS[hash % CATEGORY_FALLBACK_COLORS.length];
}

const FAMILY_LABELS: Partial<Record<TopTabKey, Record<string, string>>> = {
  incidente: {
    "1": "Accidentes de tráfico",
    "2": "Traumáticos",
    "3": "Enfermedad / Patología",
    "4": "Bomberos / especiales",
    "5": "Sociosanitario",
    "6": "Cadáver",
    "7": "Especial / masivos",
    "8": "Programados",
    "9": "Donante",
    "10": "Componente Herido",
    "11": "Código infarto",
    "13": "Código 13",
    "15": "Psicológicos",
    "16": "URO",
    "17": "FOXTROT",
    "18": "Sepsis",
    "19": "TEP",
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

export function getFamilyMeta(tabKey: TopTabKey, code: string): { family: string; label: string } {
  const family = extractCodeFamily(code);
  const label = FAMILY_LABELS[tabKey]?.[family] ?? `Familia ${family}`;
  return { family, label };
}

function getFamilyOrderIndex(tabKey: TopTabKey, family: string): number {
  const order = FAMILY_ORDER[tabKey];
  if (!order) return Number.POSITIVE_INFINITY;
  const index = order.indexOf(family);
  return index === -1 ? Number.POSITIVE_INFINITY : index;
}

export function usesFamilyColor(tabKey: TopTabKey): boolean {
  return tabKey === "sva" || tabKey === "svb";
}

export function usesCategoryColor(tabKey: TopTabKey): boolean {
  return tabKey === "incidente";
}

export function groupsByCategory(tabKey: TopTabKey): boolean {
  return tabKey === "upsi" || tabKey === "upsq";
}

/** Distinct `category` values present, in first-seen order — feeds the category filter chips. */
export function uniqueCategories(codes: CodigosCode[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const c of codes) {
    if (c.category && !seen.has(c.category)) {
      seen.add(c.category);
      result.push(c.category);
    }
  }
  return result;
}

export function filterByCategory(codes: CodigosCode[], category: string | null): CodigosCode[] {
  if (!category) return codes;
  return codes.filter((c) => c.category === category);
}

export interface CodigosRow {
  type: "subgroup" | "code";
  id: string;
  title?: string;
  item?: CodigosCode;
  indented?: boolean;
  accentColor?: string;
}

export interface CodigosSection {
  key: string;
  label: string;
  accentColor?: string;
  count: number;
  data: CodigosRow[];
}

/**
 * Groups codes exactly as `CodigosView`'s `CodeList` does: by category for
 * UPSI/UPSQ, by a special "Especificos" bucket plus numeric family for
 * Incidente, and by alpha family (ordered per FAMILY_ORDER) for SVA/SVB.
 * Sub-groups (`item.group`, e.g. "Esguince / torcedura") become non-sticky
 * divider rows inside a section's data, same as the web's inline headers.
 */
export function buildCodeSections(tabKey: TopTabKey, codes: CodigosCode[]): CodigosSection[] {
  const perFamilyColor = usesFamilyColor(tabKey);
  const perCategoryColor = usesCategoryColor(tabKey);
  const groupByCategory = groupsByCategory(tabKey);

  const order: string[] = [];
  const map = new Map<string, { label: string; accentColor?: string; items: CodigosCode[] }>();

  for (const code of codes) {
    let key: string;
    let label: string;
    let accentColor: string | undefined;

    if (groupByCategory) {
      key = code.category ?? "Sin categoría";
      label = key;
      // UPSI/UPSQ group *by* category, so their sections are exactly the categories.
      // They used to be the only sections with no accent, which left their jump chips
      // grey while every other tab's were coloured.
      accentColor = categoryAccentColor(key);
    } else if (tabKey === "incidente" && code.category === "Especificos") {
      key = "Especificos";
      label = "Especificos";
      accentColor = CATEGORY_COLORS["Especificos"];
    } else {
      const meta = getFamilyMeta(tabKey, code.code);
      key = meta.family;
      label = meta.label;
      if (perFamilyColor) accentColor = FAMILY_COLORS[key];
      else if (perCategoryColor && code.category) accentColor = CATEGORY_COLORS[code.category];
    }

    if (!map.has(key)) {
      map.set(key, { label, accentColor, items: [] });
      order.push(key);
    }
    map.get(key)!.items.push(code);
  }

  const keys = perFamilyColor
    ? [...order].sort((a, b) => getFamilyOrderIndex(tabKey, a) - getFamilyOrderIndex(tabKey, b))
    : order;

  return keys.map((key) => {
    const group = map.get(key)!;
    const rows: CodigosRow[] = [];
    let lastSubgroup: string | null = null;

    for (const item of group.items) {
      const subgroup = item.group?.trim();
      if (subgroup && subgroup !== lastSubgroup) {
        rows.push({ type: "subgroup", id: `${key}::sub::${subgroup}`, title: subgroup });
        lastSubgroup = subgroup;
      } else if (!subgroup) {
        lastSubgroup = null;
      }
      const isThreePart = tabKey === "incidente" && item.code.split(".").length > 2;
      rows.push({
        type: "code",
        id: `${key}::${item.code}`,
        item,
        indented: Boolean(subgroup) || isThreePart,
        accentColor: perFamilyColor
          ? FAMILY_COLORS[extractCodeFamily(item.code)]
          : perCategoryColor && item.category
            ? CATEGORY_COLORS[item.category]
            : undefined,
      });
    }

    return {
      key,
      label: key === "Especificos" ? "Específicos" : group.label,
      accentColor: group.accentColor,
      count: group.items.length,
      data: rows,
    };
  });
}

export interface JumpTarget {
  key: string;
  label: string;
  accentColor?: string;
}

/** One chip per section, in the same order the sections render — feeds jump-to-group navigation. */
export function buildJumpTargets(sections: CodigosSection[]): JumpTarget[] {
  return sections.map((s) => ({ key: s.key, label: s.label, accentColor: s.accentColor }));
}

export function hasNoReportCodes(codes: CodigosCode[]): boolean {
  return codes.some((c) => c.noReport);
}

export function hasTetraCodes(codes: CodigosCode[]): boolean {
  return codes.some((c) => c.tetra);
}

/**
 * The two annotations a code list can carry, as data.
 *
 * They used to be two hand-built rows in a `legendBlock` rendered *above* the
 * list, immediately under the category pills — a caveat about a handful of codes
 * occupying the same fold as the screen's primary navigation, on every tab, read
 * once and then in the way forever. They are footnotes, so they are rendered as
 * footnotes now (`ListFooterComponent`), and both share one icon+text treatment
 * rather than reading as two unrelated notices.
 *
 * `icon` names a MaterialCommunityIcons glyph and matches the marker shown on the
 * individual rows the note is about, which is the only thing that connects them.
 */
export interface CodigosLegendNote {
  key: "tetra" | "noReport";
  icon: "radio-handheld" | "file-remove-outline";
  /** Text before the emphasised span. */
  lead: string;
  strong: string;
  /** Text after it. */
  trail: string;
  /** `true` when the note's icon is the app's primary colour on the rows it describes. */
  accented: boolean;
}

export function codeLegendNotes(tabKey: TopTabKey, codes: CodigosCode[]): CodigosLegendNote[] {
  const notes: CodigosLegendNote[] = [];
  if (tabKey === "incidente" && hasTetraCodes(codes)) {
    notes.push({
      key: "tetra",
      icon: "radio-handheld",
      lead: "Transmitir por ",
      strong: "TETRA y llamada de voz",
      trail: ", salvo levedad contrastada",
      accented: true,
    });
  }
  if (usesFamilyColor(tabKey) && hasNoReportCodes(codes)) {
    notes.push({
      key: "noReport",
      icon: "file-remove-outline",
      lead: "Los códigos marcados con este icono ",
      strong: "no generan informe asistencial",
      trail: "",
      accented: false,
    });
  }
  return notes;
}

// ─── Otros: ICAO / Indicativos / Claves / Lima ──────────────────────────────

export interface CodigosIndicativo {
  code: string;
  name: string;
  group: string;
}

export function asCodigosIndicativos(values: unknown): CodigosIndicativo[] {
  if (!Array.isArray(values)) return [];
  return values
    .map(record)
    .filter((v): v is Record<string, unknown> => Boolean(v))
    .map((v) => ({
      code: String(v.code ?? ""),
      name: String(v.name ?? ""),
      group: typeof v.group === "string" ? v.group : "",
    }))
    .filter((i) => i.code.length > 0);
}

/** The web excludes "Propios · Bases" from the Indicativos list (bases have their own subtab). */
export function filterIndicativos(items: CodigosIndicativo[]): CodigosIndicativo[] {
  return items.filter((i) => i.group !== "Propios · Bases");
}

export interface IndicativoGroup {
  group: string;
  items: CodigosIndicativo[];
}

export function groupIndicativos(items: CodigosIndicativo[]): IndicativoGroup[] {
  const order: string[] = [];
  const map = new Map<string, CodigosIndicativo[]>();
  for (const item of items) {
    if (!map.has(item.group)) {
      map.set(item.group, []);
      order.push(item.group);
    }
    map.get(item.group)!.push(item);
  }
  return order.map((group) => ({ group, items: map.get(group)! }));
}

export interface SimpleCode {
  code: string;
  name: string;
  category?: string;
}

export function asSimpleCodes(values: unknown): SimpleCode[] {
  if (!Array.isArray(values)) return [];
  return values
    .map(record)
    .filter((v): v is Record<string, unknown> => Boolean(v))
    .map((v) => ({
      code: String(v.code ?? ""),
      name: String(v.name ?? ""),
      category: typeof v.category === "string" ? v.category : undefined,
    }))
    .filter((i) => i.code.length > 0);
}

export interface CategoryGroup<T> {
  category: string;
  items: T[];
}

export function groupByCategoryField<T extends { category?: string }>(items: T[]): CategoryGroup<T>[] {
  const order: string[] = [];
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = item.category ?? "Sin categoría";
    if (!map.has(key)) {
      map.set(key, []);
      order.push(key);
    }
    map.get(key)!.push(item);
  }
  return order.map((category) => ({ category, items: map.get(category)! }));
}

// ─── Otros: Bases / Distritos ───────────────────────────────────────────────

export interface CodigosBase {
  id: string;
  number: number;
  name: string;
  district: string;
  address: string;
  lat: number;
  lng: number;
}

export function asCodigosBases(values: unknown): CodigosBase[] {
  if (!Array.isArray(values)) return [];
  return values
    .map(record)
    .filter((v): v is Record<string, unknown> => Boolean(v))
    .map((v) => ({
      id: String(v.id ?? ""),
      number: typeof v.number === "number" ? v.number : Number(v.number ?? 0),
      name: String(v.name ?? ""),
      district: typeof v.district === "string" ? v.district : "",
      address: typeof v.address === "string" ? v.address : "",
      lat: typeof v.lat === "number" ? v.lat : Number(v.lat ?? 0),
      lng: typeof v.lng === "number" ? v.lng : Number(v.lng ?? 0),
    }))
    .filter((b) => b.id.length > 0);
}

/** Madrid municipal district numbering, ported from `CodigosView`'s DISTRICT_NUM. */
export const DISTRICT_NUM: Record<string, number> = {
  "Centro": 1,
  "Arganzuela": 2,
  "Retiro": 3,
  "Salamanca": 4,
  "Chamartín": 5,
  "Tetuán": 6,
  "Chamberí": 7,
  "Fuencarral-El Pardo": 8,
  "Moncloa-Aravaca": 9,
  "Latina": 10,
  "Carabanchel": 11,
  "Usera": 12,
  "Puente de Vallecas": 13,
  "Moratalaz": 14,
  "Ciudad Lineal": 15,
  "Hortaleza": 16,
  "Villaverde": 17,
  "Villa de Vallecas": 18,
  "Vicálvaro": 19,
  "San Blas-Canillejas": 20,
  "Barajas": 21,
};

export interface DistrictGroup {
  num: number;
  name: string;
  bases: CodigosBase[];
}

/**
 * "Distritos" is a derived view, not a separate dataset: it groups the same
 * `bases` the Bases subtab shows, ordered by DISTRICT_NUM (mirrors the web's
 * `DistritosContent`, which does the identical grouping over the identical prop).
 */
export function groupBasesByDistrict(bases: CodigosBase[]): DistrictGroup[] {
  const byDistrict = new Map<string, CodigosBase[]>();
  for (const base of bases) {
    const arr = byDistrict.get(base.district) ?? [];
    arr.push(base);
    byDistrict.set(base.district, arr);
  }
  return Object.entries(DISTRICT_NUM)
    .sort(([, a], [, b]) => a - b)
    .map(([name, num]) => ({
      num,
      name,
      bases: (byDistrict.get(name) ?? []).slice().sort((a, b) => a.number - b.number),
    }));
}

// ─── Otros: Hospitales ───────────────────────────────────────────────────────

export interface CodigosHospital {
  id: string;
  name: string;
  shortName: string;
  address: string;
  district: string;
  type?: string;
  lat?: number;
  lng?: number;
}

export function asCodigosHospitals(values: unknown): CodigosHospital[] {
  if (!Array.isArray(values)) return [];
  return values
    .map(record)
    .filter((v): v is Record<string, unknown> => Boolean(v))
    .map((v) => ({
      id: String(v.id ?? ""),
      name: String(v.name ?? ""),
      shortName: typeof v.shortName === "string" ? v.shortName : String(v.name ?? ""),
      address: typeof v.address === "string" ? v.address : "",
      district: typeof v.district === "string" ? v.district : "",
      type: typeof v.type === "string" ? v.type : undefined,
      lat: typeof v.lat === "number" ? v.lat : undefined,
      lng: typeof v.lng === "number" ? v.lng : undefined,
    }))
    .filter((h) => h.id.length > 0);
}

export interface Status4Entry {
  status: number;
  hospitalId: string | null;
  hospitalName?: string | null;
  description?: string;
}

export function asStatus4Entries(values: unknown): Status4Entry[] {
  if (!Array.isArray(values)) return [];
  return values
    .map(record)
    .filter((v): v is Record<string, unknown> => Boolean(v))
    .map((v) => ({
      status: typeof v.status === "number" ? v.status : Number(v.status ?? 0),
      hospitalId: typeof v.hospitalId === "string" ? v.hospitalId : null,
      hospitalName: typeof v.hospitalName === "string" ? v.hospitalName : null,
      description: typeof v.description === "string" ? v.description : undefined,
    }));
}

export interface HospitalWithStatus4 extends CodigosHospital {
  status4: number | null;
}

/** Public hospitals first, then private, each alphabetised — mirrors `hospitalesData` in CodigosView. */
export function buildHospitalList(hospitals: CodigosHospital[], status4: Status4Entry[]): HospitalWithStatus4[] {
  const byId = new Map<string, number>();
  for (const entry of status4) {
    if (entry.hospitalId) byId.set(entry.hospitalId, entry.status);
  }
  const publicHospitals = hospitals.filter((h) => h.type === "public");
  const privateHospitals = hospitals.filter((h) => h.type === "private");
  return [...publicHospitals, ...privateHospitals]
    .map((h) => ({ ...h, status4: byId.get(h.id) ?? null }))
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === "public" ? -1 : 1;
      return (a.shortName || a.name).localeCompare(b.shortName || b.name, "es");
    });
}

// ─── Otros: Comunicaciones (static cheatsheet content, shipped offline) ─────

export interface CheatsheetSection {
  key: string;
  title: string;
  kind: "cards" | "table";
  columns?: string[];
  items: Array<Record<string, string | string[]>>;
}

export function asCheatsheetSections(values: unknown): CheatsheetSection[] {
  if (!Array.isArray(values)) return [];
  return values
    .map(record)
    .filter((v): v is Record<string, unknown> => Boolean(v))
    .map((v) => ({
      key: String(v.key ?? ""),
      title: String(v.title ?? ""),
      kind: (v.kind === "table" ? "table" : "cards") as "cards" | "table",
      columns: Array.isArray(v.columns) ? v.columns.map(String) : undefined,
      items: Array.isArray(v.items) ? (v.items as Array<Record<string, string | string[]>>) : [],
    }))
    .filter((s) => s.key.length > 0);
}

export function getCheatsheetSection(sections: CheatsheetSection[], key: string): CheatsheetSection | undefined {
  return sections.find((s) => s.key === key);
}

/**
 * "Comunicaciones" is static content, not a queryable dataset: the web hardcodes it
 * inline in `ComunicacionesContent`. That same content ships offline in the package
 * under `content.codes.cheatsheet`, generated from `content/data/codigos-cheatsheet.json`
 * (see `lib/mobile-snapshot.ts`) — these are the section keys that make up the tab.
 */
export const COMUNICACIONES_SECTION_KEYS = ["tetra", "plantillas", "grupos", "estatus"] as const;

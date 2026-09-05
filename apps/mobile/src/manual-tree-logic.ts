/**
 * Pure logic for the Inicio manual tree and its offline update history.
 *
 * Mirrors two web modules so the native screen shows the *same organisation
 * and the same data*, expressed with native list virtualisation instead of a
 * DOM tree:
 *  - `lib/manual-data.ts`'s `getProcedureSidebarMeta` (group/subgroup rules
 *    per section, driven by the numeric id prefix) and `lib/content.ts`'s
 *    `getProcedureSidebarSections` (the section → group → subgroup grouping
 *    itself), which together back `components/manual/ProcedureSidebar.tsx`
 *    and `components/manual/ManualHomeClient.tsx`'s desktop explorer tree.
 *  - `lib/manual-updates-logic.ts`'s recency window (`applyRecencyWindow`),
 *    which `ManualHomeClient.tsx` uses to decide the "novedades" bucket.
 *
 * Kept free of React Native imports so it runs under plain Node in tests
 * (see tests/mobile-manual-tree.test.ts).
 */

// ─── Section ordering and grouping rules (mirrors lib/content.ts + lib/manual-data.ts) ──

/** The 9 section values every procedure carries, in the order the web pins them. */
export const MANUAL_SECTIONS_PRIORITY = [
  "SVA",
  "SVB",
  "Operativos",
  "DRP",
  "Intervinientes",
  "Técnicas",
  "Comunicaciones",
  "Psicológicos",
  "Administrativos",
] as const;

/**
 * These 4 sections carry a single "Listado" group/subgroup on the web (see
 * `getProcedureSidebarMeta`), so the web's `ExplorerTree` and `ProcedureSidebar`
 * skip the group/subgroup accordion for them and list procedures directly,
 * sorted numerically. Mirror that here so the native tree doesn't show a
 * pointless single "Procedimientos › Listado" accordion level.
 */
export const MANUAL_FLAT_SECTIONS = new Set(["Administrativos", "Comunicaciones", "DRP", "Intervinientes"]);

/** Identity colour per section, matching the dots in ProcedureSidebar/ManualHomeClient. */
export const MANUAL_SECTION_COLORS: Record<string, string> = {
  SVA: "#dc2626",
  SVB: "#2563eb",
  Operativos: "#d97706",
  DRP: "#ea580c",
  Intervinientes: "#0d9488",
  "Técnicas": "#0891b2",
  Comunicaciones: "#7c3aed",
  "Psicológicos": "#059669",
  Administrativos: "#64748b",
  General: "#64748b",
};

export function manualSectionColor(section: string): string {
  return MANUAL_SECTION_COLORS[section] ?? MANUAL_SECTION_COLORS.General;
}

export interface ManualSidebarMeta {
  group: string;
  subgroup: string;
}

/**
 * Ported verbatim from `lib/manual-data.ts`'s `getProcedureSidebarMeta`. Kept
 * as a straight port (not an import) because that module lives outside
 * apps/mobile and this file must stay importable by the RN bundler and by
 * plain Node test runs without pulling in the web's module graph — the same
 * reasoning `codigos-logic.ts` documents for mirroring `CodigosView.tsx`.
 */
export function manualSidebarMeta(section: string, id: string, title: string): ManualSidebarMeta {
  const normalizedTitle = title.toLowerCase();
  const num = parseInt(id.split("_")[0].replace(/[^0-9]/g, "") || "0", 10);

  switch (section) {
    case "Administrativos":
      return { group: "Procedimientos", subgroup: "Listado" };
    case "Comunicaciones":
      return { group: "Procedimientos", subgroup: "Listado" };
    case "Operativos":
      if (/^217_/.test(id)) return { group: "Coordinación interservicios", subgroup: "Actuaciones conjuntas" };
      if (/^216/i.test(id)) {
        return {
          group: "Riesgo biológico e infeccioso",
          subgroup: normalizedTitle.includes("ébola") || /216[cd]/i.test(id)
            ? "Patógenos de alto riesgo"
            : "Exposiciones biológicas",
        };
      }
      if (num >= 212 && num <= 215) return { group: "Códigos especiales", subgroup: "Protocolos de activación" };
      return { group: "Actuación operativa", subgroup: "Incidentes y coordinación" };
    case "SVA":
      if (num <= 303 || num === 316) return { group: "Soporte vital y vía aérea", subgroup: "Reanimación y vía aérea" };
      if (num === 304) return { group: "Urgencias específicas", subgroup: "Urgencias traumatológicas" };
      if (num === 305) return { group: "Urgencias específicas", subgroup: "Urgencias digestivas" };
      if (num === 306) return { group: "Urgencias específicas", subgroup: "Urgencias neurológicas" };
      if (num === 307) return { group: "Urgencias específicas", subgroup: "Urgencias nefrourológicas" };
      if (num === 308) return { group: "Urgencias específicas", subgroup: "Urgencias obstétricas" };
      if (num === 309) return { group: "Urgencias específicas", subgroup: "Urgencias cardiovasculares" };
      if (num === 310) return { group: "Urgencias específicas", subgroup: "Urgencias respiratorias" };
      if (num === 311 || normalizedTitle.includes("psiqu")) return { group: "Urgencias específicas", subgroup: "Urgencias psiquiátricas" };
      if (num === 312) return { group: "Urgencias específicas", subgroup: "Urgencias endocrino-metabólicas" };
      if (num === 313) return { group: "Urgencias específicas", subgroup: "Urgencias por agentes físicos" };
      if (num === 314) return { group: "Urgencias específicas", subgroup: "Urgencias pediátricas" };
      if (num === 315) return { group: "Urgencias específicas", subgroup: "Intoxicaciones" };
      return { group: "Urgencias específicas", subgroup: "Otras urgencias" };
    case "SVB":
      if (/^412/.test(id)) return { group: "Traumatismos SVB", subgroup: "Valoración del politraumatizado" };
      if (num <= 406) return { group: "Valoración y soporte vital", subgroup: "Secuencia básica" };
      return { group: "Patologías prevalentes", subgroup: "Motivos de asistencia" };
    case "Psicológicos":
      return { group: "Intervención psicológica", subgroup: "Activación de guardia" };
    case "Técnicas":
      if (num === 601) return { group: "Procedimientos básicos", subgroup: "Relación y valoración" };
      if (num === 602) return { group: "Vía aérea y respiración", subgroup: "Técnicas respiratorias" };
      if (num === 603) return { group: "Cardiacos", subgroup: "Técnicas cardiacas" };
      if (num === 604) return { group: "Vasculares", subgroup: "Accesos vasculares" };
      if (num === 605) return { group: "Sondajes", subgroup: "Sondajes y lavados" };
      if (num === 606) return { group: "Trauma", subgroup: "Técnicas traumatológicas" };
      if (num === 607 || num === 608) return { group: "Otras técnicas", subgroup: "Exploración y otras" };
      if (num === 609) return { group: "Obstetricia", subgroup: "Técnicas obstétricas" };
      return { group: "Técnicas asistenciales", subgroup: "Procedimientos" };
    case "DRP":
      return { group: "Procedimientos", subgroup: "Listado" };
    case "Intervinientes":
      return { group: "Procedimientos", subgroup: "Listado" };
    default:
      return { group: "General", subgroup: "Procedimientos" };
  }
}

export interface ManualTreeProcedureRef {
  id: string;
  title: string;
  slug: string;
  section: string;
}

export interface ManualTreeSubgroup {
  name: string;
  procedures: ManualTreeProcedureRef[];
}

export interface ManualTreeGroup {
  name: string;
  subgroups: ManualTreeSubgroup[];
}

export interface ManualTreeSection {
  section: string;
  groups: ManualTreeGroup[];
}

function sortByIdNumeric<T extends { id: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.id.localeCompare(b.id, "es", { numeric: true }));
}

/** Guard the UI boundary: a damaged/partial snapshot must not crash the tree. */
export function isUsableManualTreeProcedure(value: unknown): value is ManualTreeProcedureRef {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ManualTreeProcedureRef>;
  return typeof candidate.id === "string" && candidate.id.length > 0
    && typeof candidate.title === "string" && candidate.title.length > 0
    && typeof candidate.slug === "string"
    && typeof candidate.section === "string" && candidate.section.length > 0;
}

/**
 * Builds the section → group → subgroup tree from a flat procedure list.
 * Procedures are sorted by numeric id before grouping so groups/subgroups
 * come out in the same order the web's Map-insertion-order grouping produces
 * from its own id-sorted `getAllProcedures()` — regardless of the input
 * array's original order.
 */
export function buildManualTree(procedures: readonly ManualTreeProcedureRef[]): ManualTreeSection[] {
  const usable = sortByIdNumeric(procedures.filter(isUsableManualTreeProcedure));
  const sections = new Map<string, Map<string, Map<string, ManualTreeProcedureRef[]>>>();

  for (const procedure of usable) {
    const meta = manualSidebarMeta(procedure.section, procedure.id, procedure.title);
    if (!sections.has(procedure.section)) sections.set(procedure.section, new Map());
    const groups = sections.get(procedure.section)!;
    if (!groups.has(meta.group)) groups.set(meta.group, new Map());
    const subgroups = groups.get(meta.group)!;
    if (!subgroups.has(meta.subgroup)) subgroups.set(meta.subgroup, []);
    subgroups.get(meta.subgroup)!.push(procedure);
  }

  return [...sections.entries()].map(([section, groups]) => ({
    section,
    groups: [...groups.entries()].map(([name, subgroups]) => ({
      name,
      subgroups: [...subgroups.entries()].map(([subgroupName, procedures]) => ({
        name: subgroupName,
        procedures,
      })),
    })),
  }));
}

export function sortManualSections(sections: readonly ManualTreeSection[]): ManualTreeSection[] {
  return [...sections].sort((a, b) => {
    const ai = MANUAL_SECTIONS_PRIORITY.indexOf(a.section as (typeof MANUAL_SECTIONS_PRIORITY)[number]);
    const bi = MANUAL_SECTIONS_PRIORITY.indexOf(b.section as (typeof MANUAL_SECTIONS_PRIORITY)[number]);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
}

export function manualSectionProcedureCount(section: ManualTreeSection): number {
  return section.groups.reduce((total, group) => total + group.subgroups.reduce((sub, subgroup) => sub + subgroup.procedures.length, 0), 0);
}

export function manualFlatSectionProcedures(section: ManualTreeSection): ManualTreeProcedureRef[] {
  return sortByIdNumeric(section.groups.flatMap((group) => group.subgroups.flatMap((subgroup) => subgroup.procedures)));
}

// ─── Flattening the tree into rows for a virtualized list ──────────────────

export function manualSectionKey(section: string): string { return `s:${section}`; }
export function manualGroupKey(section: string, group: string): string { return `g:${section}|${group}`; }
export function manualSubgroupKey(section: string, group: string, subgroup: string): string { return `sg:${section}|${group}|${subgroup}`; }

export type ManualTreeRowKind = "section" | "group" | "subgroup" | "procedure";

export interface ManualTreeRow {
  rowKey: string;
  kind: ManualTreeRowKind;
  /** 0 = section header, 1 = group/flat-procedure, 2 = subgroup/nested-procedure, 3 = procedure under a subgroup. */
  depth: 0 | 1 | 2 | 3;
  section: string;
  label?: string;
  count?: number;
  expanded?: boolean;
  procedure?: ManualTreeProcedureRef;
}

/**
 * Flattens the tree into a row list honouring `openKeys` (the set of
 * currently expanded section/group/subgroup keys), so the screen can render
 * it with a single virtualized FlatList instead of nested ScrollViews.
 */
export function flattenManualTree(sections: readonly ManualTreeSection[], openKeys: ReadonlySet<string>): ManualTreeRow[] {
  const rows: ManualTreeRow[] = [];

  for (const section of sections) {
    const sectionKey = manualSectionKey(section.section);
    const sectionExpanded = openKeys.has(sectionKey);
    const totalCount = manualSectionProcedureCount(section);
    rows.push({ rowKey: sectionKey, kind: "section", depth: 0, section: section.section, label: section.section, count: totalCount, expanded: sectionExpanded });
    if (!sectionExpanded) continue;

    if (MANUAL_FLAT_SECTIONS.has(section.section)) {
      for (const procedure of manualFlatSectionProcedures(section)) {
        rows.push({ rowKey: `p:${sectionKey}:${procedure.id}`, kind: "procedure", depth: 1, section: section.section, procedure });
      }
      continue;
    }

    for (const group of section.groups) {
      const groupKey = manualGroupKey(section.section, group.name);
      const groupExpanded = openKeys.has(groupKey);
      const groupCount = group.subgroups.reduce((total, subgroup) => total + subgroup.procedures.length, 0);
      rows.push({ rowKey: groupKey, kind: "group", depth: 1, section: section.section, label: group.name, count: groupCount, expanded: groupExpanded });
      if (!groupExpanded) continue;

      if (group.subgroups.length === 1) {
        for (const procedure of group.subgroups[0].procedures) {
          rows.push({ rowKey: `p:${groupKey}:${procedure.id}`, kind: "procedure", depth: 2, section: section.section, procedure });
        }
        continue;
      }

      for (const subgroup of group.subgroups) {
        const subgroupKey = manualSubgroupKey(section.section, group.name, subgroup.name);
        const subgroupExpanded = openKeys.has(subgroupKey);
        rows.push({ rowKey: subgroupKey, kind: "subgroup", depth: 2, section: section.section, label: subgroup.name, count: subgroup.procedures.length, expanded: subgroupExpanded });
        if (!subgroupExpanded) continue;
        for (const procedure of subgroup.procedures) {
          rows.push({ rowKey: `p:${subgroupKey}:${procedure.id}`, kind: "procedure", depth: 3, section: section.section, procedure });
        }
      }
    }
  }

  return rows;
}

// ─── Update history (mirrors lib/manual-updates-logic.ts's recency window) ──

export type ManualUpdateChangeKind = "nuevo" | "actualizado" | "revisado" | "eliminado" | string;

export interface ManualUpdateEvent {
  eventId: string;
  origin?: string;
  officialUrl?: string;
  procedureIds: string[];
  changeKind: ManualUpdateChangeKind;
  summary: string;
  effectiveDate: string;
  approvedAt?: string;
  isRecent?: boolean;
  category?: string;
  diff?: string;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

/** Guard the boundary against a damaged/partial `content.updates` snapshot. */
export function asManualUpdateEvents(values: unknown): ManualUpdateEvent[] {
  if (!Array.isArray(values)) return [];
  return values
    .map(record)
    .filter((v): v is Record<string, unknown> => Boolean(v))
    .map((v) => ({
      eventId: typeof v.eventId === "string" ? v.eventId : "",
      origin: typeof v.origin === "string" ? v.origin : undefined,
      officialUrl: typeof v.officialUrl === "string" ? v.officialUrl : undefined,
      procedureIds: Array.isArray(v.procedureIds) ? v.procedureIds.filter((id): id is string => typeof id === "string") : [],
      changeKind: typeof v.changeKind === "string" ? v.changeKind : "sync",
      summary: typeof v.summary === "string" ? v.summary : "",
      effectiveDate: typeof v.effectiveDate === "string" ? v.effectiveDate : "",
      approvedAt: typeof v.approvedAt === "string" ? v.approvedAt : undefined,
      isRecent: typeof v.isRecent === "boolean" ? v.isRecent : undefined,
      category: typeof v.category === "string" ? v.category : undefined,
      diff: typeof v.diff === "string" ? v.diff : undefined,
    }))
    .filter((event) => event.eventId.length > 0 && event.summary.length > 0);
}

/** Matches `lib/manual-updates-logic.ts`'s RECENT_WINDOW_DAYS. */
export const MANUAL_RECENT_WINDOW_DAYS = 30;
export const MANUAL_RECENT_WINDOW_MS = MANUAL_RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000;

/**
 * Recomputes `isRecent` against the device clock instead of trusting the
 * value baked into the bundled/downloaded snapshot at generation time. A
 * phone can go weeks without a `refresh()`, so a boolean frozen at package
 * build time would keep "novedades" pinned long after the 30-day window
 * closed — the exact class of bug CLAUDE.md documents for the web's static
 * export, except here the cause is "stale local package" rather than "frozen
 * build," and the fix is the same: decide it against `referenceNow`.
 */
export function applyManualRecencyWindow(events: readonly ManualUpdateEvent[], referenceNow = new Date()): ManualUpdateEvent[] {
  return events.map((event) => {
    if (!event.approvedAt) return { ...event, isRecent: false };
    const approved = new Date(event.approvedAt).getTime();
    if (Number.isNaN(approved)) return { ...event, isRecent: false };
    const diff = referenceNow.getTime() - approved;
    return { ...event, isRecent: diff >= 0 && diff <= MANUAL_RECENT_WINDOW_MS };
  });
}

function eventDateValue(event: ManualUpdateEvent): number {
  const raw = event.approvedAt ?? event.effectiveDate;
  const value = new Date(raw).getTime();
  return Number.isNaN(value) ? 0 : value;
}

function sortEventsDesc(events: readonly ManualUpdateEvent[]): ManualUpdateEvent[] {
  return [...events].sort((a, b) => eventDateValue(b) - eventDateValue(a) || b.eventId.localeCompare(a.eventId));
}

/**
 * "Novedades": recent events, excluding "revisado" — mirrors ManualHomeClient's
 * `syncGroups`, which does the same exclusion so a plain re-review doesn't
 * read as a change worth surfacing.
 */
export function manualNovedades(events: readonly ManualUpdateEvent[]): ManualUpdateEvent[] {
  return sortEventsDesc(events.filter((event) => event.isRecent && event.changeKind !== "revisado"));
}

export function manualEventDateKey(event: ManualUpdateEvent): string {
  return (event.approvedAt ?? event.effectiveDate).slice(0, 10);
}

export interface ManualUpdateDateGroup {
  date: string;
  events: ManualUpdateEvent[];
}

/** Groups already-selected events by day, most recent day first. */
export function groupManualEventsByDate(events: readonly ManualUpdateEvent[]): ManualUpdateDateGroup[] {
  const byDate = new Map<string, ManualUpdateEvent[]>();
  for (const event of sortEventsDesc(events)) {
    const key = manualEventDateKey(event);
    const bucket = byDate.get(key) ?? [];
    bucket.push(event);
    byDate.set(key, bucket);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, dateEvents]) => ({ date, events: dateEvents }));
}

/** Full history (every changeKind, "revisado" included), most recent first. */
export function sortManualHistorial(events: readonly ManualUpdateEvent[]): ManualUpdateEvent[] {
  return sortEventsDesc(events);
}

import { displayLabel } from "./title-case.ts";
import type { MobileContent } from "./data/schema";

export type MobileReferenceKind = "drug" | "perfusion" | "fluid" | "commercialName" | "code" | "abbreviation";

export interface MobileReferenceSearchResult {
  kind: MobileReferenceKind;
  id: string;
  title: string;
  subtitle: string;
  badge?: string;
  /** ID of the canonical medication record when this is a vademécum alias. */
  targetId?: string;
  /** Group/category provenance used to build stable detail routes. */
  sourceGroup?: string;
  detail?: ReferenceRecord;
  routeKey: string;
  searchText: string;
  rank: number;
}

export type ReferenceRecord = Record<string, unknown>;

function normalize(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function compact(value: unknown): string {
  return normalize(value).replace(/\s/g, "");
}

function textValues(value: unknown): string[] {
  if (typeof value === "string" || typeof value === "number") return [String(value)];
  if (Array.isArray(value)) return value.flatMap(textValues);
  if (value && typeof value === "object") return Object.values(value).flatMap(textValues);
  return [];
}

function recordText(record: ReferenceRecord): string {
  return textValues(record).join(" ");
}

function stringValue(record: ReferenceRecord, ...keys: string[]): string {
  for (const key of keys) {
    if (typeof record[key] === "string" && record[key].trim()) return record[key].trim();
    if (typeof record[key] === "number") return String(record[key]);
  }
  return "";
}

function asRecords(value: unknown): ReferenceRecord[] {
  return Array.isArray(value) ? value.filter((item): item is ReferenceRecord => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [];
}

function canonicalDrugId(drugs: ReferenceRecord[], item: ReferenceRecord): string | undefined {
  const explicit = stringValue(item, "drugId");
  if (explicit) return explicit;
  const drugName = normalize(stringValue(item, "drug"));
  const match = drugs.find((drug) => drugName && normalize(stringValue(drug, "name")) === drugName);
  return match ? stringValue(match, "id") || undefined : undefined;
}

function result(kind: MobileReferenceKind, record: ReferenceRecord, fields: Omit<MobileReferenceSearchResult, "kind" | "searchText" | "rank" | "routeKey" | "detail"> & { routeKey?: string }): MobileReferenceSearchResult {
  return { kind, ...fields, routeKey: fields.routeKey ?? `${kind}:${fields.id}`, detail: record, searchText: recordText(record), rank: 0 };
}

export function vademecumRouteKey(kind: Exclude<MobileReferenceKind, "code" | "abbreviation">, id: string): string {
  return `vademecum:${kind}:${id}`;
}

export function codeRouteKey(group: string, code: string): string {
  return `code:${group}:${code}`;
}

export function buildVademecumReferences(content: Pick<MobileContent, "drugs" | "perfusions" | "fluids" | "commercialNames">): MobileReferenceSearchResult[] {
  const drugs = asRecords(content.drugs);
  const perfusions = asRecords(content.perfusions);
  const fluids = asRecords(content.fluids);
  const commercialNames = asRecords(content.commercialNames);
  return [
    ...drugs.map((item) => result("drug", item, {
      id: stringValue(item, "id", "name"),
      title: stringValue(item, "name", "id") || "Fármaco",
      subtitle: [stringValue(item, "category"), stringValue(item, "subcategory")].filter(Boolean).join(" · ") || "Vademécum",
      badge: stringValue(item, "id") || undefined,
      targetId: stringValue(item, "id") || undefined,
      routeKey: vademecumRouteKey("drug", stringValue(item, "id", "name")),
    })),
    ...perfusions.map((item) => result("perfusion", item, {
      id: stringValue(item, "id", "drugId", "drug"),
      title: stringValue(item, "drug", "id") || "Perfusión",
      subtitle: ["Perfusión", stringValue(item, "category")].filter(Boolean).join(" · "),
      badge: "PERF",
      targetId: canonicalDrugId(drugs, item),
      routeKey: vademecumRouteKey("perfusion", stringValue(item, "id", "drugId", "drug")),
    })),
    ...fluids.map((item) => result("fluid", item, {
      id: stringValue(item, "id", "name"),
      title: stringValue(item, "name", "id") || "Fluido",
      subtitle: ["Fluido", stringValue(item, "type")].filter(Boolean).join(" · "),
      badge: "FLUIDO",
      routeKey: vademecumRouteKey("fluid", stringValue(item, "id", "name")),
    })),
    ...commercialNames.map((item) => result("commercialName", item, {
      id: `${stringValue(item, "drugId", "activeIngredient")}:${stringValue(item, "presentation")}`,
      title: stringValue(item, "activeIngredient", "drugId") || "Nombre comercial",
      subtitle: ["Nombre comercial", stringValue(item, "presentation")].filter(Boolean).join(" · "),
      badge: "MARCA",
      targetId: stringValue(item, "drugId") || undefined,
      routeKey: vademecumRouteKey("commercialName", `${stringValue(item, "drugId", "activeIngredient")}:${stringValue(item, "presentation")}`),
    })),
  ];
}

export function buildCodeReferences(codes: MobileContent["codes"]): MobileReferenceSearchResult[] {
  return Object.entries(codes).flatMap(([group, values]) => asRecords(values).map((item, index) => {
    const code = stringValue(item, "code", "key");
    const title = stringValue(item, "name", "title", "label") || `Referencia ${index + 1}`;
    return result("code", item, {
      id: `${group}:${code || title}`,
      title,
      subtitle: [displayLabel(group), stringValue(item, "category", "group")].filter(Boolean).join(" · "),
      badge: code || undefined,
      sourceGroup: group,
      routeKey: codeRouteKey(group, code || title),
    });
  }));
}

export function buildAbbreviationReferences(abbreviations: MobileContent["abbreviations"]): MobileReferenceSearchResult[] {
  return asRecords(abbreviations).flatMap((group) => {
    const letter = stringValue(group, "letter");
    return asRecords(group.entries).map((item, index) => {
      const abbreviation = stringValue(item, "abbreviation", "short", "key") || `Entrada ${index + 1}`;
      return result("abbreviation", item, {
        id: `${letter}:${abbreviation}`,
        title: abbreviation,
        subtitle: stringValue(item, "meaning", "description", "name"),
        badge: letter || undefined,
      });
    });
  });
}

function rank(reference: MobileReferenceSearchResult, query: string): number | undefined {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return 100;
  const queryCompact = compact(query);
  const title = normalize(reference.title);
  const id = compact(reference.id);
  const badge = normalize(reference.badge);
  const text = normalize(`${reference.searchText} ${reference.subtitle}`);
  const terms = normalizedQuery.split(" ").filter(Boolean);
  if (id === queryCompact || badge === normalizedQuery || title === normalizedQuery) return 0;
  if (id.startsWith(queryCompact) || badge.startsWith(normalizedQuery) || title.startsWith(normalizedQuery)) return 1;
  if (title.includes(normalizedQuery) || badge.includes(normalizedQuery)) return 2;
  if (terms.every((term) => text.includes(term))) return 3;
  if (text.includes(normalizedQuery)) return 4;
  return undefined;
}

/** Deterministic, accent-insensitive search over the vademécum, code and abbreviation package. */
export function searchMobileReferences(references: MobileReferenceSearchResult[], query: string, limit = 60): MobileReferenceSearchResult[] {
  return references
    .map((reference, index) => ({ reference, rank: rank(reference, query), index }))
    .filter((item): item is { reference: MobileReferenceSearchResult; rank: number; index: number } => item.rank !== undefined)
    .sort((left, right) => left.rank - right.rank || left.reference.title.localeCompare(right.reference.title, "es") || left.index - right.index)
    .slice(0, limit)
    .map(({ reference, rank: itemRank }) => ({ ...reference, rank: itemRank }));
}

export function searchVademecum(content: Pick<MobileContent, "drugs" | "perfusions" | "fluids" | "commercialNames">, query: string, limit = 60): MobileReferenceSearchResult[] {
  return searchMobileReferences(buildVademecumReferences(content), query, limit);
}

export function searchCodes(codes: MobileContent["codes"], query: string, limit = 60): MobileReferenceSearchResult[] {
  return searchMobileReferences(buildCodeReferences(codes), query, limit);
}

export function resolveCodeReference(codes: MobileContent["codes"], reference: string): MobileReferenceSearchResult | undefined {
  return buildCodeReferences(codes).find((item) => item.routeKey === reference || item.id === reference);
}

export function resolveVademecumReference(content: Pick<MobileContent, "drugs" | "perfusions" | "fluids" | "commercialNames">, reference: string): MobileReferenceSearchResult | undefined {
  return buildVademecumReferences(content).find((item) => item.routeKey === reference || item.id === reference);
}

export function relatedProcedureIdsForDrug(content: Pick<MobileContent, "procedures">, drug: ReferenceRecord): string[] {
  const terms = [stringValue(drug, "id"), stringValue(drug, "name"), ...textValues(drug.synonyms)].map(normalize).filter((term) => term.length > 2);
  if (!terms.length) return [];
  return content.procedures
    .filter((procedure) => {
      const haystack = normalize(`${procedure.title} ${procedure.searchText} ${procedure.content}`);
      return terms.some((term) => haystack.includes(term));
    })
    .map((procedure) => procedure.id);
}

export function searchAbbreviations(abbreviations: MobileContent["abbreviations"], query: string, limit = 60): MobileReferenceSearchResult[] {
  return searchMobileReferences(buildAbbreviationReferences(abbreviations), query, limit);
}

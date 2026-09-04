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
  searchText: string;
  rank: number;
}

type ReferenceRecord = Record<string, unknown>;

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

function result(kind: MobileReferenceKind, record: ReferenceRecord, fields: Omit<MobileReferenceSearchResult, "kind" | "searchText" | "rank">): MobileReferenceSearchResult {
  return { kind, ...fields, searchText: recordText(record), rank: 0 };
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
    })),
    ...perfusions.map((item) => result("perfusion", item, {
      id: stringValue(item, "id", "drugId", "drug"),
      title: stringValue(item, "drug", "id") || "Perfusión",
      subtitle: ["Perfusión", stringValue(item, "category")].filter(Boolean).join(" · "),
      badge: "PERF",
      targetId: stringValue(item, "drugId") || undefined,
    })),
    ...fluids.map((item) => result("fluid", item, {
      id: stringValue(item, "id", "name"),
      title: stringValue(item, "name", "id") || "Fluido",
      subtitle: ["Fluido", stringValue(item, "type")].filter(Boolean).join(" · "),
      badge: "FLUIDO",
    })),
    ...commercialNames.map((item) => result("commercialName", item, {
      id: `${stringValue(item, "drugId", "activeIngredient")}:${stringValue(item, "presentation")}`,
      title: stringValue(item, "activeIngredient", "drugId") || "Nombre comercial",
      subtitle: ["Nombre comercial", stringValue(item, "presentation")].filter(Boolean).join(" · "),
      badge: "MARCA",
      targetId: stringValue(item, "drugId") || undefined,
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
      subtitle: [group.toUpperCase(), stringValue(item, "category", "group")].filter(Boolean).join(" · "),
      badge: code || undefined,
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

export function searchAbbreviations(abbreviations: MobileContent["abbreviations"], query: string, limit = 60): MobileReferenceSearchResult[] {
  return searchMobileReferences(buildAbbreviationReferences(abbreviations), query, limit);
}

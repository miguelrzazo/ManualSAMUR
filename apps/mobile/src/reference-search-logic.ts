import { displayLabel } from "./title-case.ts";
import type { MobileContent, MobileProcedure } from "../../../packages/manual-content/src/index.ts";

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

interface IndexedProcedure {
  procedure: MobileProcedure;
  normalizedId: string;
  compactId: string;
  normalizedTitle: string;
  normalizedSynonyms: string[];
  normalizedTags: string[];
  normalizedSearchText: string;
  normalizedAllText: string;
}

interface IndexedReference {
  reference: MobileReferenceSearchResult;
  normalizedTitle: string;
  compactId: string;
  normalizedBadge: string;
  normalizedText: string;
}

/**
 * The package is immutable for the lifetime of a provider. Keep all expensive
 * searchable projections behind the package/collection identities so keystrokes
 * only rank already-normalized values.
 */
export interface MobileSearchIndex {
  procedures: MobileProcedure[];
  procedureEntries: IndexedProcedure[];
  proceduresById: Map<string, MobileProcedure>;
  proceduresByRouteKey: Map<string, MobileProcedure>;
  proceduresBySlug: Map<string, MobileProcedure>;
  procedureSource?: MobileProcedure[];
  vademecumSource?: Pick<MobileContent, "drugs" | "perfusions" | "fluids" | "commercialNames">;
  codeSource?: MobileContent["codes"];
  abbreviationSource?: MobileContent["abbreviations"];
  vademecumReferences?: MobileReferenceSearchResult[];
  codeReferences?: MobileReferenceSearchResult[];
  abbreviationReferences?: MobileReferenceSearchResult[];
}

type SearchIndexDomain = "all" | "procedures" | "vademecum" | "codes" | "abbreviations";
type SearchIndexSource = object;

const searchIndexCache = new WeakMap<SearchIndexSource, MobileSearchIndex>();
const preparedReferenceCache = new WeakMap<MobileReferenceSearchResult[], IndexedReference[]>();

function isUsableIndexedProcedure(value: unknown): value is MobileProcedure {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<MobileProcedure>;
  return typeof candidate.id === "string"
    && candidate.id.length > 0
    && typeof candidate.title === "string"
    && candidate.title.length > 0
    && typeof candidate.section === "string"
    && typeof candidate.slug === "string"
    && typeof candidate.routeKey === "string"
    && typeof candidate.content === "string"
    && typeof candidate.searchText === "string"
    && Array.isArray(candidate.tags)
    && Array.isArray(candidate.synonyms)
    && Array.isArray(candidate.related)
    && Array.isArray(candidate.backlinks)
    && Array.isArray(candidate.relations)
    && Array.isArray(candidate.editorialBlocks)
    && Array.isArray(candidate.attachments);
}

function registerSearchIndex(index: MobileSearchIndex, source: SearchIndexSource): void {
  if (!searchIndexCache.has(source)) searchIndexCache.set(source, index);
}

function registerCollectionIdentities(index: MobileSearchIndex, source: object): void {
  const candidate = source as Partial<MobileContent>;
  registerSearchIndex(index, source);
  if (Array.isArray(candidate.procedures)) registerSearchIndex(index, candidate.procedures);
  if (candidate.codes && typeof candidate.codes === "object") registerSearchIndex(index, candidate.codes);
  if (Array.isArray(candidate.drugs)) registerSearchIndex(index, candidate.drugs);
  if (Array.isArray(candidate.perfusions)) registerSearchIndex(index, candidate.perfusions);
  if (Array.isArray(candidate.fluids)) registerSearchIndex(index, candidate.fluids);
  if (Array.isArray(candidate.commercialNames)) registerSearchIndex(index, candidate.commercialNames);
  if (Array.isArray(candidate.abbreviations)) registerSearchIndex(index, candidate.abbreviations);
}

function buildProcedureEntries(procedures: MobileProcedure[]): IndexedProcedure[] {
  return procedures.filter(isUsableIndexedProcedure).map((procedure) => {
    const normalizedId = normalize(procedure.id);
    const normalizedTitle = normalize(procedure.title);
    const normalizedSynonyms = procedure.synonyms.map(normalize).filter(Boolean);
    const normalizedTags = procedure.tags.map(normalize).filter(Boolean);
    const normalizedSearchText = normalize(`${procedure.searchText} ${procedure.content}`);
    return {
      procedure,
      normalizedId,
      compactId: normalizedId.replace(/\s/g, ""),
      normalizedTitle,
      normalizedSynonyms,
      normalizedTags,
      normalizedSearchText,
      normalizedAllText: [
        normalizedId,
        normalizedTitle,
        normalize(procedure.section),
        ...normalizedSynonyms,
        ...normalizedTags,
        normalizedSearchText,
      ].filter(Boolean).join(" "),
    };
  });
}

function emptySearchIndex(): MobileSearchIndex {
  return {
    procedures: [],
    procedureEntries: [],
    proceduresById: new Map(),
    proceduresByRouteKey: new Map(),
    proceduresBySlug: new Map(),
  };
}

function hydrateProcedures(index: MobileSearchIndex, procedures: MobileProcedure[]): void {
  if (index.procedures === procedures) return;
  if (index.procedures.length > 0) return;
  index.procedures = procedures;
  index.procedureEntries = buildProcedureEntries(procedures);
  for (const entry of index.procedureEntries) {
    if (!index.proceduresById.has(entry.procedure.id)) index.proceduresById.set(entry.procedure.id, entry.procedure);
    if (!index.proceduresByRouteKey.has(entry.procedure.routeKey)) index.proceduresByRouteKey.set(entry.procedure.routeKey, entry.procedure);
    if (!index.proceduresBySlug.has(entry.procedure.slug)) index.proceduresBySlug.set(entry.procedure.slug, entry.procedure);
  }
}

function sourceProcedures(source: SearchIndexSource): MobileProcedure[] | undefined {
  if (Array.isArray(source)) return source as MobileProcedure[];
  const procedures = (source as Partial<MobileContent>).procedures;
  return Array.isArray(procedures) ? procedures : undefined;
}

function sourceVademecum(source: SearchIndexSource): Pick<MobileContent, "drugs" | "perfusions" | "fluids" | "commercialNames"> | undefined {
  const candidate = source as Partial<MobileContent>;
  if (!Array.isArray(candidate.drugs) || !Array.isArray(candidate.perfusions) || !Array.isArray(candidate.fluids) || !Array.isArray(candidate.commercialNames)) return undefined;
  return candidate as Pick<MobileContent, "drugs" | "perfusions" | "fluids" | "commercialNames">;
}

function sourceCodes(source: SearchIndexSource): MobileContent["codes"] | undefined {
  if (Array.isArray(source)) return undefined;
  const candidate = source as Partial<MobileContent>;
  if (candidate.codes && typeof candidate.codes === "object" && !Array.isArray(candidate.codes)) return candidate.codes as MobileContent["codes"];
  return undefined;
}

function sourceAbbreviations(source: SearchIndexSource): MobileContent["abbreviations"] | undefined {
  if (Array.isArray(source)) return source as MobileContent["abbreviations"];
  const candidate = source as Partial<MobileContent>;
  return Array.isArray(candidate.abbreviations) ? candidate.abbreviations : undefined;
}

function hydrateSearchIndex(index: MobileSearchIndex, source: SearchIndexSource, domain: SearchIndexDomain): MobileSearchIndex {
  const procedures = sourceProcedures(source);
  if (procedures && !index.procedureSource) index.procedureSource = procedures;
  if ((domain === "all" || domain === "procedures") && procedures) hydrateProcedures(index, procedures);

  const vademecum = sourceVademecum(source);
  if (vademecum && !index.vademecumSource) index.vademecumSource = vademecum;
  const vademecumSource = vademecum ?? (index.vademecumSource && index.vademecumSource === source ? index.vademecumSource : undefined);
  if ((domain === "all" || domain === "vademecum") && vademecumSource && !index.vademecumReferences) {
    index.vademecumReferences = buildVademecumReferencesUncached(vademecumSource);
  }

  const codes = sourceCodes(source);
  if (codes && !index.codeSource) index.codeSource = codes;
  const codeSource = codes ?? (domain === "codes" && index.codeSource === source ? index.codeSource : undefined) ?? (domain === "codes" && !Array.isArray(source) ? source as MobileContent["codes"] : undefined);
  if ((domain === "all" || domain === "codes") && codeSource && !index.codeReferences) {
    index.codeReferences = buildCodeReferencesUncached(codeSource);
  }

  const abbreviations = sourceAbbreviations(source);
  if (abbreviations && !index.abbreviationSource) index.abbreviationSource = abbreviations;
  const abbreviationSource = abbreviations ?? (domain === "abbreviations" && index.abbreviationSource === source ? index.abbreviationSource : undefined) ?? (domain === "abbreviations" && Array.isArray(source) ? source as MobileContent["abbreviations"] : undefined);
  if ((domain === "all" || domain === "abbreviations") && abbreviationSource && !index.abbreviationReferences) {
    index.abbreviationReferences = buildAbbreviationReferencesUncached(abbreviationSource);
  }
  registerCollectionIdentities(index, source);
  return index;
}

function compatibleCachedIndex(source: SearchIndexSource): MobileSearchIndex | undefined {
  const procedures = sourceProcedures(source);
  if (!procedures) return undefined;
  const candidate = searchIndexCache.get(procedures);
  if (!candidate || candidate.procedures !== procedures) return undefined;

  // A procedure-only index can safely be promoted when the full package arrives.
  // Do not accidentally merge two complete packages that happen to share one
  // collection identity.
  if (!candidate.vademecumReferences && !candidate.codeReferences && !candidate.abbreviationReferences) return candidate;
  return undefined;
}

/** Return the cached search projections for one content or collection identity. */
export function getMobileSearchIndex(source: SearchIndexSource, domain: SearchIndexDomain = "all"): MobileSearchIndex {
  const cached = searchIndexCache.get(source) ?? compatibleCachedIndex(source);
  if (cached) return hydrateSearchIndex(cached, source, domain);
  const index = emptySearchIndex();
  return hydrateSearchIndex(index, source, domain);
}

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

function buildVademecumReferencesUncached(content: Pick<MobileContent, "drugs" | "perfusions" | "fluids" | "commercialNames">): MobileReferenceSearchResult[] {
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

function buildCodeReferencesUncached(codes: MobileContent["codes"]): MobileReferenceSearchResult[] {
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

function buildAbbreviationReferencesUncached(abbreviations: MobileContent["abbreviations"]): MobileReferenceSearchResult[] {
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

function prepareReferences(references: MobileReferenceSearchResult[]): IndexedReference[] {
  const cached = preparedReferenceCache.get(references);
  if (cached) return cached;
  const prepared = references.map((reference) => ({
    reference,
    normalizedTitle: normalize(reference.title),
    compactId: compact(reference.id),
    normalizedBadge: normalize(reference.badge),
    normalizedText: normalize(`${reference.searchText} ${reference.subtitle}`),
  }));
  preparedReferenceCache.set(references, prepared);
  return prepared;
}

function rank(reference: IndexedReference, query: { normalized: string; compact: string; terms: string[] }): number | undefined {
  const normalizedQuery = query.normalized;
  if (!normalizedQuery) return 100;
  if (reference.compactId === query.compact || reference.normalizedBadge === normalizedQuery || reference.normalizedTitle === normalizedQuery) return 0;
  if (reference.compactId.startsWith(query.compact) || reference.normalizedBadge.startsWith(normalizedQuery) || reference.normalizedTitle.startsWith(normalizedQuery)) return 1;
  if (reference.normalizedTitle.includes(normalizedQuery) || reference.normalizedBadge.includes(normalizedQuery)) return 2;
  if (query.terms.every((term) => reference.normalizedText.includes(term))) return 3;
  if (reference.normalizedText.includes(normalizedQuery)) return 4;
  return undefined;
}

/** Deterministic, accent-insensitive search over the vademécum, code and abbreviation package. */
export function searchMobileReferences(references: MobileReferenceSearchResult[], query: string, limit = 60): MobileReferenceSearchResult[] {
  const prepared = prepareReferences(references);
  const queryParts = { normalized: normalize(query), compact: compact(query), terms: normalize(query).split(" ").filter(Boolean) };
  return prepared
    .map((entry, index) => ({ entry, rank: rank(entry, queryParts), index }))
    .filter((item): item is { entry: IndexedReference; rank: number; index: number } => item.rank !== undefined)
    .sort((left, right) => left.rank - right.rank || left.entry.reference.title.localeCompare(right.entry.reference.title, "es") || left.index - right.index)
    .slice(0, limit)
    .map(({ entry, rank: itemRank }) => ({ ...entry.reference, rank: itemRank }));
}

export function buildVademecumReferences(content: Pick<MobileContent, "drugs" | "perfusions" | "fluids" | "commercialNames">): MobileReferenceSearchResult[] {
  return getMobileSearchIndex(content, "vademecum").vademecumReferences ?? [];
}

export function buildCodeReferences(codes: MobileContent["codes"]): MobileReferenceSearchResult[] {
  return getMobileSearchIndex(codes, "codes").codeReferences ?? [];
}

export function buildAbbreviationReferences(abbreviations: MobileContent["abbreviations"]): MobileReferenceSearchResult[] {
  return getMobileSearchIndex(abbreviations, "abbreviations").abbreviationReferences ?? [];
}

export function searchVademecum(content: Pick<MobileContent, "drugs" | "perfusions" | "fluids" | "commercialNames">, query: string, limit = 60): MobileReferenceSearchResult[] {
  return searchMobileReferences(getMobileSearchIndex(content, "vademecum").vademecumReferences ?? [], query, limit);
}

export function searchCodes(codes: MobileContent["codes"], query: string, limit = 60): MobileReferenceSearchResult[] {
  return searchMobileReferences(getMobileSearchIndex(codes, "codes").codeReferences ?? [], query, limit);
}

export function resolveCodeReference(codes: MobileContent["codes"], reference: string): MobileReferenceSearchResult | undefined {
  return (getMobileSearchIndex(codes, "codes").codeReferences ?? []).find((item) => item.routeKey === reference || item.id === reference);
}

export function resolveVademecumReference(content: Pick<MobileContent, "drugs" | "perfusions" | "fluids" | "commercialNames">, reference: string): MobileReferenceSearchResult | undefined {
  return (getMobileSearchIndex(content, "vademecum").vademecumReferences ?? []).find((item) => item.routeKey === reference || item.id === reference);
}

export function relatedProcedureIdsForDrug(content: Pick<MobileContent, "procedures">, drug: ReferenceRecord): string[] {
  const terms = [stringValue(drug, "id"), stringValue(drug, "name"), ...textValues(drug.synonyms)].map(normalize).filter((term) => term.length > 2);
  if (!terms.length) return [];
  return getMobileSearchIndex(content, "procedures").procedureEntries
    .filter((entry) => terms.some((term) => entry.normalizedAllText.includes(term)))
    .map((entry) => entry.procedure.id);
}

export function searchAbbreviations(abbreviations: MobileContent["abbreviations"], query: string, limit = 60): MobileReferenceSearchResult[] {
  return searchMobileReferences(buildAbbreviationReferences(abbreviations), query, limit);
}

export const SEARCH_SCOPES = ["Todo", "Procedimientos", "Vademécum", "Códigos"] as const;
export type SearchScope = (typeof SEARCH_SCOPES)[number];

/**
 * There is deliberately no second scope tier here any more.
 *
 * `VADEMECUM_SCOPES` ("Todos · Fármacos · Comerciales · Perfusiones · Fluidos")
 * used to render as a row underneath the scope chips whenever "Vademécum" was
 * selected — two identically styled chip rows on the one screen whose entire
 * purpose is searching across all of them, whose first chips read "Todo" and
 * "Todos", and which gave the screen two `tablist` roles. Narrowing to a single
 * Vademécum domain is what the Vademécum tab's own switcher is for.
 */

import Fuse, { type FuseResult, type FuseResultMatch } from "fuse.js";
import type { ProcedureMeta } from "./content.ts";
import { search as searchProcedures, type SearchSnippet } from "./search.ts";

interface Drug {
  id: string;
  name: string;
  synonyms: string[];
  category: string;
  subcategory: string;
  indication?: string;
  presentation?: string;
}

interface Code {
  code: string;
  name: string;
  group: string;
  category?: string;
  description?: string;
}

interface Hospital {
  id: string;
  name: string;
  shortName: string;
  address: string;
  district: string;
}

export interface SearchResult {
  type: "procedure" | "drug" | "code" | "hospital";
  id: string;
  title: string;
  subtitle?: string;
  badge?: string;
  href: string;
  searchText: string;
  score: number;
  matchedField: string;
  snippet?: SearchSnippet;
}

let drugsFuse: Fuse<Drug> | null = null;
let codesFuse: Fuse<Code> | null = null;
let hospitalsFuse: Fuse<Hospital> | null = null;

function buildDrugsFuse(drugs: Drug[]): Fuse<Drug> {
  drugsFuse = new Fuse(drugs, {
    keys: [
      { name: "id", weight: 2.2 },
      { name: "name", weight: 2 },
      { name: "synonyms", weight: 1.5 },
      { name: "category", weight: 0.85 },
      { name: "subcategory", weight: 0.8 },
      { name: "indication", weight: 0.65 },
    ],
    threshold: 0.35,
    includeScore: true,
    includeMatches: true,
    ignoreLocation: true,
    ignoreDiacritics: true,
    minMatchCharLength: 2,
  });
  return drugsFuse;
}

function buildCodesFuse(codes: Code[]): Fuse<Code> {
  codesFuse = new Fuse(codes, {
    keys: [
      { name: "code", weight: 2.4 },
      { name: "name", weight: 2 },
      { name: "group", weight: 0.9 },
      { name: "category", weight: 0.7 },
      { name: "description", weight: 0.5 },
    ],
    threshold: 0.35,
    includeScore: true,
    includeMatches: true,
    ignoreLocation: true,
    ignoreDiacritics: true,
    minMatchCharLength: 2,
  });
  return codesFuse;
}

function buildHospitalsFuse(hospitals: Hospital[]): Fuse<Hospital> {
  hospitalsFuse = new Fuse(hospitals, {
    keys: [
      { name: "id", weight: 2.1 },
      { name: "name", weight: 2 },
      { name: "shortName", weight: 1.45 },
      { name: "address", weight: 0.95 },
      { name: "district", weight: 0.8 },
    ],
    threshold: 0.35,
    includeScore: true,
    includeMatches: true,
    ignoreLocation: true,
    ignoreDiacritics: true,
    minMatchCharLength: 2,
  });
  return hospitalsFuse;
}

function normalizeForSearch(value: unknown): string {
  if (value == null) return "";
  const str = String(value);
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function resolveMatchedField(matches: readonly FuseResultMatch[]): string {
  return matches[0]?.key ?? "unknown";
}

function computeCommonScore(
  query: string,
  score: number | undefined,
  matches: readonly FuseResultMatch[],
  values: string[],
  penalty = 0
): number {
  const normalizedQuery = normalizeForSearch(query.trim());
  let bonus = 0;

  for (const value of values) {
    const normalizedValue = normalizeForSearch(value);
    if (!normalizedValue) continue;

    if (normalizedValue === normalizedQuery) bonus = Math.max(bonus, 0.04);
    else if (normalizedValue.startsWith(normalizedQuery)) bonus = Math.max(bonus, 0.02);
    else if (normalizedValue.includes(normalizedQuery)) bonus = Math.max(bonus, 0.01);
  }

  const matchedField = resolveMatchedField(matches);
  const fieldPenalty = matchedField === "description" || matchedField === "indication" ? 0.04 : penalty;

  return (score ?? 1) + fieldPenalty - bonus;
}

function sortResults(results: SearchResult[]): SearchResult[] {
  return results.sort((left, right) => {
    if (left.score !== right.score) return left.score - right.score;
    return left.title.localeCompare(right.title, "es");
  });
}

function flattenGroups(groups: SearchResult[][]): SearchResult[] {
  return groups
    .filter((group) => group.length > 0)
    .sort((left, right) => left[0].score - right[0].score)
    .flatMap((group) => group);
}

function mapDrugResult(query: string, result: FuseResult<Drug>): SearchResult {
  const matches = result.matches ?? [];
  return {
    type: "drug",
    id: result.item.id,
    title: result.item.name,
    subtitle: `${result.item.category} • ${result.item.subcategory}`,
    badge: result.item.presentation,
    href: `/vademecum?farmaco=${result.item.id}`,
    searchText: `${result.item.id} ${result.item.name} ${result.item.synonyms.join(" ")} ${result.item.category} ${result.item.subcategory}`,
    score: computeCommonScore(
      query,
      result.score,
      matches,
      [result.item.id, result.item.name, ...result.item.synonyms, result.item.category, result.item.subcategory]
    ),
    matchedField: resolveMatchedField(matches),
  };
}

function mapCodeResult(query: string, result: FuseResult<Code>): SearchResult {
  const matches = result.matches ?? [];
  return {
    type: "code",
    id: result.item.code,
    title: result.item.name,
    subtitle: result.item.group,
    badge: result.item.code,
    href: "/codigos",
    searchText: `${result.item.code} ${result.item.name} ${result.item.group}`,
    score: computeCommonScore(
      query,
      result.score,
      matches,
      [result.item.code, result.item.name, result.item.group, result.item.category ?? "", result.item.description ?? ""]
    ),
    matchedField: resolveMatchedField(matches),
  };
}

function mapHospitalResult(query: string, result: FuseResult<Hospital>): SearchResult {
  const matches = result.matches ?? [];
  return {
    type: "hospital",
    id: result.item.id,
    title: result.item.name,
    subtitle: `${result.item.district} • ${result.item.address}`,
    badge: result.item.id,
    href: `/mapa?hospital=${result.item.id}`,
    searchText: `${result.item.id} ${result.item.name} ${result.item.shortName} ${result.item.address} ${result.item.district}`,
    score: computeCommonScore(
      query,
      result.score,
      matches,
      [result.item.id, result.item.name, result.item.shortName, result.item.address, result.item.district]
    ),
    matchedField: resolveMatchedField(matches),
  };
}

export async function globalSearch(
  query: string,
  procedures: ProcedureMeta[],
  drugs: Drug[],
  codes: Code[],
  hospitals: Hospital[]
): Promise<SearchResult[]> {
  if (!query.trim()) return [];

  const procedureResults = searchProcedures(query, procedures)
    .slice(0, 5)
    .map((result) => ({
      type: "procedure" as const,
      id: result.item.id,
      title: result.item.title,
      subtitle: result.item.section,
      badge: result.item.id,
      href: `/manual/${result.item.slug}`,
      searchText: `${result.item.id} ${result.item.title} ${result.item.synonyms.join(" ")} ${result.item.tags.join(" ")}`,
      score: result.score,
      matchedField: result.matchedField,
      snippet: result.snippet,
    }));

  const drugResults = sortResults(buildDrugsFuse(drugs).search(query).slice(0, 5).map((result) => mapDrugResult(query, result)));
  const codeResults = sortResults(buildCodesFuse(codes).search(query).slice(0, 5).map((result) => mapCodeResult(query, result)));
  const hospitalResults = sortResults(buildHospitalsFuse(hospitals).search(query).slice(0, 5).map((result) => mapHospitalResult(query, result)));

  return flattenGroups([
    procedureResults,
    drugResults,
    codeResults,
    hospitalResults,
  ]);
}

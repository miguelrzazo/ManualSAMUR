import Fuse, { type FuseResult, type FuseResultMatch } from "fuse.js";
import type { ProcedureMeta } from "@/lib/content";

export type ProcedureSearchField =
  | "id"
  | "title"
  | "synonyms"
  | "tags"
  | "backlinks"
  | "section"
  | "searchText";

export interface SearchSnippet {
  text: string;
  highlights: Array<[number, number]>;
}

export interface ProcedureSearchResult {
  item: ProcedureMeta;
  score: number;
  matchedField: ProcedureSearchField;
  matches: readonly FuseResultMatch[];
  snippet?: SearchSnippet;
}

const FIELD_PRIORITY: Record<ProcedureSearchField, number> = {
  id: 0,
  title: 1,
  synonyms: 2,
  tags: 3,
  backlinks: 4,
  section: 5,
  searchText: 6,
};

const FIELD_PENALTY: Record<ProcedureSearchField, number> = {
  id: 0,
  title: 0.01,
  synonyms: 0.03,
  tags: 0.045,
  backlinks: 0.07,
  section: 0.09,
  searchText: 0.18,
};

let fuseInstance: Fuse<ProcedureMeta> | null = null;

export function buildSearchIndex(procedures: ProcedureMeta[]): Fuse<ProcedureMeta> {
  fuseInstance = new Fuse(procedures, {
    keys: [
      { name: "id", weight: 2.4 },
      { name: "title", weight: 2.2 },
      { name: "synonyms", weight: 1.55 },
      { name: "tags", weight: 1.45 },
      { name: "backlinks", weight: 0.55 },
      { name: "section", weight: 0.35 },
      { name: "searchText", weight: 0.5 },
    ],
    threshold: 0.32,
    includeScore: true,
    includeMatches: true,
    ignoreLocation: true,
    ignoreDiacritics: true,
    minMatchCharLength: 2,
  });
  return fuseInstance;
}

function normalizeForSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function tokenizeQuery(query: string): string[] {
  return [...new Set(
    normalizeForSearch(query)
      .split(/[^a-z0-9]+/i)
      .map((part) => part.trim())
      .filter((part) => part.length >= 2)
  )];
}

function normalizeWithMap(value: string) {
  let normalized = "";
  const map: number[] = [];

  for (let index = 0; index < value.length; index += 1) {
    const pieces = value[index]
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();

    for (const piece of pieces) {
      normalized += piece;
      map.push(index);
    }
  }

  return { normalized, map };
}

function collectNormalizedRanges(value: string, terms: string[]): Array<[number, number]> {
  const { normalized, map } = normalizeWithMap(value);
  const ranges: Array<[number, number]> = [];

  for (const term of terms) {
    let start = normalized.indexOf(term);

    while (start !== -1) {
      const end = start + term.length;
      const originalStart = map[start];
      const originalEnd = (map[end - 1] ?? map[map.length - 1] ?? originalStart) + 1;

      if (typeof originalStart === "number" && typeof originalEnd === "number") {
        ranges.push([originalStart, originalEnd]);
      }

      start = normalized.indexOf(term, start + term.length);
    }
  }

  return ranges.sort((left, right) => left[0] - right[0]);
}

function mergeRanges(ranges: Array<[number, number]>): Array<[number, number]> {
  if (!ranges.length) return [];

  const merged: Array<[number, number]> = [ranges[0]];

  for (const [start, end] of ranges.slice(1)) {
    const last = merged[merged.length - 1];
    if (start <= last[1]) {
      last[1] = Math.max(last[1], end);
      continue;
    }

    merged.push([start, end]);
  }

  return merged;
}

function expandToWordBoundary(text: string, index: number, direction: -1 | 1): number {
  let cursor = index;

  while (cursor > 0 && cursor < text.length) {
    const char = direction === -1 ? text[cursor - 1] : text[cursor];
    if (/\s/.test(char)) break;
    cursor += direction;
  }

  return cursor;
}

export function buildSnippet(sourceText: string, query: string, maxLength = 120): SearchSnippet | null {
  const terms = tokenizeQuery(query);
  if (!terms.length) return null;

  const mergedMatches = mergeRanges(collectNormalizedRanges(sourceText, terms));
  if (!mergedMatches.length) return null;

  const [firstStart, firstEnd] = mergedMatches[0];
  const contextBefore = Math.max(24, Math.floor(maxLength * 0.28));
  const contextAfter = Math.max(54, Math.floor(maxLength * 0.52));

  let sliceStart = Math.max(0, firstStart - contextBefore);
  let sliceEnd = Math.min(sourceText.length, firstEnd + contextAfter);

  sliceStart = expandToWordBoundary(sourceText, sliceStart, -1);
  sliceEnd = expandToWordBoundary(sourceText, sliceEnd, 1);

  let snippetText = sourceText.slice(sliceStart, sliceEnd).replace(/\s+/g, " ").trim();
  const hasLeadingEllipsis = sliceStart > 0;
  const hasTrailingEllipsis = sliceEnd < sourceText.length;

  const highlights = mergedMatches
    .filter(([start, end]) => start < sliceEnd && end > sliceStart)
    .map(([start, end]) => [
      Math.max(0, start - sliceStart),
      Math.min(snippetText.length, end - sliceStart),
    ] as [number, number])
    .filter(([start, end]) => end > start);

  if (hasLeadingEllipsis) {
    snippetText = `…${snippetText}`;
    for (const highlight of highlights) {
      highlight[0] += 1;
      highlight[1] += 1;
    }
  }

  if (hasTrailingEllipsis) {
    snippetText = `${snippetText}…`;
  }

  return {
    text: snippetText,
    highlights,
  };
}

function resolveMatchedField(matches: readonly FuseResultMatch[]): ProcedureSearchField {
  const fields = matches
    .map((match) => match.key)
    .filter((key): key is ProcedureSearchField => Boolean(key))
    .sort((left, right) => FIELD_PRIORITY[left] - FIELD_PRIORITY[right]);

  return fields[0] ?? "searchText";
}

function getFieldValues(item: ProcedureMeta, field: ProcedureSearchField): string[] {
  const value = item[field];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === "string");
  return [];
}

function computeMatchBonus(item: ProcedureMeta, field: ProcedureSearchField, query: string): number {
  const normalizedQuery = normalizeForSearch(query.trim());
  if (!normalizedQuery) return 0;

  let bonus = 0;

  for (const value of getFieldValues(item, field)) {
    const normalizedValue = normalizeForSearch(value);
    if (!normalizedValue) continue;

    if (normalizedValue === normalizedQuery) bonus = Math.max(bonus, 0.04);
    else if (normalizedValue.startsWith(normalizedQuery)) bonus = Math.max(bonus, 0.02);
    else if (field !== "searchText" && normalizedValue.includes(normalizedQuery)) bonus = Math.max(bonus, 0.01);
  }

  return bonus;
}

function toProcedureSearchResult(query: string, result: FuseResult<ProcedureMeta>): ProcedureSearchResult {
  const matches = result.matches ?? [];
  const matchedField = resolveMatchedField(matches);
  const baseScore = result.score ?? 1;
  const score = baseScore + FIELD_PENALTY[matchedField] - computeMatchBonus(result.item, matchedField, query);
  const snippet = matchedField === "searchText" ? buildSnippet(result.item.searchText, query) ?? undefined : undefined;

  return {
    item: result.item,
    score,
    matchedField,
    matches,
    snippet,
  };
}

export function search(query: string, procedures: ProcedureMeta[]): ProcedureSearchResult[] {
  if (!query.trim()) return [];

  const fuse = buildSearchIndex(procedures);

  return fuse
    .search(query)
    .map((result) => toProcedureSearchResult(query, result))
    .sort((left, right) => {
      if (left.score !== right.score) return left.score - right.score;
      return FIELD_PRIORITY[left.matchedField] - FIELD_PRIORITY[right.matchedField];
    });
}

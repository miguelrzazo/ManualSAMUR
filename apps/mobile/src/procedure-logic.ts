import { stableRouteKey, type MobileProcedure } from "./data/schema.ts";

export interface ProcedureSearchResult {
  procedure: MobileProcedure;
  /** Lower values are better. Exact identifiers and titles always win. */
  rank: number;
}

export interface ProcedureHeading {
  id: string;
  text: string;
  level: 2 | 3 | 4 | 5 | 6;
}

export interface ProcedureSection {
  key: string;
  heading?: ProcedureHeading;
  lines: string[];
}

/** Guard the UI boundary so a damaged remote snapshot becomes recoverable UI. */
export function isUsableProcedure(value: unknown): value is MobileProcedure {
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
    && Array.isArray(candidate.tags)
    && Array.isArray(candidate.synonyms)
    && Array.isArray(candidate.related)
    && Array.isArray(candidate.backlinks)
    && Array.isArray(candidate.relations)
    && Array.isArray(candidate.editorialBlocks)
    && Array.isArray(candidate.updates)
    && Array.isArray(candidate.attachments);
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

function terms(value: string): string[] {
  return [...new Set(normalize(value).split(" ").filter((term) => term.length > 0))];
}

function hasAllTerms(haystack: string, queryTerms: string[]): boolean {
  return queryTerms.every((term) => haystack.includes(term));
}

function rankProcedure(procedure: MobileProcedure, query: string): number | undefined {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return 100;

  const queryCompact = compact(query);
  const queryTerms = terms(query);
  const id = compact(procedure.id);
  const title = normalize(procedure.title);
  const synonyms = procedure.synonyms.map(normalize).filter(Boolean);
  const tags = procedure.tags.map(normalize).filter(Boolean);
  const searchText = normalize(`${procedure.searchText} ${procedure.content}`);

  // Keep the two strongest lookup contracts explicit: a known ID/title must not
  // be displaced by a fuzzy content hit.
  if (id === queryCompact) return 0;
  if (title === normalizedQuery) return 1;
  if (id.startsWith(queryCompact)) return 2;
  if (title.startsWith(normalizedQuery)) return 3;
  if (synonyms.some((value) => value === normalizedQuery || value === queryCompact)) return 4;
  if (synonyms.some((value) => value.startsWith(normalizedQuery) || value.startsWith(queryCompact))) return 5;
  if (title.includes(normalizedQuery)) return 6;
  if (synonyms.some((value) => value.includes(normalizedQuery))) return 7;
  if (tags.some((value) => value.includes(normalizedQuery))) return 8;
  if (searchText.includes(normalizedQuery)) return 9;
  if (hasAllTerms(normalize(`${procedure.id} ${procedure.title} ${procedure.section} ${synonyms.join(" ")} ${tags.join(" ")} ${searchText}`), queryTerms)) return 10;
  return undefined;
}

/** Deterministic, offline lookup for procedure identifiers, titles, synonyms and full text. */
export function searchProcedures(procedures: MobileProcedure[], query: string, limit = 60): ProcedureSearchResult[] {
  const results = procedures
    .filter(isUsableProcedure)
    .map((procedure, index) => ({ procedure, rank: rankProcedure(procedure, query), index }))
    .filter((result): result is { procedure: MobileProcedure; rank: number; index: number } => result.rank !== undefined)
    .sort((left, right) => left.rank - right.rank || left.procedure.id.localeCompare(right.procedure.id, "es", { numeric: true }) || left.index - right.index);
  return results.slice(0, limit).map(({ procedure, rank }) => ({ procedure, rank }));
}

/** Resolve every supported link form to the one stable native route identity. */
export function resolveProcedureReference(procedures: MobileProcedure[], reference: string): MobileProcedure | undefined {
  const value = String(reference ?? "").trim();
  const usable = procedures.filter(isUsableProcedure);
  return usable.find((procedure) => procedure.id === value)
    ?? usable.find((procedure) => procedure.routeKey === value)
    ?? usable.find((procedure) => procedure.slug === value);
}

export function procedureRouteKey(procedureOrId: MobileProcedure | string): string {
  return stableRouteKey(typeof procedureOrId === "string" ? procedureOrId : procedureOrId.id);
}

function stripInlineMarkdown(value: string): string {
  return value
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_~`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value: string): string {
  return normalize(value).replace(/\s+/g, "-") || "section";
}

/** Split complete procedure markdown without dropping content or taxonomy order. */
export function splitProcedureSections(markdown: string): ProcedureSection[] {
  const sections: ProcedureSection[] = [];
  let current: ProcedureSection = { key: "__start", lines: [] };
  const usedAnchors = new Set<string>();

  const push = () => {
    if (current.lines.length || current.heading) sections.push(current);
  };

  for (const rawLine of String(markdown ?? "").replace(/\r/g, "").split("\n")) {
    const match = rawLine.match(/^\s*(#{2,6})\s+(.+?)\s*#*\s*$/);
    if (!match) {
      current.lines.push(rawLine);
      continue;
    }

    push();
    const text = stripInlineMarkdown(match[2]);
    let id = slugify(text);
    let suffix = 2;
    while (usedAnchors.has(id)) id = `${slugify(text)}-${suffix++}`;
    usedAnchors.add(id);
    const level = match[1].length as 2 | 3 | 4 | 5 | 6;
    current = { key: id, heading: { id, text, level }, lines: [] };
  }
  push();
  return sections;
}

export function procedureHeadings(markdown: string): ProcedureHeading[] {
  return splitProcedureSections(markdown).flatMap((section) => section.heading ? [section.heading] : []);
}

export interface ReadingPositionStore {
  get(routeKey: string): number;
  set(routeKey: string, offset: number): void;
}

export function createReadingPositionStore(): ReadingPositionStore {
  const positions = new Map<string, number>();
  return {
    get: (routeKey) => positions.get(routeKey) ?? 0,
    set: (routeKey, offset) => positions.set(routeKey, Math.max(0, offset)),
  };
}

/** Session-local offsets survive a detail screen being popped and revisited. */
export const readingPositions = createReadingPositionStore();

export type MarkdownRow =
  | { kind: "skip" }
  | { kind: "text" }
  | { kind: "bullet" }
  | { kind: "ordered"; ordinal: number };

export interface MarkdownTable {
  headers: string[];
  rows: string[][];
}

export type MarkdownBlock =
  | { kind: "line"; index: number; line: string; row: MarkdownRow }
  | { kind: "table"; startIndex: number; table: MarkdownTable };

function splitPipeTableRow(line: string): string[] | undefined {
  const trimmed = line.trim();
  if (!trimmed.includes("|")) return undefined;

  const cells: string[] = [];
  let cell = "";
  let escaped = false;
  const body = trimmed.replace(/^\|/, "").replace(/\|$/, "");
  for (const character of body) {
    if (escaped) {
      cell += character;
      escaped = false;
    } else if (character === "\\") {
      escaped = true;
    } else if (character === "|") {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += character;
    }
  }
  if (escaped) cell += "\\";
  cells.push(cell.trim());
  return cells.length >= 2 ? cells : undefined;
}

function isTableSeparatorRow(cells: readonly string[]): boolean {
  return cells.length >= 2 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}

function padTableRow(row: readonly string[], columnCount: number): string[] {
  return Array.from({ length: columnCount }, (_, index) => row[index] ?? "");
}

/** Parse one normalized GFM table and return the first line after it. */
export function parseMarkdownTableAt(lines: readonly string[], startIndex: number): { table: MarkdownTable; nextIndex: number } | undefined {
  const headers = splitPipeTableRow(lines[startIndex] ?? "");
  const separator = splitPipeTableRow(lines[startIndex + 1] ?? "");
  if (!headers || !separator || !isTableSeparatorRow(separator)) return undefined;

  const rawRows: string[][] = [];
  let index = startIndex + 2;
  while (index < lines.length) {
    const row = splitPipeTableRow(lines[index]);
    if (!row || isTableSeparatorRow(row)) break;
    rawRows.push(row);
    index += 1;
  }

  const columnCount = Math.max(headers.length, separator.length, ...rawRows.map((row) => row.length));
  return {
    table: {
      headers: padTableRow(headers, columnCount),
      rows: rawRows.map((row) => padTableRow(row, columnCount)),
    },
    nextIndex: index,
  };
}

/**
 * Classifies the lines of one section for the native renderer, which draws markdown a
 * line at a time rather than parsing it.
 *
 * Ordered items are numbered by a counter owned here, never by the marker in the source.
 * The corpus is scraped from a MediaWiki `#` list, so it writes every item as `1.` (590
 * lines) and occasionally as `11.` (procedure 103, items 10-24) — printing the literal
 * prefix is why the app showed a list of "1." with a stray "11." in the middle. The
 * counter runs while list items are adjacent, tolerates the blank lines of a loose list,
 * and restarts at a paragraph or a heading.
 */
export function classifyMarkdownRows(lines: readonly string[]): MarkdownRow[] {
  let ordinal = 0;
  return lines.map((line) => {
    const result = classifyMarkdownLine(line, ordinal);
    ordinal = result.nextOrdinal;
    return result.row;
  });
}

function classifyMarkdownLine(line: string, previousOrdinal: number): { row: MarkdownRow; nextOrdinal: number } {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("🖨️") || /^#{2,6}\s/.test(trimmed)) {
    // A blank line separates the items of a loose list, so it must not restart the
    // numbering; a heading ends the list outright.
    return { row: { kind: "skip" }, nextOrdinal: trimmed ? 0 : previousOrdinal };
  }
  if (/^(\*|-|•)\s/.test(trimmed)) return { row: { kind: "bullet" }, nextOrdinal: 0 };
  if (/^\d+[.)]\s/.test(trimmed)) {
    const ordinal = previousOrdinal + 1;
    return { row: { kind: "ordered", ordinal }, nextOrdinal: ordinal };
  }
  return { row: { kind: "text" }, nextOrdinal: 0 };
}

/** Split a section into renderable lines and table blocks without losing order. */
export function splitMarkdownBlocks(lines: readonly string[]): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  let ordinal = 0;

  for (let index = 0; index < lines.length;) {
    const table = parseMarkdownTableAt(lines, index);
    if (table) {
      blocks.push({ kind: "table", startIndex: index, table: table.table });
      ordinal = 0;
      index = table.nextIndex;
      continue;
    }

    const classified = classifyMarkdownLine(lines[index], ordinal);
    const row = classified.row;
    // A blank line is allowed inside a loose ordered list, matching the existing
    // classifyMarkdownRows contract. Every other non-list line ends numbering.
    ordinal = classified.nextOrdinal;
    blocks.push({ kind: "line", index, line: lines[index], row });
    index += 1;
  }

  return blocks;
}

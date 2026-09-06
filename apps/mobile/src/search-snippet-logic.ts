/**
 * Contextual snippets for full-text search hits.
 *
 * A result list that answers "atropello" with four procedure names, none of
 * which contain the word, is asking the reader to open all four to find out
 * which one it meant. The snippet shows the sentence the match was actually
 * found in, with the matched words marked, so the answer is on the result row.
 *
 * This mirrors `buildSnippet` in `lib/search.ts` — same normalisation, same
 * word-boundary expansion, same ellipses. It is a deliberate second copy rather
 * than an import: `lib/search.ts` pulls in Fuse.js, and nothing else in the RN
 * bundle reaches outside `apps/mobile`. Keep the two in step if either changes.
 *
 * The output is a list of segments rather than offsets into a string, because
 * that is what a React Native `<Text>` composes: a run of children, some of
 * them styled. Offsets would have to be turned back into segments at every
 * call site.
 */

export interface SnippetSegment {
  text: string;
  /** True for the part of the text that matched the query. */
  match: boolean;
}

export interface SearchSnippet {
  segments: SnippetSegment[];
}

const MIN_TERM_LENGTH = 2;

/** Accent- and case-insensitive, keeping a map back to the original offsets. */
function normalizeWithMap(value: string): { normalized: string; map: number[] } {
  let normalized = "";
  const map: number[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const pieces = value[index]
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase();
    for (const piece of pieces) {
      normalized += piece;
      map.push(index);
    }
  }
  return { normalized, map };
}

export function snippetQueryTerms(query: string): string[] {
  const { normalized } = normalizeWithMap(String(query ?? ""));
  return [...new Set(normalized.split(/[^a-z0-9]+/i).map((part) => part.trim()).filter((part) => part.length >= MIN_TERM_LENGTH))];
}

function collectRanges(value: string, terms: string[]): [number, number][] {
  const { normalized, map } = normalizeWithMap(value);
  const ranges: [number, number][] = [];
  for (const term of terms) {
    let start = normalized.indexOf(term);
    while (start !== -1) {
      const end = start + term.length;
      const originalStart = map[start];
      const originalEnd = (map[end - 1] ?? map[map.length - 1] ?? originalStart) + 1;
      if (typeof originalStart === "number" && typeof originalEnd === "number") ranges.push([originalStart, originalEnd]);
      start = normalized.indexOf(term, start + term.length);
    }
  }
  return ranges.sort((left, right) => left[0] - right[0]);
}

function mergeRanges(ranges: [number, number][]): [number, number][] {
  if (ranges.length === 0) return [];
  const merged: [number, number][] = [[...ranges[0]] as [number, number]];
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

/** Never cut a word in half: walk out to the nearest whitespace. */
function expandToWordBoundary(text: string, index: number, direction: -1 | 1): number {
  let cursor = index;
  while (cursor > 0 && cursor < text.length) {
    const char = direction === -1 ? text[cursor - 1] : text[cursor];
    if (/\s/.test(char)) break;
    cursor += direction;
  }
  return cursor;
}

export function buildSearchSnippet(sourceText: string, query: string, maxLength = 130): SearchSnippet | null {
  const text = String(sourceText ?? "");
  const terms = snippetQueryTerms(query);
  if (terms.length === 0 || text.length === 0) return null;

  const matches = mergeRanges(collectRanges(text, terms));
  if (matches.length === 0) return null;

  const [firstStart, firstEnd] = matches[0];
  const contextBefore = Math.max(24, Math.floor(maxLength * 0.28));
  const contextAfter = Math.max(54, Math.floor(maxLength * 0.52));
  const sliceStart = expandToWordBoundary(text, Math.max(0, firstStart - contextBefore), -1);
  const sliceEnd = expandToWordBoundary(text, Math.min(text.length, firstEnd + contextAfter), 1);

  const segments: SnippetSegment[] = [];
  const push = (value: string, match: boolean) => {
    if (!value) return;
    const last = segments[segments.length - 1];
    if (last && last.match === match) last.text += value;
    else segments.push({ text: value, match });
  };

  if (sliceStart > 0) push("…", false);
  let cursor = sliceStart;
  for (const [start, end] of matches) {
    if (end <= sliceStart || start >= sliceEnd) continue;
    const from = Math.max(start, sliceStart);
    const to = Math.min(end, sliceEnd);
    push(collapse(text.slice(cursor, from)), false);
    push(collapse(text.slice(from, to)), true);
    cursor = to;
  }
  push(collapse(text.slice(cursor, sliceEnd)), false);
  if (sliceEnd < text.length) push("…", false);

  // Trim the whitespace the slice may have started or ended on, without
  // disturbing the ellipses or the matched runs.
  const first = segments[0];
  const last = segments[segments.length - 1];
  if (first) first.text = first.text.replace(/^\s+/, "");
  if (last) last.text = last.text.replace(/\s+$/, "");

  const kept = segments.filter((segment) => segment.text.length > 0);
  return kept.some((segment) => segment.match) ? { segments: kept } : null;
}

function collapse(value: string): string {
  return value.replace(/\s+/g, " ");
}

/**
 * Markdown, flattened to something worth reading in two lines.
 *
 * The body text is raw markdown, and an excerpt cut straight out of it reads
 * like "…o más víctimas confirmadas | | 1.4 | Atropello | | 1.5 | Accidente…" —
 * table scaffolding standing in for the sentence the reader wanted. Cell
 * boundaries become a middot, list bullets and heading marks go, and emphasis
 * marks go with them.
 *
 * Run this *before* building the snippet: the highlight ranges are offsets into
 * whatever string is excerpted, so cleaning afterwards would move the matches
 * out from under them.
 */
export function readableSnippetSource(markdown: string): string {
  return String(markdown ?? "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    // Table separator rows carry no content at all.
    .replace(/^[ \t]*\|?[ \t]*:?-{2,}:?[ \t]*(\|[ \t]*:?-{2,}:?[ \t]*)*\|?[ \t]*$/gm, "\n")
    .replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, "")
    .replace(/^[ \t]*[*+-][ \t]+/gm, "")
    .replace(/^[ \t]*>[ \t]?/gm, "")
    .replace(/\|/g, " · ")
    .replace(/[*_~`]/g, "")
    .replace(/\s+/g, " ")
    // Whitespace first: a table's row boundary is a newline between two pipes,
    // so the run of separators only becomes adjacent once it is collapsed.
    .replace(/(?: *· *)+/g, " · ")
    .trim();
}

/** The plain text of a snippet — what a screen reader should hear. */
export function snippetText(snippet: SearchSnippet): string {
  return snippet.segments.map((segment) => segment.text).join("");
}

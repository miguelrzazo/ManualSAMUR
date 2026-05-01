const MARKDOWN_LINK_RE = /\[[^\]]+\]\(([^)]+)\)/g;
const PROCEDURE_LINK_RE = /(?:^|\/)([0-9][^./]*|[A-Z]{1,3}[^./]*)\.htm(?:$|[#?])/i;

export function deriveRelatedIds(content: string, validIds: Set<string>): string[] {
  const related = new Set<string>();

  for (const match of content.matchAll(MARKDOWN_LINK_RE)) {
    const href = match[1];
    const idMatch = href.match(PROCEDURE_LINK_RE);
    const id = idMatch?.[1];
    if (id && validIds.has(id)) {
      related.add(id);
    }
  }

  return [...related];
}

export function buildBacklinks(
  procedures: Array<{ id: string; related: string[] }>,
): Record<string, string[]> {
  const backlinks: Record<string, Set<string>> = {};

  for (const procedure of procedures) {
    backlinks[procedure.id] ??= new Set<string>();
  }

  for (const procedure of procedures) {
    for (const relatedId of procedure.related) {
      backlinks[relatedId] ??= new Set<string>();
      backlinks[relatedId].add(procedure.id);
    }
  }

  return Object.fromEntries(
    Object.entries(backlinks).map(([id, ids]) => [id, [...ids].sort((a, b) => a.localeCompare(b, "es", { numeric: true }))]),
  );
}

export function extractCodeFamily(code: string): string {
  const alpha = code.match(/^([A-Z]+)/);
  if (alpha) return alpha[1];

  const numeric = code.match(/^(\d+)/);
  if (numeric) return numeric[1];

  return code;
}

export function normalizeCookieIds(
  raw: string | undefined,
  validIds: Set<string>,
  limit: number,
): string[] {
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const ids: string[] = [];
    const seen = new Set<string>();

    for (const value of parsed) {
      if (typeof value !== "string") continue;
      if (!validIds.has(value) || seen.has(value)) continue;
      seen.add(value);
      ids.push(value);
      if (ids.length >= limit) break;
    }

    return ids;
  } catch {
    return [];
  }
}

export function stripMarkdownToText(content: string): string {
  return content
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]+`/g, " ")
    .replace(/!\[[^\]]*]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/^#+\s+/gm, "")
    .replace(/[*_>~-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildAutoSynonyms(id: string, title: string): string[] {
  const normalizedTitle = title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();

  const synonyms = new Set<string>([id, normalizedTitle]);

  if (normalizedTitle.includes("Código")) {
    synonyms.add(normalizedTitle.replace("Código", "Codigo"));
  }

  if (normalizedTitle.includes("PCR")) {
    synonyms.add("parada cardiorrespiratoria");
    synonyms.add("rcp");
  }

  if (normalizedTitle.toLowerCase().includes("ictus")) {
    synonyms.add("acv");
    synonyms.add("codigo 13");
  }

  return [...synonyms];
}

export function buildAutoTags(section: string, title: string, content: string): string[] {
  const tags = new Set<string>([section]);
  const haystack = `${title}\n${content}`.toLowerCase();

  const candidates: Array<[string, string]> = [
    ["PCR", "pcr"],
    ["Ictus", "ictus"],
    ["Trauma", "politrauma"],
    ["Trauma", "trauma"],
    ["Cardiología", "coron"],
    ["Convulsiones", "convuls"],
    ["Psiquiatría", "psiqui"],
    ["Intubación", "intub"],
    ["Vía aérea", "via aerea"],
    ["Hemorragia", "hemorrag"],
    ["Sepsis", "sepsis"],
  ];

  for (const [tag, pattern] of candidates) {
    if (haystack.includes(pattern)) {
      tags.add(tag);
    }
  }

  return [...tags];
}

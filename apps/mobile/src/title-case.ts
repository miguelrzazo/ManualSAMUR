/**
 * Normalises shouting titles that come from the source wiki.
 *
 * The corpus mixes casings: "PARADA CARDIORRESPIRATORIA" and "CRICOTIROIDOTOMÍA"
 * sit directly beside "Cuidados postparada" and "Manejo avanzado de vía aérea"
 * in the same list. This is a rendering concern, not a content one — the package
 * keeps the upstream strings so a sync diff stays meaningful, and the UI decides
 * how to show them.
 *
 * The rule is deliberately conservative, because this corpus is dense with
 * operational and clinical acronyms — SCA, IMV, VISEM, TEP, EPOC, ICTUS, USVA,
 * ETCO2, EZ-IO, INR, SIPE, RENFE — and lower-casing any of them would be worse
 * than the shouting it fixes. A whitelist of acronyms was tried and could not be
 * made complete; this is structural instead:
 *
 *  1. Every alphabetic word in the title must be uppercase. One mixed-case word
 *     ("INTRODUCTOR DE FROVA 14,0 Fr (adultos)") means the title is already
 *     deliberate and is left exactly as written.
 *  2. The title must carry at least 10 letters and one word of 7+ letters, so a
 *     bare "SVA", "PCR" or "OVACE" is never touched.
 *  3. Within a qualifying title, words of 4 letters or fewer stay uppercase —
 *     they are almost certainly acronyms ("PCR TRAUMÁTICA" → "PCR traumática").
 *
 * Sentence case, not title case, because that is what the rest of the corpus
 * uses.
 */

const LETTERS = /\p{L}/u;

function isUppercaseWord(word: string): boolean {
  const letters = word.replace(/[^\p{L}]/gu, "");
  return letters === letters.toLocaleUpperCase("es");
}

function letterCount(word: string): number {
  return word.replace(/[^\p{L}]/gu, "").length;
}

/** True when a title is shouting loudly enough, and safely enough, to normalise. */
export function isShoutingTitle(title: string): boolean {
  const words = title.split(/\s+/).filter((word) => LETTERS.test(word));
  if (words.length === 0) return false;
  if (!words.every(isUppercaseWord)) return false;
  const total = words.reduce((sum, word) => sum + letterCount(word), 0);
  if (total < 10) return false;
  return words.some((word) => letterCount(word) >= 7);
}

/** Returns the title as written, unless it is shouting. */
export function displayTitle(title: string): string {
  if (!title || !isShoutingTitle(title)) return title;

  let firstWordSeen = false;
  return title
    .split(/(\s+)/)
    .map((word) => {
      if (!LETTERS.test(word)) return word;
      // Short words in an all-caps title are acronyms far more often than not.
      if (letterCount(word) <= 4) {
        firstWordSeen = true;
        return word;
      }
      const lower = word.toLocaleLowerCase("es");
      if (firstWordSeen) return lower;
      firstWordSeen = true;
      return lower.charAt(0).toLocaleUpperCase("es") + lower.slice(1);
    })
    .join("");
}

/**
 * Display form for a short label that comes from a data key rather than from prose:
 * a code group (`sva`, `incidente`), a change kind (`nuevo`, `revisado`).
 *
 * These were rendered with `.toUpperCase()`, which is right for `sva` and wrong for
 * `indicativos` — one is an acronym, the other is a word being shouted at the reader.
 * The explicit map settles the acronyms; everything else gets sentence case. A map,
 * not a length heuristic, because `lima` and `icao` are both four letters and only one
 * of them is an acronym.
 */
const LABEL_ACRONYMS = new Set(["sva", "svb", "upsi", "upsq", "icao", "uro", "pcr", "tetra", "drp"]);

export function displayLabel(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  if (LABEL_ACRONYMS.has(trimmed.toLocaleLowerCase("es"))) return trimmed.toLocaleUpperCase("es");
  if (!isUppercaseWord(trimmed) && trimmed !== trimmed.toLocaleLowerCase("es")) return trimmed;
  const lower = trimmed.toLocaleLowerCase("es");
  return lower.charAt(0).toLocaleUpperCase("es") + lower.slice(1);
}

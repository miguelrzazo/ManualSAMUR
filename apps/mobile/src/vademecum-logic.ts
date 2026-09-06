/**
 * Pure logic for the Vademécum tab. Mirrors the organisation/data that
 * `components/vademecum/VademecumView.tsx` and `lib/vademecum-config.ts`
 * implement for the web (four domains, category filters, A-Z sections) —
 * expressed with native gestures (SectionList/FlatList, sticky section
 * headers) instead of a DOM port, the same instruction that produced the
 * Códigos screen (see codigos-logic.ts).
 *
 * Reuses `reference-search-logic.ts`'s `buildVademecumReferences` for the
 * canonical id/title/subtitle/routeKey/targetId shape (and its search), so
 * this module only adds domain organisation on top: which domain a result
 * belongs to, its category/type for filtering, and A-Z grouping.
 *
 * Kept free of React Native imports so it can run under plain Node in tests.
 */

import type { MobileReferenceKind, MobileReferenceSearchResult } from "./reference-search-logic";

export type VademecumTabKey = "farmacos" | "comerciales" | "perfusiones" | "fluidos";

export interface VademecumTabMeta {
  key: VademecumTabKey;
  label: string;
  icon: "pill" | "tag-multiple-outline" | "iv-bag" | "water-outline";
}

/** Order and labels mirror `VADEMECUM_TABS` in `lib/vademecum-config.ts`. */
export const VADEMECUM_TABS: readonly VademecumTabMeta[] = [
  { key: "farmacos", label: "Fármacos", icon: "pill" },
  { key: "perfusiones", label: "Perfusiones", icon: "iv-bag" },
  { key: "fluidos", label: "Fluidos", icon: "water-outline" },
  { key: "comerciales", label: "Comerciales", icon: "tag-multiple-outline" },
] as const;

const TAB_TO_KIND: Record<VademecumTabKey, MobileReferenceKind> = {
  farmacos: "drug",
  comerciales: "commercialName",
  perfusiones: "perfusion",
  fluidos: "fluid",
};

export function kindForTab(tab: VademecumTabKey): MobileReferenceKind {
  return TAB_TO_KIND[tab];
}

/** Identity colour per category, matching the web's `CATEGORY_COLORS` dot values. */
export const CATEGORY_ACCENTS: Record<string, string> = {
  "Cardiovascular": "#ef4444",
  "Analgesia y Sedación": "#8b5cf6",
  "Respiratorio": "#0ea5e9",
  "Metabólico": "#14b8a6",
  "Antídotos": "#f59e0b",
  "Obstétrico": "#ec4899",
  "Psiquiátrico": "#a855f7",
  "Neurológico": "#6366f1",
  "Fluidos IV": "#3b82f6",
  "Vasoactivos": "#ef4444",
  "Antiarrítmicos": "#f97316",
  "Otros": "#94a3b8",
};

export function categoryAccent(category: string): string {
  return CATEGORY_ACCENTS[category] ?? CATEGORY_ACCENTS["Otros"];
}

/** Extracts the domain-specific grouping field: `category` for drugs/perfusions, `type` for fluids. */
export function categoryOf(reference: MobileReferenceSearchResult): string {
  const detail = reference.detail ?? {};
  const value = reference.kind === "fluid" ? detail.type : detail.category;
  return typeof value === "string" && value.trim() ? value.trim() : "Otros";
}

/** Filters a reference list down to those belonging to one Vademécum domain/tab. */
export function filterByTab(references: MobileReferenceSearchResult[], tab: VademecumTabKey): MobileReferenceSearchResult[] {
  const kind = kindForTab(tab);
  return references.filter((reference) => reference.kind === kind);
}

/** Categories/types present in a domain, in first-seen order (matches the web's `[...new Set(...)]`). */
export function uniqueCategories(references: MobileReferenceSearchResult[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const reference of references) {
    const category = categoryOf(reference);
    if (!seen.has(category)) {
      seen.add(category);
      ordered.push(category);
    }
  }
  return ordered;
}

export function filterByCategory(references: MobileReferenceSearchResult[], category: string | null): MobileReferenceSearchResult[] {
  if (!category) return references;
  return references.filter((reference) => categoryOf(reference) === category);
}

export function sortByTitle(references: MobileReferenceSearchResult[]): MobileReferenceSearchResult[] {
  return [...references].sort((left, right) => left.title.localeCompare(right.title, "es", { sensitivity: "base" }));
}

/** A tab shows an A-Z index; `farmacos` and `comerciales` mirror the web's alphabet nav. */
export function supportsAlphabetNav(tab: VademecumTabKey): boolean {
  return tab === "farmacos" || tab === "comerciales";
}

export interface VademecumAlphabetSection {
  key: string;
  data: MobileReferenceSearchResult[];
}

function initialLetter(value: string): string {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleUpperCase("es")
    .trim();
  const letter = normalized.charAt(0);
  return /^[A-Z]$/.test(letter) ? letter : "#";
}

/** Groups already-sorted-by-domain references into A-Z sections; "#" (non-letter leads) sorts first. */
export function buildAlphabetSections(references: MobileReferenceSearchResult[]): VademecumAlphabetSection[] {
  const grouped = new Map<string, MobileReferenceSearchResult[]>();
  for (const reference of sortByTitle(references)) {
    const key = initialLetter(reference.title);
    const bucket = grouped.get(key);
    if (bucket) bucket.push(reference);
    else grouped.set(key, [reference]);
  }
  return [...grouped.entries()]
    .sort(([left], [right]) => {
      if (left === "#") return -1;
      if (right === "#") return 1;
      return left.localeCompare(right, "es", { sensitivity: "base" });
    })
    .map(([key, data]) => ({ key, data }));
}

/**
 * Groups a domain's references by category/type, sorted by category order of
 * first appearance then by title within each group — used for perfusiones and
 * fluidos, which the web renders as a flat, category-filterable grid rather
 * than an alphabet index.
 */
export interface VademecumCategorySection {
  key: string;
  data: MobileReferenceSearchResult[];
}

export function buildCategorySections(references: MobileReferenceSearchResult[]): VademecumCategorySection[] {
  const categories = uniqueCategories(references);
  return categories.map((category) => ({
    key: category,
    data: sortByTitle(filterByCategory(references, category)),
  }));
}

// ─── A-Z scrollspy ───────────────────────────────────────────────────────────

/**
 * Which letter the reader is currently in, from a `SectionList`'s viewable
 * items.
 *
 * The A-Z row used to be write-only: it could send you to a letter but never
 * told you where you were, so after two swipes the index and the list disagreed
 * about the answer to the same question. `onViewableItemsChanged` reports items
 * in list order, so the first one still on screen is the section the reader is
 * reading; entries without a section (section headers themselves, on some RN
 * versions) are ignored rather than treated as a gap.
 */
export function activeSectionKey(viewable: { sectionKey: string | null | undefined }[]): string | null {
  for (const entry of viewable) {
    if (typeof entry.sectionKey === "string" && entry.sectionKey.length > 0) return entry.sectionKey;
  }
  return null;
}

/**
 * A tap has to win over the scrollspy until the jump lands.
 *
 * `scrollToLocation` animates through every letter between here and there, and
 * each one is briefly the viewable section — so without this the pill row
 * strobes through the alphabet on every tap and settles last, which reads as the
 * control fighting the user. `pending` is set on tap and cleared when the scroll
 * comes to rest.
 */
export function resolveActiveLetter(pending: string | null, observed: string | null): string | null {
  return pending ?? observed;
}

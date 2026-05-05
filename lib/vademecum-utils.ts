import type { VademecumTabKey } from "./vademecum-config.ts";

export interface AlphabetSection<T> {
  key: string;
  items: T[];
}

export interface VademecumRouteState {
  initialTab: VademecumTabKey;
  highlightedDrugId: string | null;
}

export interface VademecumDrugReference {
  id: string;
  name: string;
  synonyms?: string[];
}

export function normalizeForSearch(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDrugReferenceKey(value: string): string {
  return normalizeForSearch(value).replace(/[^a-z0-9]+/g, "");
}

export function normalizeInitialLetter(value: string): string {
  const normalized = normalizeForSearch(value);
  const letter = normalized.charAt(0).toUpperCase();
  return /^[A-Z]$/.test(letter) ? letter : "#";
}

export function buildAlphabetSections<T>(
  items: T[],
  getLabel: (item: T) => string,
): AlphabetSection<T>[] {
  const grouped = new Map<string, T[]>();

  for (const item of items) {
    const key = normalizeInitialLetter(getLabel(item));
    const bucket = grouped.get(key);
    if (bucket) {
      bucket.push(item);
    } else {
      grouped.set(key, [item]);
    }
  }

  return [...grouped.entries()]
    .sort(([left], [right]) => {
      if (left === "#") return -1;
      if (right === "#") return 1;
      return left.localeCompare(right, "es", { sensitivity: "base" });
    })
    .map(([key, bucket]) => ({
      key,
      items: [...bucket].sort((left, right) =>
        getLabel(left).localeCompare(getLabel(right), "es", { sensitivity: "base" }),
      ),
    }));
}

function getFirstValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value.find(Boolean)?.trim() ?? null;
  return value?.trim() || null;
}

export function resolveDrugIdReference(
  reference: string,
  drugs: VademecumDrugReference[],
): string | null {
  const lookupKey = normalizeDrugReferenceKey(reference);
  if (!lookupKey) return null;

  for (const drug of drugs) {
    if (normalizeDrugReferenceKey(drug.id) === lookupKey) return drug.id;
    if (normalizeDrugReferenceKey(drug.name) === lookupKey) return drug.id;

    for (const synonym of drug.synonyms ?? []) {
      if (normalizeDrugReferenceKey(synonym) === lookupKey) return drug.id;
    }
  }

  return null;
}

export function buildVademecumHref(referenceOrDrugId: string): string {
  return `/vademecum?farmaco=${encodeURIComponent(referenceOrDrugId)}`;
}

export function resolveVademecumRouteState(searchParams: {
  farmaco?: string | string[];
  q?: string | string[];
}, drugs: VademecumDrugReference[] = []): VademecumRouteState {
  const farmaco = getFirstValue(searchParams.farmaco);
  const legacyQuery = getFirstValue(searchParams.q);
  const highlightedDrugId = farmaco
    ? resolveDrugIdReference(farmaco, drugs) ?? farmaco
    : legacyQuery
      ? resolveDrugIdReference(legacyQuery, drugs)
      : null;

  return {
    initialTab: "farmacos",
    highlightedDrugId,
  };
}

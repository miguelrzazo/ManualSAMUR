import type { VademecumTabKey } from "./vademecum-config.ts";

export interface AlphabetSection<T> {
  key: string;
  items: T[];
}

export interface VademecumRouteState {
  initialTab: VademecumTabKey;
  highlightedDrugId: string | null;
}

export function normalizeForSearch(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
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

export function resolveVademecumRouteState(searchParams: {
  farmaco?: string | string[];
  q?: string | string[];
}): VademecumRouteState {
  return {
    initialTab: "farmacos",
    highlightedDrugId: getFirstValue(searchParams.farmaco),
  };
}

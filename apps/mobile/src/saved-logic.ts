import type { MobileContent } from "./data/schema.ts";
import { procedureRouteKey, resolveProcedureReference } from "./procedure-logic.ts";
import { buildCodeReferences, buildVademecumReferences, type MobileReferenceKind, type MobileReferenceSearchResult } from "./reference-search-logic.ts";
import { locationRecords, locationRouteKey, resolveLocationRoute, type LocationRecord } from "./location-logic.ts";

/** A local-only, typed identity used by both Favorites and Recents. */
export type SavedRouteKind = "procedure" | Exclude<MobileReferenceKind, "abbreviation"> | "hospital" | "base";

export interface SavedReference {
  routeKey: string;
  kind: SavedRouteKind;
  id: string;
  title: string;
  subtitle: string;
}

export interface StaleSavedReference {
  routeKey: string;
  kind: "stale";
  id: string;
  title: string;
  subtitle: string;
  stale: true;
}

export type ResolvedSavedReference = SavedReference | StaleSavedReference;

export const FAVORITES_STORAGE_KEY = "manualsamur.preferences.favorites";
export const RECENTS_STORAGE_KEY = "manualsamur.preferences.recents";
export const MAX_RECENTS = 12;

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Older mobile builds stored procedure ids (for example `301`) rather than
 * route identities. Keep those records, but normalize them at the boundary.
 * Unknown route keys are deliberately retained so the UI can explain stale
 * content instead of silently deleting a user's saved reference.
 */
export function normalizeSavedRouteKey(value: unknown): string | undefined {
  if (value && typeof value === "object") {
    const candidate = value as { routeKey?: unknown; id?: unknown };
    value = candidate.routeKey ?? candidate.id;
  }
  const key = clean(value);
  if (!key) return undefined;
  if (!key.includes(":")) return procedureRouteKey(key);
  return key;
}

export function parseSavedRouteKeys(serialized: string | null | undefined): string[] {
  if (!serialized) return [];
  try {
    const parsed: unknown = JSON.parse(serialized);
    if (!Array.isArray(parsed)) return [];
    return uniqueSavedRouteKeys(parsed);
  } catch {
    return [];
  }
}

export function uniqueSavedRouteKeys(values: readonly unknown[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const key = normalizeSavedRouteKey(value);
    if (key && !seen.has(key)) {
      seen.add(key);
      result.push(key);
    }
  }
  return result;
}

export function serializeSavedRouteKeys(values: readonly string[]): string {
  return JSON.stringify(uniqueSavedRouteKeys(values));
}

export function toggleSavedRouteKey(values: readonly string[], routeKey: string): string[] {
  const normalized = normalizeSavedRouteKey(routeKey);
  if (!normalized) return uniqueSavedRouteKeys(values);
  const current = uniqueSavedRouteKeys(values);
  return current.includes(normalized) ? current.filter((key) => key !== normalized) : [normalized, ...current];
}

export function pushRecentRouteKey(values: readonly string[], routeKey: string, limit = MAX_RECENTS): string[] {
  const normalized = normalizeSavedRouteKey(routeKey);
  if (!normalized) return uniqueSavedRouteKeys(values).slice(0, limit);
  return [normalized, ...uniqueSavedRouteKeys(values).filter((key) => key !== normalized)].slice(0, limit);
}

// ─── Recent search queries ───────────────────────────────────────────────────

export const RECENT_QUERIES_STORAGE_KEY = "manualsamur.preferences.recentQueries";
export const MAX_RECENT_QUERIES = 8;
/** One or two characters is a keystroke on the way somewhere, not a search worth keeping. */
const MIN_RECORDED_QUERY_LENGTH = 3;

/**
 * Recent *queries*, as distinct from recent *routes* above. Buscar is a destination now,
 * so it has to show something before the user types; what they searched for last is the
 * only thing it can honestly offer.
 *
 * Deduplication is accent- and case-insensitive because the corpus is Spanish and nobody
 * types "vía aérea" and "via aerea" meaning two different things — but the string kept is
 * the one the user actually typed, accents and all.
 */
function queryFingerprint(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es");
}

export function normalizeRecentQuery(value: unknown): string | undefined {
  const query = clean(value).replace(/\s+/g, " ");
  return query.length >= MIN_RECORDED_QUERY_LENGTH ? query : undefined;
}

export function uniqueRecentQueries(values: readonly unknown[], limit = MAX_RECENT_QUERIES): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const query = normalizeRecentQuery(value);
    if (!query) continue;
    const fingerprint = queryFingerprint(query);
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    result.push(query);
  }
  return result.slice(0, limit);
}

export function parseRecentQueries(serialized: string | null | undefined, limit = MAX_RECENT_QUERIES): string[] {
  if (!serialized) return [];
  try {
    const parsed: unknown = JSON.parse(serialized);
    return Array.isArray(parsed) ? uniqueRecentQueries(parsed, limit) : [];
  } catch {
    return [];
  }
}

export function pushRecentQuery(values: readonly string[], query: string, limit = MAX_RECENT_QUERIES): string[] {
  const normalized = normalizeRecentQuery(query);
  if (!normalized) return uniqueRecentQueries(values, limit);
  return uniqueRecentQueries([normalized, ...values], limit);
}

export function removeRecentQuery(values: readonly string[], query: string, limit = MAX_RECENT_QUERIES): string[] {
  const fingerprint = queryFingerprint(clean(query));
  return uniqueRecentQueries(values.filter((value) => queryFingerprint(value) !== fingerprint), limit);
}

function referenceToSaved(reference: MobileReferenceSearchResult): SavedReference {
  if (reference.kind === "abbreviation") throw new Error("Abbreviations are not saveable references");
  return {
    routeKey: reference.routeKey,
    kind: reference.kind,
    id: reference.id,
    title: reference.title,
    subtitle: reference.subtitle,
  };
}

function locationToSaved(location: LocationRecord): SavedReference {
  return {
    routeKey: locationRouteKey(location),
    kind: location.kind,
    id: location.id,
    title: location.shortName || location.name,
    subtitle: `${location.kind === "hospital" ? "Hospital" : "Base"} · ${location.address}`,
  };
}

export function savedReferenceIndex(content: MobileContent): Map<string, SavedReference> {
  const index = new Map<string, SavedReference>();
  for (const procedure of content.procedures) {
    index.set(procedureRouteKey(procedure), {
      routeKey: procedureRouteKey(procedure),
      kind: "procedure",
      id: procedure.id,
      title: procedure.title,
      subtitle: `${procedure.section} · Procedimiento`,
    });
  }
  for (const reference of [...buildVademecumReferences(content), ...buildCodeReferences(content.codes)]) {
    index.set(reference.routeKey, referenceToSaved(reference));
  }
  for (const location of locationRecords(content)) index.set(locationRouteKey(location), locationToSaved(location));
  return index;
}

export function resolveSavedReference(content: MobileContent, routeKey: string): ResolvedSavedReference {
  const normalized = normalizeSavedRouteKey(routeKey) ?? routeKey;
  const resolved = savedReferenceIndex(content).get(normalized);
  if (resolved) return resolved;
  return {
    routeKey: normalized,
    kind: "stale",
    id: normalized,
    title: "Referencia no disponible",
    subtitle: "Ya no está incluida en el paquete local",
    stale: true,
  };
}

/** Only a successfully resolved detail may call this helper. */
export function canRecordRecent(content: MobileContent, routeKey: string): boolean {
  const normalized = normalizeSavedRouteKey(routeKey);
  if (!normalized) return false;
  if (normalized.startsWith("procedure:")) return Boolean(resolveProcedureReference(content.procedures, normalized));
  if (normalized.startsWith("location:")) return Boolean(resolveLocationRoute(locationRecords(content), normalized));
  return savedReferenceIndex(content).has(normalized);
}

export function selectSavedReferences(content: MobileContent, routeKeys: readonly string[]): ResolvedSavedReference[] {
  return uniqueSavedRouteKeys(routeKeys).map((routeKey) => resolveSavedReference(content, routeKey));
}

export function savedReferenceIcon(kind: SavedRouteKind | "stale"): "clipboard-text-outline" | "pill" | "radio-handheld" | "hospital-building" | "ambulance" | "alert-circle-outline" {
  if (kind === "procedure") return "clipboard-text-outline";
  if (kind === "drug" || kind === "perfusion" || kind === "fluid" || kind === "commercialName") return "pill";
  if (kind === "code") return "radio-handheld";
  if (kind === "hospital") return "hospital-building";
  if (kind === "base") return "ambulance";
  return "alert-circle-outline";
}

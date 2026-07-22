"use client";

import { normalizeCookieIds } from "@/lib/manual-data";

export const FAVORITES_COOKIE = "samur_favorites";
export const RECENT_COOKIE = "samur_recent";
export const SEEN_EVENTS_COOKIE = "samur_seen_events";
export const COOKIE_LIMIT = 12;
/**
 * Tope de eventos "vistos" que se conservan.
 *
 * A diferencia de favoritos/recientes, esta lista crecía sin límite. Con 630 eventos
 * a ~45 B por id se supera el máximo de ~4 KB por cookie; el navegador la descarta
 * en silencio y *todo* el estado de "visto" se pierde, así que las insignias vuelven
 * a salir en rojo. Se guardan solo los más recientes: los ids antiguos ya no importan
 * porque sus eventos han salido de la ventana de novedades.
 */
export const SEEN_EVENTS_LIMIT = 60;
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function readRawCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;

  const value = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${name}=`))
    ?.slice(name.length + 1);

  return value ? decodeURIComponent(value) : undefined;
}

function writeRawCookie(name: string, value: string) {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`;
}

export function readCollectionCookie(name: string, validIds: Set<string>, limit = COOKIE_LIMIT): string[] {
  return normalizeCookieIds(readRawCookie(name), validIds, limit);
}

export function writeCollectionCookie(name: string, ids: string[]) {
  writeRawCookie(name, JSON.stringify(ids));
}

export function toggleFavoriteId(currentIds: string[], id: string, limit = COOKIE_LIMIT): string[] {
  if (currentIds.includes(id)) {
    return currentIds.filter((currentId) => currentId !== id);
  }

  return [id, ...currentIds].slice(0, limit);
}

export function pushRecentId(currentIds: string[], id: string, limit = COOKIE_LIMIT): string[] {
  return [id, ...currentIds.filter((currentId) => currentId !== id)].slice(0, limit);
}

export function readSeenEventIds(): string[] {
  const raw = readRawCookie(SEEN_EVENTS_COOKIE);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function writeSeenEventIds(ids: string[]) {
  // Se recorta también al escribir: así una cookie heredada de antes del tope no
  // puede seguir creciendo hasta romperse.
  writeRawCookie(SEEN_EVENTS_COOKIE, JSON.stringify(ids.slice(-SEEN_EVENTS_LIMIT)));
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("samur:seen-events-updated"));
  }
}

export function addSeenEventId(seenIds: string[], eventId: string): string[] {
  if (seenIds.includes(eventId)) return seenIds;
  return [...seenIds, eventId].slice(-SEEN_EVENTS_LIMIT);
}

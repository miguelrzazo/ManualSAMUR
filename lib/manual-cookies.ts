"use client";

import { normalizeCookieIds } from "@/lib/manual-data";

export const FAVORITES_COOKIE = "samur_favorites";
export const RECENT_COOKIE = "samur_recent";
export const COOKIE_LIMIT = 12;
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

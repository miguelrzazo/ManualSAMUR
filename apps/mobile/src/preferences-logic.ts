export type AppearancePreference = "system" | "light" | "dark";

export const appearancePreferences: readonly AppearancePreference[] = ["system", "light", "dark"];

export function parseAppearancePreference(value: unknown): AppearancePreference {
  return value === "light" || value === "dark" ? value : "system";
}

export function hasAcknowledgedDisclosure(value: string | null): boolean {
  return value === "acknowledged";
}

/**
 * First-launch baseline for "Novedades".
 *
 * A fresh install has no read state, so every update event in the publication counted
 * as unread: the first backend release (28-10-2026) carries one "nuevo" event per
 * procedure, and a new user opened the app to "Novedades · 223". None of it was new
 * *to them*. On the first launch the app now stores the moment it was installed, and
 * every event already published by then (the bundled seed's and the active release's
 * alike) counts as seen. Only updates approved after that moment are news.
 *
 * Existing installs are left alone: anyone who already acknowledged the first-use
 * notice or has stored read state gets no baseline, so their unread list is unchanged.
 */
export const NOVEDADES_BASELINE_KEY = "manualsamur.preferences.novedadesBaseline.v1";

export interface NovedadesBaselineInputs {
  storedBaseline: string | null;
  storedDisclosure: string | null;
  storedSeenEvents: string | null;
  now: Date;
}

/** The `baselineAt` to use, and `persist` when it has to be written (first launch only). */
export function resolveNovedadesBaseline({ storedBaseline, storedDisclosure, storedSeenEvents, now }: NovedadesBaselineInputs): { baselineAt?: string; persist?: string } {
  if (storedBaseline && !Number.isNaN(new Date(storedBaseline).getTime())) return { baselineAt: storedBaseline };
  const existingInstall = hasAcknowledgedDisclosure(storedDisclosure) || storedSeenEvents !== null;
  if (existingInstall) return {};
  const baselineAt = now.toISOString();
  return { baselineAt, persist: baselineAt };
}

/** Whether an update event still counts as unread for this reader. */
export function isUnreadNovedad(
  event: { eventId: string; approvedAt?: string; effectiveDate: string },
  seenEventIds: ReadonlySet<string>,
  baselineAt?: string,
): boolean {
  if (seenEventIds.has(event.eventId)) return false;
  if (!baselineAt) return true;
  const baseline = new Date(baselineAt).getTime();
  const published = new Date(event.approvedAt ?? event.effectiveDate).getTime();
  // An event with no usable date cannot be shown to postdate the install.
  if (Number.isNaN(published)) return false;
  return published > baseline;
}

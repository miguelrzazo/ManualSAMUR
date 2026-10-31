export const CONTENT_CHECK_STORAGE_KEY = "manualsamur.content.check.v1";
/** Automatic checks are intentionally sparse so resuming the app does not spam the source. */
export const AUTOMATIC_REFRESH_COOLDOWN_MS = 6 * 60 * 60 * 1000;

export type ContentCheckOutcome = "up-to-date" | "update-available" | "offline" | "invalid-response" | "incompatible" | "failure";

export interface ContentCheckRecord {
  checkedAt: string;
  outcome: ContentCheckOutcome;
  remoteIdentity?: string;
  remoteGeneratedAt?: string;
  errorMessage?: string;
  /**
   * Last time the server confirmed the active content is current (304, an
   * identical manifest, or a freshly activated release). Carried across
   * failed checks so "sin verificar desde" survives a run of offline launches.
   */
  verifiedAt?: string;
}


export function parseContentCheckRecord(serialized: string | null | undefined): ContentCheckRecord | undefined {
  if (!serialized) return undefined;
  try {
    const value: unknown = JSON.parse(serialized);
    if (!value || typeof value !== "object") return undefined;
    const record = value as Partial<ContentCheckRecord>;
    if (typeof record.checkedAt !== "string" || typeof record.outcome !== "string") return undefined;
    if (!["up-to-date", "update-available", "offline", "invalid-response", "incompatible", "failure"].includes(record.outcome)) return undefined;
    return {
      checkedAt: record.checkedAt,
      outcome: record.outcome as ContentCheckOutcome,
      ...(typeof record.remoteIdentity === "string" ? { remoteIdentity: record.remoteIdentity } : {}),
      ...(typeof record.remoteGeneratedAt === "string" ? { remoteGeneratedAt: record.remoteGeneratedAt } : {}),
      ...(typeof record.errorMessage === "string" ? { errorMessage: record.errorMessage } : {}),
      ...(typeof record.verifiedAt === "string" ? { verifiedAt: record.verifiedAt } : {}),
    };
  } catch {
    return undefined;
  }
}

export function serializeContentCheckRecord(record: ContentCheckRecord): string {
  return JSON.stringify(record);
}

export function contentCheckRecordFor(
  outcome: ContentCheckOutcome,
  now: string,
  errorMessage?: string,
): ContentCheckRecord {
  return {
    checkedAt: now,
    outcome,
    ...(errorMessage ? { errorMessage } : {}),
  };
}


export function userFacingContentCheckError(outcome: ContentCheckOutcome): string {
  switch (outcome) {
    case "offline": return "Sin conexión con el servidor; se mantienen los datos guardados.";
    case "invalid-response": return "La publicación recibida no supera la verificación; se mantienen los datos guardados.";
    case "incompatible": return "La publicación requiere una versión nueva de la aplicación; se mantienen los datos guardados.";
    case "failure": return "El servidor no respondió correctamente; se mantienen los datos guardados.";
    default: return "";
  }
}

export function automaticRefreshAllowed(lastAttemptAt: number | undefined, now = Date.now(), cooldownMs = AUTOMATIC_REFRESH_COOLDOWN_MS): boolean {
  if (lastAttemptAt === undefined || !Number.isFinite(lastAttemptAt)) return true;
  return now - lastAttemptAt >= cooldownMs;
}

/** Only a real background/inactive → active transition triggers a resume check. */
export function shouldRefreshOnResume(
  previous: string,
  next: string,
  lastAttemptAt: number | undefined,
  now = Date.now(),
  cooldownMs = AUTOMATIC_REFRESH_COOLDOWN_MS,
): boolean {
  return next === "active" && previous !== "active" && automaticRefreshAllowed(lastAttemptAt, now, cooldownMs);
}

/** Failed automatic checks retry sooner than successful ones, but not on every resume. */
export const FAILED_CHECK_RETRY_MS = 15 * 60 * 1000;
/** Data the server has not confirmed for this long, while offline, gets the banner. */
export const STALE_DATA_AFTER_MS = 24 * 60 * 60 * 1000;

/** Keep the last confirmation time when a later check fails. */
export function mergeCheckRecord(previous: ContentCheckRecord | undefined, next: ContentCheckRecord): ContentCheckRecord {
  if (next.verifiedAt || !previous?.verifiedAt) return next;
  return { ...next, verifiedAt: previous.verifiedAt };
}

/**
 * Whether an automatic (launch/foreground) check should run now. Persisted,
 * so relaunching the app does not bypass the ~6 h throttle. The bundled seed
 * is always due: it must be replaced as soon as any network is available.
 */
export function automaticSyncDue(
  lastCheck: ContentCheckRecord | undefined,
  isSeed: boolean,
  now = Date.now(),
  cooldownMs = AUTOMATIC_REFRESH_COOLDOWN_MS,
  failedRetryMs = FAILED_CHECK_RETRY_MS,
): boolean {
  if (isSeed || !lastCheck) return true;
  const checkedAt = Date.parse(lastCheck.checkedAt);
  if (!Number.isFinite(checkedAt) || checkedAt > now) return true;
  const wait = lastCheck.outcome === "up-to-date" ? cooldownMs : failedRetryMs;
  return now - checkedAt >= wait;
}

/**
 * The offline banner: only when the last check could not reach the server and
 * what is on screen is the seed or has not been confirmed for a day.
 */
export function isOfflineWithStaleData(
  lastCheck: ContentCheckRecord | undefined,
  isSeed: boolean,
  now = Date.now(),
  staleAfterMs = STALE_DATA_AFTER_MS,
): boolean {
  if (lastCheck?.outcome !== "offline") return false;
  if (isSeed) return true;
  const verifiedAt = lastCheck.verifiedAt ? Date.parse(lastCheck.verifiedAt) : Number.NaN;
  return !Number.isFinite(verifiedAt) || now - verifiedAt >= staleAfterMs;
}

const MADRID = "Europe/Madrid";

/** es-ES in Spain's time zone, falling back to the device zone if the engine lacks tz data. */
function spanish(date: Date, kind: "date" | "time", options: Intl.DateTimeFormatOptions): string {
  try {
    return kind === "date"
      ? date.toLocaleDateString("es-ES", { ...options, timeZone: MADRID })
      : date.toLocaleTimeString("es-ES", { ...options, timeZone: MADRID });
  } catch {
    return kind === "date" ? date.toLocaleDateString("es-ES", options) : date.toLocaleTimeString("es-ES", options);
  }
}

/** "28 de octubre de 2026": the publication date, in Spain's calendar. */
export function formatDataDate(value: string | null | undefined): string {
  const time = value ? new Date(value) : undefined;
  if (!time || !Number.isFinite(time.getTime())) return "fecha no disponible";
  return spanish(time, "date", { day: "numeric", month: "long", year: "numeric" });
}

/** "hoy, 9:14", "ayer, 18:02" or "28 oct 2026, 9:14". */
export function formatCheckedAt(value: string | undefined, now = new Date()): string | undefined {
  const time = value ? new Date(value) : undefined;
  if (!time || !Number.isFinite(time.getTime())) return undefined;
  const clock = spanish(time, "time", { hour: "numeric", minute: "2-digit" });
  const day = (date: Date) => spanish(date, "date", { year: "numeric", month: "2-digit", day: "2-digit" });
  if (day(time) === day(now)) return `hoy, ${clock}`;
  if (day(time) === day(new Date(now.getTime() - 24 * 60 * 60 * 1000))) return `ayer, ${clock}`;
  return `${spanish(time, "date", { day: "numeric", month: "short", year: "numeric" })}, ${clock}`;
}

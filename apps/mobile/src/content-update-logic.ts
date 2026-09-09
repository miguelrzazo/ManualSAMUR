import type { MobileSnapshot } from "../../../packages/manual-content/src/index.ts";

export const CONTENT_CHECK_STORAGE_KEY = "manualsamur.content.check.v1";

export type ContentCheckOutcome = "up-to-date" | "update-available" | "offline" | "invalid-response" | "failure";

export interface PublishedContentMetadata {
  schema: string;
  version: number;
  hash: string;
  packageHash?: string;
  generatedAt: string;
}

export interface ContentCheckRecord {
  checkedAt: string;
  outcome: ContentCheckOutcome;
  remoteIdentity?: string;
  remoteGeneratedAt?: string;
  errorMessage?: string;
}

export function isPublishedContentMetadata(value: unknown): value is PublishedContentMetadata {
  if (!value || typeof value !== "object") return false;
  const metadata = value as Partial<PublishedContentMetadata>;
  return typeof metadata.schema === "string"
    && typeof metadata.version === "number"
    && typeof metadata.hash === "string"
    && metadata.hash.length > 0
    && (metadata.packageHash === undefined || typeof metadata.packageHash === "string")
    && typeof metadata.generatedAt === "string"
    && metadata.generatedAt.length > 0;
}

export function contentIdentity(value: Pick<PublishedContentMetadata, "hash" | "packageHash"> | Pick<MobileSnapshot, "hash" | "packageHash">): string {
  return value.packageHash ?? value.hash;
}

export function contentUpdateNeeded(metadata: PublishedContentMetadata, snapshot: Pick<MobileSnapshot, "hash" | "packageHash">): boolean {
  return contentIdentity(metadata) !== contentIdentity(snapshot);
}

export function parseContentCheckRecord(serialized: string | null | undefined): ContentCheckRecord | undefined {
  if (!serialized) return undefined;
  try {
    const value: unknown = JSON.parse(serialized);
    if (!value || typeof value !== "object") return undefined;
    const record = value as Partial<ContentCheckRecord>;
    if (typeof record.checkedAt !== "string" || typeof record.outcome !== "string") return undefined;
    if (!["up-to-date", "update-available", "offline", "invalid-response", "failure"].includes(record.outcome)) return undefined;
    return {
      checkedAt: record.checkedAt,
      outcome: record.outcome as ContentCheckOutcome,
      ...(typeof record.remoteIdentity === "string" ? { remoteIdentity: record.remoteIdentity } : {}),
      ...(typeof record.remoteGeneratedAt === "string" ? { remoteGeneratedAt: record.remoteGeneratedAt } : {}),
      ...(typeof record.errorMessage === "string" ? { errorMessage: record.errorMessage } : {}),
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
  metadata?: PublishedContentMetadata,
  errorMessage?: string,
): ContentCheckRecord {
  return {
    checkedAt: now,
    outcome,
    ...(metadata ? { remoteIdentity: contentIdentity(metadata), remoteGeneratedAt: metadata.generatedAt } : {}),
    ...(errorMessage ? { errorMessage } : {}),
  };
}

export function isNetworkLikeError(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  return error instanceof Error && /abort|network request failed|network unavailable|offline|could not connect|timed out|timeout|internet connection/i.test(error.message);
}

export function contentCheckErrorOutcome(error: unknown, responseReceived: boolean): ContentCheckOutcome {
  if (isNetworkLikeError(error) || !responseReceived) return "offline";
  if (error instanceof Error && /metadata|published|valid|json|schema/i.test(error.message)) return "invalid-response";
  return "failure";
}

export function userFacingContentCheckError(outcome: ContentCheckOutcome): string {
  switch (outcome) {
    case "offline": return "No se pudo comprobar la conexión; el contenido local sigue disponible.";
    case "invalid-response": return "La actualización publicada no es válida; se mantiene el contenido local.";
    case "failure": return "No se pudo comprobar el contenido; se mantiene el último paquete local.";
    default: return "";
  }
}

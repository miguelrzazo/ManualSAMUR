import type { MobileAttachment, MobileManifestAttachment } from "./data/schema";

export const ESSENTIAL_ATTACHMENT_CAP_BYTES = 75 * 1024 * 1024;
export const V1_INSTALLED_ATTACHMENT_CAP_BYTES = 150 * 1024 * 1024;

export type AttachmentDownloadStatus =
  | "not-downloaded"
  | "downloading"
  | "paused"
  | "available"
  | "failed"
  | "cancelled";

export interface AttachmentRecord {
  id: string;
  sourceUrl: string;
  localPath: string;
  filename: string;
  kind: MobileAttachment["kind"];
  status: AttachmentDownloadStatus;
  localUri?: string;
  downloadedBytes?: number;
  totalBytes?: number;
  byteLength?: number;
  sha256?: string;
  error?: string;
  updatedAt: string;
}

export interface AttachmentReleasePolicy {
  version: 1;
  /** An owner must explicitly approve the allowlist before a release can freeze. */
  approved: boolean;
  essentialAttachmentIds: string[];
  approvalReference?: string;
}

/** Deliberately conservative until the content owner approves an allowlist. */
export const DEFAULT_ATTACHMENT_RELEASE_POLICY: AttachmentReleasePolicy = {
  version: 1,
  approved: false,
  essentialAttachmentIds: [],
};

export interface AttachmentReleaseIssue {
  code:
    | "policy-unapproved"
    | "unknown-essential"
    | "essential-metadata-missing"
    | "essential-not-bundled"
    | "essential-cap-exceeded"
    | "installed-cap-exceeded";
  attachmentId?: string;
  detail: string;
}

export interface AttachmentReleaseReport {
  ready: boolean;
  essentialBytes: number;
  installedBytes: number;
  issues: AttachmentReleaseIssue[];
}

export interface AttachmentAvailabilityInput {
  /** The file is present at its expected URI and has passed metadata validation. */
  bundled?: boolean;
  /** The file is present at its persistent URI and has passed metadata validation. */
  downloaded?: boolean;
}

export function isExpectedAttachmentMetadata(attachment: MobileAttachment): boolean {
  return Number.isSafeInteger(attachment.byteLength)
    && (attachment.byteLength as number) >= 0
    && typeof attachment.sha256 === "string"
    && /^[a-f0-9]{64}$/.test(attachment.sha256);
}

export function attachmentStorageKey(id: string): string {
  return `manualsamur.attachments.v1.${id}`;
}

/** Keep downloaded files content-addressed by stable manifest identity, never by URL text. */
export function attachmentDownloadFilename(attachment: MobileAttachment): string {
  return `${attachment.id}-${attachment.filename}`;
}

export function attachmentStatusLabel(status: AttachmentDownloadStatus): string {
  switch (status) {
    case "available": return "Disponible offline";
    case "downloading": return "Descargando";
    case "paused": return "Descarga interrumpida";
    case "failed": return "No disponible";
    case "cancelled": return "Descarga cancelada";
    default: return "Disponible bajo demanda";
  }
}

export function createAttachmentRecord(attachment: MobileAttachment, now: string): AttachmentRecord {
  return {
    id: attachment.id,
    sourceUrl: attachment.sourceUrl,
    localPath: attachment.localPath,
    filename: attachment.filename,
    kind: attachment.kind,
    status: "not-downloaded",
    ...(attachment.byteLength === undefined ? {} : { totalBytes: attachment.byteLength }),
    updatedAt: now,
  };
}

export function isLocallyAvailable(record: AttachmentRecord | undefined, attachment: MobileAttachment): boolean {
  return Boolean(record?.status === "available"
    && record.localUri
    && isExpectedAttachmentMetadata(attachment)
    && record.byteLength === attachment.byteLength
    && record.sha256 === attachment.sha256);
}

export function startAttachmentDownload(record: AttachmentRecord, now: string): AttachmentRecord {
  return { ...record, status: "downloading", error: undefined, updatedAt: now };
}

export function updateAttachmentProgress(record: AttachmentRecord, downloadedBytes: number, totalBytes: number | undefined, now: string): AttachmentRecord {
  return {
    ...record,
    status: "downloading",
    downloadedBytes: Math.max(0, downloadedBytes),
    ...(totalBytes === undefined ? {} : { totalBytes: Math.max(0, totalBytes) }),
    updatedAt: now,
  };
}

export function markAttachmentPaused(record: AttachmentRecord, downloadedBytes: number | undefined, totalBytes: number | undefined, now: string): AttachmentRecord {
  return {
    ...record,
    status: "paused",
    ...(downloadedBytes === undefined ? {} : { downloadedBytes: Math.max(0, downloadedBytes) }),
    ...(totalBytes === undefined ? {} : { totalBytes: Math.max(0, totalBytes) }),
    updatedAt: now,
  };
}

export function markAttachmentCancelled(record: AttachmentRecord, now: string): AttachmentRecord {
  return { ...record, status: "cancelled", error: undefined, updatedAt: now };
}

export function markAttachmentFailed(record: AttachmentRecord, error: string, now: string): AttachmentRecord {
  return { ...record, status: "failed", error, localUri: undefined, updatedAt: now };
}

export function markAttachmentAvailable(
  record: AttachmentRecord,
  actual: { localUri: string; byteLength: number; sha256: string },
  expected: MobileAttachment,
  now: string,
): AttachmentRecord {
  if (!isExpectedAttachmentMetadata(expected)) throw new Error("El anexo no tiene metadatos de integridad aprobados");
  if (actual.byteLength !== expected.byteLength || actual.sha256 !== expected.sha256) {
    throw new Error("La descarga del anexo no supera la validación SHA-256");
  }
  return {
    ...record,
    status: "available",
    localUri: actual.localUri,
    byteLength: actual.byteLength,
    sha256: actual.sha256,
    downloadedBytes: actual.byteLength,
    totalBytes: actual.byteLength,
    error: undefined,
    updatedAt: now,
  };
}

/** Reconcile persisted state after a killed/interrupted app session. */
export function recoverAttachment(record: AttachmentRecord, available: boolean, now: string): AttachmentRecord {
  if (record.status === "downloading" || record.status === "paused") {
    return available ? { ...record, status: "paused", updatedAt: now } : { ...record, status: "paused", localUri: undefined, updatedAt: now };
  }
  if (record.status === "available" && !available) return { ...record, status: "failed", localUri: undefined, error: "El archivo local ya no está disponible", updatedAt: now };
  return record;
}

export function evaluateAttachmentRelease(
  attachments: MobileManifestAttachment[],
  policy: AttachmentReleasePolicy = DEFAULT_ATTACHMENT_RELEASE_POLICY,
  availability: Record<string, AttachmentAvailabilityInput> = {},
): AttachmentReleaseReport {
  const byId = new Map(attachments.map((attachment) => [attachment.id, attachment]));
  const issues: AttachmentReleaseIssue[] = [];
  if (!policy.approved) issues.push({ code: "policy-unapproved", detail: "La allowlist de anexos esenciales requiere aprobación del propietario antes de congelar la release." });
  const unknown = policy.essentialAttachmentIds.filter((id) => !byId.has(id));
  for (const attachmentId of unknown) issues.push({ code: "unknown-essential", attachmentId, detail: `El anexo esencial ${attachmentId} no existe en el manifiesto.` });
  const essential = policy.essentialAttachmentIds.flatMap((id) => {
    const attachment = byId.get(id);
    return attachment ? [attachment] : [];
  });
  for (const attachment of essential) {
    if (!isExpectedAttachmentMetadata(attachment)) issues.push({ code: "essential-metadata-missing", attachmentId: attachment.id, detail: `${attachment.filename} no tiene byteLength y SHA-256 aprobados.` });
    if (!availability[attachment.id]?.bundled) issues.push({ code: "essential-not-bundled", attachmentId: attachment.id, detail: `${attachment.filename} no está validado como recurso bundled offline.` });
  }
  const essentialBytes = essential.reduce((total, attachment) => total + (attachment.byteLength ?? 0), 0);
  if (essentialBytes > ESSENTIAL_ATTACHMENT_CAP_BYTES) issues.push({ code: "essential-cap-exceeded", detail: `Los anexos esenciales ocupan ${essentialBytes} bytes; el límite es ${ESSENTIAL_ATTACHMENT_CAP_BYTES}.` });
  const installedBytes = attachments.reduce((total, attachment) => total + (availability[attachment.id]?.bundled || availability[attachment.id]?.downloaded ? (attachment.byteLength ?? 0) : 0), 0);
  if (installedBytes > V1_INSTALLED_ATTACHMENT_CAP_BYTES) issues.push({ code: "installed-cap-exceeded", detail: `Los anexos instalados ocupan ${installedBytes} bytes; el límite V1 es ${V1_INSTALLED_ATTACHMENT_CAP_BYTES}.` });
  return { ready: issues.length === 0, essentialBytes, installedBytes, issues };
}

export function assertAttachmentReleaseReady(report: AttachmentReleaseReport): void {
  if (!report.ready) throw new Error(`La release de anexos está bloqueada: ${report.issues.map((issue) => issue.detail).join(" ")}`);
}

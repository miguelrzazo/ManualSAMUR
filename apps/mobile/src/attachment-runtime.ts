import AsyncStorage from "@react-native-async-storage/async-storage";
import { Directory, File, Paths } from "expo-file-system";
import * as Crypto from "expo-crypto";
import {
  attachmentDownloadFilename,
  attachmentStorageKey,
  createAttachmentRecord,
  isLocallyAvailable,
  markAttachmentAvailable,
  markAttachmentCancelled,
  markAttachmentFailed,
  markAttachmentPaused,
  recoverAttachment,
  startAttachmentDownload,
  updateAttachmentProgress,
  V1_INSTALLED_ATTACHMENT_CAP_BYTES,
  type AttachmentRecord,
} from "./attachment-logic";
import type { MobileAttachment } from "./data/schema";

export interface AttachmentRecordStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  getAllKeys?: () => Promise<readonly string[]>;
}

export interface AttachmentDownloadOptions {
  storage?: AttachmentRecordStorage;
  onProgress?: (downloadedBytes: number, totalBytes?: number) => void;
  signal?: AbortSignal;
  now?: () => string;
}

const ATTACHMENT_DIRECTORY_NAME = "manualsamur-attachments";

function recordsKey(attachment: MobileAttachment): string {
  return attachmentStorageKey(attachment.id);
}

function nowIso(options?: AttachmentDownloadOptions): string {
  return options?.now?.() ?? new Date().toISOString();
}

function parseRecord(value: string | null): AttachmentRecord | undefined {
  if (!value) return undefined;
  try {
    const candidate = JSON.parse(value) as Partial<AttachmentRecord>;
    if (typeof candidate.id !== "string" || typeof candidate.sourceUrl !== "string" || typeof candidate.localPath !== "string" || typeof candidate.filename !== "string" || typeof candidate.kind !== "string" || typeof candidate.status !== "string" || typeof candidate.updatedAt !== "string") return undefined;
    return candidate as AttachmentRecord;
  } catch {
    return undefined;
  }
}

async function loadRecord(storage: AttachmentRecordStorage, attachment: MobileAttachment, now: string): Promise<AttachmentRecord> {
  const parsed = parseRecord(await storage.getItem(recordsKey(attachment)));
  if (!parsed || parsed.id !== attachment.id) return createAttachmentRecord(attachment, now);
  // Metadata is always read from the current signed snapshot; persisted state
  // may only carry delivery progress and the verified URI.
  return {
    ...parsed,
    sourceUrl: attachment.sourceUrl,
    localPath: attachment.localPath,
    filename: attachment.filename,
    kind: attachment.kind,
    ...(attachment.byteLength === undefined ? {} : { totalBytes: attachment.byteLength }),
  };
}

async function saveRecord(storage: AttachmentRecordStorage, record: AttachmentRecord): Promise<void> {
  await storage.setItem(attachmentStorageKey(record.id), JSON.stringify(record));
}

function digestHex(value: ArrayBuffer): string {
  return [...new Uint8Array(value)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function inspectFile(file: File): Promise<{ byteLength: number; sha256: string }> {
  const bytes = await file.bytes();
  const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes);
  return { byteLength: bytes.byteLength, sha256: digestHex(digest) };
}

function attachmentFile(attachment: MobileAttachment): File {
  const directory = new Directory(Paths.document, ATTACHMENT_DIRECTORY_NAME);
  return new File(directory, attachmentDownloadFilename(attachment));
}

/** The deterministic bundle candidate used by a future approved essential allowlist. */
export function bundledAttachmentUri(attachment: MobileAttachment): string {
  return new File(Paths.bundle, attachment.localPath.slice(1)).uri;
}

export async function readAttachmentRecord(attachment: MobileAttachment, storage: AttachmentRecordStorage = AsyncStorage): Promise<AttachmentRecord> {
  return loadRecord(storage, attachment, new Date().toISOString());
}

/** Reconcile state after an interrupted or killed download before rendering it. */
export async function reconcileAttachmentRecord(attachment: MobileAttachment, storage: AttachmentRecordStorage = AsyncStorage, now = new Date().toISOString()): Promise<AttachmentRecord> {
  const record = await loadRecord(storage, attachment, now);
  const bundledFile = new File(Paths.bundle, attachment.localPath.slice(1));
  if (bundledFile.exists && attachment.byteLength !== undefined && attachment.sha256) {
    try {
      const actual = await inspectFile(bundledFile);
      const available = markAttachmentAvailable(record, { localUri: bundledFile.uri, ...actual }, attachment, now);
      await saveRecord(storage, available);
      return available;
    } catch {
      // A bundled candidate with missing or corrupt bytes must not be reported local.
    }
  }
  if (record.status === "available" && record.localUri) {
    const file = new File(record.localUri);
    let available = false;
    if (file.exists && isLocallyAvailable(record, attachment)) {
      try {
        const actual = await inspectFile(file);
        available = actual.byteLength === attachment.byteLength && actual.sha256 === attachment.sha256;
      } catch { /* A corrupt/unreadable file is unavailable and retryable. */ }
    }
    const next = available ? record : recoverAttachment(record, false, now);
    if (next !== record) await saveRecord(storage, next);
    return next;
  }
  if (record.status === "downloading" || record.status === "paused") {
    const next = recoverAttachment(record, false, now);
    await saveRecord(storage, next);
    return next;
  }
  return record;
}

export async function downloadOptionalAttachment(
  attachment: MobileAttachment,
  options: AttachmentDownloadOptions = {},
): Promise<AttachmentRecord> {
  const storage = options.storage ?? AsyncStorage;
  const now = () => nowIso(options);
  let record = await loadRecord(storage, attachment, now());
  if (attachment.byteLength === undefined || !attachment.sha256) {
    const failed = markAttachmentFailed(record, "Este anexo no tiene metadatos SHA-256 aprobados para descarga segura.", now());
    await saveRecord(storage, failed);
    return failed;
  }
  if (isLocallyAvailable(record, attachment)) return record;
  if (storage.getAllKeys) {
    const keys = await storage.getAllKeys();
    const installed = await Promise.all(keys.filter((key) => key.startsWith("manualsamur.attachments.v1.") && key !== recordsKey(attachment)).map(async (key) => parseRecord(await storage.getItem(key))));
    const installedBytes = installed.reduce((total, candidate) => total + (candidate?.status === "available" ? candidate.byteLength ?? 0 : 0), 0);
    if (installedBytes + attachment.byteLength > V1_INSTALLED_ATTACHMENT_CAP_BYTES) {
      const failed = markAttachmentFailed(record, "Se alcanzó el límite V1 de anexos instalados (150 MB).", now());
      await saveRecord(storage, failed);
      return failed;
    }
  }
  record = startAttachmentDownload(record, now());
  await saveRecord(storage, record);
  const destination = attachmentFile(attachment);
  const parent = destination.parentDirectory;
  parent.create({ intermediates: true, idempotent: true });
  if (destination.exists) destination.delete();
  let task: ReturnType<typeof File.createDownloadTask> | undefined;
  let finished = false;
  let progressWrite: Promise<void> = Promise.resolve();
  try {
    task = File.createDownloadTask(attachment.sourceUrl, destination, {
      sessionType: "background",
      signal: options.signal,
      onProgress: ({ bytesWritten, totalBytes }) => {
        options.onProgress?.(bytesWritten, totalBytes > 0 ? totalBytes : undefined);
        if (!finished) progressWrite = progressWrite.then(() => saveRecord(storage, updateAttachmentProgress(record, bytesWritten, totalBytes > 0 ? totalBytes : undefined, now())));
      },
    });
    const file = await task.downloadAsync();
    if (!file) {
      finished = true;
      const paused = markAttachmentPaused(record, undefined, attachment.byteLength, now());
      await saveRecord(storage, paused);
      return paused;
    }
    finished = true;
    await progressWrite;
    const actual = await inspectFile(file);
    const available = markAttachmentAvailable(record, { localUri: file.uri, ...actual }, attachment, now());
    await saveRecord(storage, available);
    return available;
  } catch (error) {
    finished = true;
    await progressWrite;
    if (options.signal?.aborted || task?.state === "cancelled") {
      if (destination.exists) destination.delete();
      const cancelled = markAttachmentCancelled(record, now());
      await saveRecord(storage, cancelled);
      return cancelled;
    }
    if (destination.exists) destination.delete();
    const failed = markAttachmentFailed(record, error instanceof Error ? error.message : "No se pudo descargar el anexo.", now());
    await saveRecord(storage, failed);
    return failed;
  } finally {
    task?.release();
  }
}

export async function removeAttachmentRecord(attachment: MobileAttachment, storage: AttachmentRecordStorage = AsyncStorage): Promise<void> {
  const record = await readAttachmentRecord(attachment, storage);
  if (record.localUri) {
    const file = new File(record.localUri);
    if (file.exists) file.delete();
  }
  await storage.removeItem(recordsKey(attachment));
}

import AsyncStorage from "@react-native-async-storage/async-storage";
import { manualContentOrigin } from "./content-origin";
import bundledSnapshot from "./data/snapshot.json";
import { Directory, File, Paths } from "expo-file-system";
import * as Crypto from "expo-crypto";
import {
  attachmentDownloadFilename,
  attachmentStorageKey,
  attachmentUnavailableUpstreamNotice,
  createAttachmentRecord,
  isAttachmentUnavailableUpstream,
  isLocallyAvailable,
  markAttachmentAvailable,
  markAttachmentCancelled,
  markAttachmentFailed,
  markAttachmentPaused,
  publishedAttachmentUrl,
  recoverAttachment,
  startAttachmentDownload,
  updateAttachmentProgress,
  V1_INSTALLED_ATTACHMENT_CAP_BYTES,
  type AttachmentRecord,
} from "./attachment-logic";
import type { MobileAttachment } from "../../../packages/manual-content/src/index.ts";

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
  let record = await loadRecord(storage, attachment, now);
  if (record.status !== "available" && record.lastGood) record = { ...record.lastGood, lastGood: undefined };
  // Permanently unresolvable (no approved byteLength/sha256, e.g. confirmed 404 upstream):
  // never leave this pending/"available on demand" — pin it as failed with a clear,
  // stable Spanish reason so the UI can offer the external sourceUrl link instead.
  if (isAttachmentUnavailableUpstream(attachment)) {
    if (record.status === "failed" && record.error === attachmentUnavailableUpstreamNotice(attachment)) return record;
    const failed = markAttachmentFailed(record, attachmentUnavailableUpstreamNotice(attachment), now);
    await saveRecord(storage, failed);
    return failed;
  }
  const bundledFile = new File(Paths.bundle, attachment.localPath.slice(1));
  const bundledMetadata = bundledSnapshot.content.procedures.flatMap((procedure) => procedure.attachments).find((candidate) => candidate.id === attachment.id) as MobileAttachment | undefined;
  if (bundledFile.exists && attachment.byteLength !== undefined && attachment.sha256) {
    try {
      const actual = await inspectFile(bundledFile);
      const available = markAttachmentAvailable(record, { localUri: bundledFile.uri, ...actual }, attachment, now);
      await saveRecord(storage, available);
      return available;
    } catch {
      if (bundledMetadata?.sha256 && bundledMetadata.byteLength !== undefined && record.status !== "available") {
        try {
          const actual = await inspectFile(bundledFile);
          const previous = markAttachmentAvailable(record, { localUri: bundledFile.uri, ...actual }, bundledMetadata, now);
          await saveRecord(storage, previous);
          return { ...previous, error: "Se muestra la copia incluida en la app; hay una actualización pendiente." };
        } catch { /* Never present a mismatching bundle as verified. */ }
      }
    }
  }
  if (record.status === "available" && record.localUri) {
    const file = new File(record.localUri);
    let available = false;
    if (file.exists && record.sha256 && record.byteLength !== undefined) {
      try {
        const actual = await inspectFile(file);
        available = actual.byteLength === record.byteLength && actual.sha256 === record.sha256;
      } catch { /* A corrupt/unreadable file is unavailable and retryable. */ }
    }
    const next = available ? { ...record, error: isLocallyAvailable(record, attachment) ? undefined : "Se muestra la última copia verificada; hay una actualización pendiente." } : recoverAttachment(record, false, now);
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

const activeDownloads = new Map<string, Promise<AttachmentRecord>>();

/** Serialize competing viewer and automatic downloads for each persistent record. */
export async function downloadOptionalAttachment(attachment: MobileAttachment, options: AttachmentDownloadOptions = {}): Promise<AttachmentRecord> {
  const active = activeDownloads.get(attachment.id);
  if (active) {
    await active;
    if (options.signal?.aborted) return reconcileAttachmentRecord(attachment, options.storage);
    return downloadOptionalAttachment(attachment, options);
  }
  const task = performAttachmentDownload(attachment, options);
  activeDownloads.set(attachment.id, task);
  try { return await task; }
  finally { if (activeDownloads.get(attachment.id) === task) activeDownloads.delete(attachment.id); }
}

async function performAttachmentDownload(
  attachment: MobileAttachment,
  options: AttachmentDownloadOptions = {},
): Promise<AttachmentRecord> {
  const storage = options.storage ?? AsyncStorage;
  const now = () => nowIso(options);
  let record = await loadRecord(storage, attachment, now());
  if (isAttachmentUnavailableUpstream(attachment)) {
    const failed = markAttachmentFailed(record, attachmentUnavailableUpstreamNotice(attachment), now());
    await saveRecord(storage, failed);
    return failed;
  }
  const verified = await reconcileAttachmentRecord(attachment, storage, now());
  if (isLocallyAvailable(verified, attachment)) return verified;
  const lastGood = verified.status === "available" ? verified : undefined;
  if (storage.getAllKeys) {
    const keys = await storage.getAllKeys();
    const installed = await Promise.all(keys.filter((key) => key.startsWith("manualsamur.attachments.v1.") && key !== recordsKey(attachment)).map(async (key) => parseRecord(await storage.getItem(key))));
    const installedBytes = installed.reduce((total, candidate) => total + (candidate?.status === "available" ? candidate.byteLength ?? 0 : 0), 0);
    // isAttachmentUnavailableUpstream already returned above when metadata is missing.
    if (installedBytes + (attachment.byteLength as number) > V1_INSTALLED_ATTACHMENT_CAP_BYTES) {
      const failed = lastGood ? { ...lastGood, error: "Se mantiene la última copia verificada: no hay espacio dentro del límite de anexos (150 MB)." } : markAttachmentFailed(record, "Se alcanzó el límite V1 de anexos instalados (150 MB).", now());
      await saveRecord(storage, failed);
      return failed;
    }
  }
  record = { ...startAttachmentDownload(record, now()), lastGood };
  await saveRecord(storage, record);
  const destination = attachmentFile(attachment);
  const parent = destination.parentDirectory;
  parent.create({ intermediates: true, idempotent: true });
  if (destination.exists) destination.delete();
  let task: ReturnType<typeof File.createDownloadTask> | undefined;
  let finished = false;
  let progressWrite: Promise<void> = Promise.resolve();
  try {
    const downloadUrl = publishedAttachmentUrl(attachment, manualContentOrigin());
    if (!downloadUrl) throw new Error("El anexo no tiene una ruta de publicación válida.");
    task = File.createDownloadTask(downloadUrl, destination, {
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
      const paused = lastGood ?? markAttachmentPaused(record, undefined, attachment.byteLength, now());
      await saveRecord(storage, paused);
      return paused;
    }
    finished = true;
    await progressWrite;
    const actual = await inspectFile(file);
    const available = markAttachmentAvailable(record, { localUri: file.uri, ...actual }, attachment, now());
    await saveRecord(storage, { ...available, lastGood: undefined });
    if (lastGood?.localUri && lastGood.localUri !== file.uri && !lastGood.localUri.startsWith(Paths.bundle.uri)) {
      try { const old = new File(lastGood.localUri); if (old.exists) old.delete(); } catch { /* A stale file can be removed later. */ }
    }
    return available;
  } catch (error) {
    finished = true;
    await progressWrite;
    if (options.signal?.aborted || task?.state === "cancelled") {
      if (destination.exists) destination.delete();
      const cancelled = lastGood ?? markAttachmentCancelled(record, now());
      await saveRecord(storage, cancelled);
      return cancelled;
    }
    if (destination.exists) destination.delete();
    const message = error instanceof Error ? error.message : "No se pudo descargar el anexo.";
    const failed = lastGood ? { ...lastGood, error: `Se mantiene la última copia verificada. ${message}` } : markAttachmentFailed(record, message, now());
    await saveRecord(storage, failed);
    return failed;
  } finally {
    task?.release();
  }
}

export async function removeAttachmentRecord(attachment: MobileAttachment, storage: AttachmentRecordStorage = AsyncStorage): Promise<void> {
  const record = await readAttachmentRecord(attachment, storage);
  if (record.localUri && !record.localUri.startsWith(Paths.bundle.uri)) {
    const file = new File(record.localUri);
    if (file.exists) file.delete();
  }
  await storage.removeItem(recordsKey(attachment));
}

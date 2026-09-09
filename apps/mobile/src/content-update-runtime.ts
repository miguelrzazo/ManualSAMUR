import type { MobileSnapshot } from "../../../packages/manual-content/src/index.ts";
import {
  ContentUpdateCancelledError,
  stagePackage,
  throwIfCancelled,
  type ContentStorage,
  type SnapshotValidator,
  type StageProgress,
  type StagedPackage,
} from "./content-transaction.ts";
import {
  contentCheckErrorOutcome,
  contentCheckRecordFor,
  contentUpdateNeeded,
  isPublishedContentMetadata,
  type ContentCheckOutcome,
  type ContentCheckRecord,
  type PublishedContentMetadata,
} from "./content-update-logic.ts";

export type ContentUpdatePhase = "checking" | "downloading" | "validating";

export interface ContentUpdateRuntimeOptions {
  contentUrl: string;
  metadataUrl?: string;
  activeSnapshot: MobileSnapshot;
  storage: ContentStorage;
  validate: SnapshotValidator;
  signal?: AbortSignal;
  now?: () => string;
  fetchImpl?: typeof fetch;
  onPhase?: (phase: ContentUpdatePhase) => void;
  onProgress?: (progress: StageProgress) => void;
}

export interface ContentUpdateRuntimeResult {
  kind: "up-to-date" | "staged";
  metadata?: PublishedContentMetadata;
  staged?: StagedPackage;
  record: ContentCheckRecord;
}

export class ContentUpdateRuntimeError extends Error {
  readonly outcome: ContentCheckOutcome;
  readonly record: ContentCheckRecord;

  constructor(outcome: ContentCheckOutcome, record: ContentCheckRecord, message: string) {
    super(message);
    this.name = "ContentUpdateRuntimeError";
    this.outcome = outcome;
    this.record = record;
  }
}

function responseError(label: string, response: Response): Error {
  return new Error(`${label}: HTTP ${response.status}`);
}

export async function checkAndStageContent(options: ContentUpdateRuntimeOptions): Promise<ContentUpdateRuntimeResult> {
  const now = options.now ?? (() => new Date().toISOString());
  const fetchImpl = options.fetchImpl ?? fetch;
  let responseReceived = false;
  let metadata: PublishedContentMetadata | undefined;
  try {
    if (!options.contentUrl) {
      const record = contentCheckRecordFor("offline", now());
      throw new ContentUpdateRuntimeError("offline", record, "No hay conexión de actualización configurada; se mantiene el paquete local.");
    }
    throwIfCancelled(options.signal);
    if (options.metadataUrl) {
      options.onPhase?.("checking");
      const metadataResponse = await fetchImpl(options.metadataUrl, {
        cache: "no-store",
        headers: { Accept: "application/json", "Cache-Control": "no-cache" },
        signal: options.signal,
      });
      responseReceived = true;
      if (!metadataResponse.ok) throw responseError("La metadata publicada no es válida", metadataResponse);
      const candidate: unknown = await metadataResponse.json();
      if (!isPublishedContentMetadata(candidate)) throw new Error("La metadata publicada no es válida");
      metadata = candidate;
      if (!contentUpdateNeeded(metadata, options.activeSnapshot)) {
        return { kind: "up-to-date", metadata, record: contentCheckRecordFor("up-to-date", now(), metadata) };
      }
    }

    throwIfCancelled(options.signal);
    options.onPhase?.("downloading");
    const response = await fetchImpl(options.contentUrl, {
      cache: "no-store",
      headers: { Accept: "application/json", "Cache-Control": "no-cache" },
      signal: options.signal,
    });
    responseReceived = true;
    if (!response.ok) throw responseError("No se pudo descargar el contenido", response);
    const totalBytes = Number(response.headers.get("content-length") ?? "");
    const progress = Number.isFinite(totalBytes) ? { downloadedBytes: totalBytes, totalBytes } : {};
    options.onProgress?.(progress);
    const candidate: unknown = await response.json();
    options.onPhase?.("validating");
    throwIfCancelled(options.signal);
    const staged = await stagePackage(options.storage, candidate as MobileSnapshot, options.validate, now(), progress, options.signal);
    return {
      kind: "staged",
      metadata,
      staged,
      record: contentCheckRecordFor("update-available", now(), metadata),
    };
  } catch (error) {
    if (error instanceof ContentUpdateCancelledError) throw error;
    const outcome = error instanceof ContentUpdateRuntimeError ? error.outcome : contentCheckErrorOutcome(error, responseReceived);
    const record = error instanceof ContentUpdateRuntimeError ? error.record : contentCheckRecordFor(outcome, now(), metadata);
    throw new ContentUpdateRuntimeError(outcome, record, error instanceof Error ? error.message : "No se pudo actualizar el contenido");
  }
}

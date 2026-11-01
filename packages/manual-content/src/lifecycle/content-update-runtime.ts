import { sha256Hex, type MobileContent, type MobileSnapshot } from "../index.ts";
import {
  ContentUpdateCancelledError,
  activateStagedPackage,
  stagePackage,
  throwIfCancelled,
  type ContentStorage,
  type SnapshotValidator,
  type StageProgress,
} from "./content-transaction.ts";
import {
  contentCheckRecordFor,
  type ContentCheckOutcome,
  type ContentCheckRecord,
} from "./content-update-logic.ts";
import {
  assembleSnapshot,
  MANIFEST_PATH,
  ManifestError,
  parsePublicManifest,
  planSync,
  releaseInfoFromManifest,
  utf8ByteLength,
  type PublicManifest,
  type ReleaseInfo,
} from "./content-release.ts";

export type ContentUpdatePhase = "checking" | "downloading" | "validating" | "activating";

/** Default per-request budgets. The snapshot is ~0.8 MB gzipped (4.5 MB raw). */
export const MANIFEST_TIMEOUT_MS = 15_000;
export const DOWNLOAD_TIMEOUT_MS = 90_000;

export interface ActiveContent {
  snapshot: MobileSnapshot;
  /** Present when the active snapshot came from a public-API release. */
  release?: ReleaseInfo;
  /** The bundled seed: never up to date, never a base for a partial update. */
  isSeed: boolean;
}

export interface ContentSyncOptions {
  /** HTTPS origin without a trailing slash, e.g. https://manualsamur.example.workers.dev */
  origin: string;
  /** Cloudflare rejects generic agents; send e.g. `ManualSAMUR-iOS/1.2.0`. */
  userAgent?: string;
  active: ActiveContent;
  storage: ContentStorage;
  /** Strict snapshot validation (content hash + package hash). */
  validate: SnapshotValidator;
  /** SHA-256 of a UTF-8 string, lowercase hex. Native on device, pure JS by default. */
  sha256?: (text: string) => Promise<string>;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  now?: () => string;
  manifestTimeoutMs?: number;
  downloadTimeoutMs?: number;
  onPhase?: (phase: ContentUpdatePhase) => void;
  onProgress?: (progress: StageProgress) => void;
}

export type ContentSyncResult =
  | { kind: "not-modified"; record: ContentCheckRecord }
  | { kind: "up-to-date"; manifest: PublicManifest; record: ContentCheckRecord }
  | {
    kind: "updated";
    mode: "datasets" | "snapshot";
    manifest: PublicManifest;
    snapshot: MobileSnapshot;
    release: ReleaseInfo;
    /** Datasets actually fetched (empty for a snapshot download). */
    downloaded: string[];
    downloadedBytes: number;
    record: ContentCheckRecord;
  };

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

/** Raised for problems that are about the bytes we received, not the network. */
class InvalidResponseError extends Error {
  constructor(message: string) { super(message); this.name = "InvalidResponseError"; }
}
class ServerError extends Error {
  constructor(message: string) { super(message); this.name = "ServerError"; }
}
class TimeoutError extends Error {
  constructor(message: string) { super(message); this.name = "TimeoutError"; }
}
class NetworkError extends Error {
  constructor(message: string) { super(message); this.name = "NetworkError"; }
}

interface Fetched { status: number; text: string }

/**
 * One request with its own deadline that also covers reading the body, so a
 * stalled stream cannot hang a refresh. A caller cancellation is reported as
 * such; a deadline as a TimeoutError (treated like being offline).
 */
async function fetchText(
  options: ContentSyncOptions,
  url: string,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<Fetched> {
  throwIfCancelled(options.signal);
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  const forwardAbort = () => controller.abort();
  options.signal?.addEventListener("abort", forwardAbort);
  try {
    const response = await fetchImpl(url, {
      cache: "no-store",
      headers: { Accept: "application/json", ...(options.userAgent ? { "User-Agent": options.userAgent } : {}), ...headers },
      signal: controller.signal,
    });
    const text = response.status === 304 ? "" : await response.text();
    return { status: response.status, text };
  } catch (error) {
    if (options.signal?.aborted) throw new ContentUpdateCancelledError();
    if (timedOut) throw new TimeoutError("Se agotó el tiempo de espera de la conexión");
    // No usable HTTP response: DNS failure, no route, TLS or a dropped
    // connection. iOS reports these with assorted NSURLError messages ("A
    // server with the specified hostname could not be found."), so classify by
    // where it failed rather than by the wording.
    throw new NetworkError(error instanceof Error ? error.message : "Sin conexión");
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", forwardAbort);
  }
}

function assertOk(response: Fetched, label: string): void {
  if (response.status >= 200 && response.status < 300) return;
  if (response.status >= 500 || response.status === 429) throw new ServerError(`${label}: HTTP ${response.status}`);
  throw new InvalidResponseError(`${label}: HTTP ${response.status}`);
}

function parseJson(text: string, label: string): unknown {
  try { return JSON.parse(text); } catch { throw new InvalidResponseError(`${label}: respuesta incompleta o JSON no válido`); }
}

function classify(error: unknown): ContentCheckOutcome {
  if (error instanceof ContentUpdateRuntimeError) return error.outcome;
  if (error instanceof ManifestError) return error.problem === "incompatible" ? "incompatible" : "invalid-response";
  if (error instanceof InvalidResponseError) return "invalid-response";
  if (error instanceof ServerError) return "failure";
  if (error instanceof TimeoutError || error instanceof NetworkError || error instanceof TypeError) return "offline";
  if (error instanceof Error && /network request failed|network unavailable|offline|could not connect|internet connection/i.test(error.message)) return "offline";
  return "failure";
}

async function downloadDataset(options: ContentSyncOptions, manifest: PublicManifest, name: string): Promise<unknown> {
  const entry = manifest.datasets[name];
  // immutableUrl is pinned to this releaseId, so every dataset fetched for this
  // sync belongs to the same publication even if a new one goes live meanwhile.
  const response = await fetchText(options, `${options.origin}${entry.immutableUrl}`, {}, options.downloadTimeoutMs ?? DOWNLOAD_TIMEOUT_MS);
  assertOk(response, `Conjunto ${name}`);
  if (utf8ByteLength(response.text) !== entry.bytes) throw new InvalidResponseError(`Conjunto ${name}: respuesta incompleta`);
  const digest = await (options.sha256 ?? defaultSha256)(response.text);
  if (digest !== entry.sha256) throw new InvalidResponseError(`Conjunto ${name}: el SHA-256 no coincide con el manifiesto`);
  return parseJson(response.text, `Conjunto ${name}`);
}

async function downloadSnapshot(options: ContentSyncOptions, manifest: PublicManifest): Promise<{ snapshot: MobileSnapshot; bytes: number }> {
  const response = await fetchText(options, `${options.origin}${manifest.snapshot.immutableUrl}`, {}, options.downloadTimeoutMs ?? DOWNLOAD_TIMEOUT_MS);
  assertOk(response, "Snapshot");
  const candidate = parseJson(response.text, "Snapshot") as Partial<MobileSnapshot> | null;
  if (!candidate || typeof candidate !== "object" || candidate.hash !== manifest.contentHash
    || (manifest.packageHash !== null && candidate.packageHash !== manifest.packageHash)) {
    throw new InvalidResponseError("El snapshot descargado no corresponde al manifiesto");
  }
  return { snapshot: candidate as MobileSnapshot, bytes: utf8ByteLength(response.text) };
}

const defaultSha256 = async (text: string) => sha256Hex(text);

/**
 * Check the public manifest and, when it changed, bring the device to that
 * exact release.
 *
 * 1. `GET /api/public/manifest` with `If-None-Match: "<active contentHash>"`;
 *    304 stops here. The seed never sends a validator.
 * 2. Download only datasets whose sha256 changed (pinned `immutableUrl`s,
 *    byte length and sha256 checked), rebuild the snapshot from the active
 *    one and verify it against the manifest's contentHash/packageHash. If the
 *    rebuild cannot be verified, or there is no dataset map to diff against,
 *    download the release's immutable snapshot instead.
 * 3. Stage the whole verified release as a new immutable package and switch
 *    the single active pointer. Any failure before that write leaves the
 *    previous package untouched and active.
 */
export async function syncContentRelease(options: ContentSyncOptions): Promise<ContentSyncResult> {
  const now = options.now ?? (() => new Date().toISOString());
  let manifest: PublicManifest | undefined;
  try {
    options.onPhase?.("checking");
    const validator: Record<string, string> = options.active.isSeed ? {} : { "If-None-Match": `"${options.active.snapshot.hash}"` };
    const manifestResponse = await fetchText(options, `${options.origin}${MANIFEST_PATH}`, validator, options.manifestTimeoutMs ?? MANIFEST_TIMEOUT_MS);
    if (manifestResponse.status === 304) {
      if (options.active.isSeed) throw new InvalidResponseError("El servidor respondió 304 sin validador");
      return { kind: "not-modified", record: { ...contentCheckRecordFor("up-to-date", now()), remoteIdentity: options.active.snapshot.packageHash ?? options.active.snapshot.hash, verifiedAt: now() } };
    }
    assertOk(manifestResponse, "Manifiesto");
    manifest = parsePublicManifest(parseJson(manifestResponse.text, "Manifiesto"));
    const plan = planSync(manifest, options.active);
    if (plan.kind === "up-to-date") {
      return { kind: "up-to-date", manifest, record: { ...recordFor("up-to-date", now(), manifest), verifiedAt: now() } };
    }

    options.onPhase?.("downloading");
    let candidate: MobileSnapshot | undefined;
    let downloaded: string[] = [];
    let downloadedBytes = 0;
    let mode: "datasets" | "snapshot" = "snapshot";
    if (plan.kind === "datasets") {
      const values: Record<string, unknown> = {};
      options.onProgress?.({ downloadedBytes: 0, totalBytes: plan.bytes });
      for (const name of plan.changed) {
        values[name] = await downloadDataset(options, manifest, name);
        downloadedBytes += manifest.datasets[name].bytes;
        options.onProgress?.({ downloadedBytes, totalBytes: plan.bytes });
      }
      options.onPhase?.("validating");
      const assembled = assembleSnapshot(manifest, options.active.snapshot.content as MobileContent, values);
      throwIfCancelled(options.signal);
      if (await options.validate(assembled)) {
        candidate = assembled;
        downloaded = plan.changed;
        mode = "datasets";
      }
      // Otherwise the rebuild did not reproduce the published hash (for
      // example a field the public datasets do not carry changed); fall back
      // to the full snapshot of this same release below.
    }
    if (!candidate) {
      options.onPhase?.("downloading");
      const full = await downloadSnapshot(options, manifest);
      downloadedBytes += full.bytes;
      options.onProgress?.({ downloadedBytes, totalBytes: downloadedBytes });
      candidate = full.snapshot;
      options.onPhase?.("validating");
    }

    throwIfCancelled(options.signal);
    const release = releaseInfoFromManifest(manifest, candidate.packageHash ?? "");
    let staged;
    try {
      staged = await stagePackage(options.storage, candidate, options.validate, now(), { downloadedBytes, totalBytes: downloadedBytes }, options.signal, release);
    } catch (error) {
      if (error instanceof ContentUpdateCancelledError) throw error;
      if (error instanceof Error && /integridad|packageHash/.test(error.message)) throw new InvalidResponseError(error.message);
      throw error;
    }
    options.onPhase?.("activating");
    await activateStagedPackage(options.storage, staged, options.validate, now(), options.signal);
    return {
      kind: "updated",
      mode,
      manifest,
      snapshot: candidate,
      release,
      downloaded,
      downloadedBytes,
      record: { ...recordFor("up-to-date", now(), manifest), verifiedAt: now() },
    };
  } catch (error) {
    if (error instanceof ContentUpdateCancelledError) throw error;
    const outcome = classify(error);
    const record = error instanceof ContentUpdateRuntimeError ? error.record : recordFor(outcome, now(), manifest, error instanceof Error ? error.message : undefined);
    throw new ContentUpdateRuntimeError(outcome, record, error instanceof Error ? error.message : "No se pudo actualizar el contenido");
  }
}

function recordFor(outcome: ContentCheckOutcome, at: string, manifest?: PublicManifest, errorMessage?: string): ContentCheckRecord {
  return {
    ...contentCheckRecordFor(outcome, at, errorMessage),
    ...(manifest ? { remoteIdentity: manifest.packageHash ?? manifest.contentHash, remoteGeneratedAt: manifest.generatedAt } : {}),
  };
}

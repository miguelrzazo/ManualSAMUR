import assert from "node:assert/strict";
import test from "node:test";
import type { MobileContent, MobileSnapshot } from "../packages/manual-content/src/index.ts";
import {
  buildMobileRelationsIndex,
  contentHash,
  isMobileContentSnapshot,
  mobileAttachmentEntries,
  packageHash,
} from "../lib/mobile-snapshot.ts";
import { buildPublicDatasetArtifacts } from "../scripts/backend/public-datasets.ts";
import {
  ACTIVE_POINTER_KEY,
  STAGED_PACKAGE_KEY,
  readTransaction,
  type ContentStorage,
} from "../apps/mobile/src/content-transaction.ts";
import { readContentBoot } from "../apps/mobile/src/content-boot.ts";
import { buildSeedSnapshot } from "../apps/mobile/src/content-seed.ts";
import {
  KNOWN_DATASETS,
  manualVersionOf,
  parsePublicManifest,
  planSync,
  releaseInfoFromManifest,
  type PublicManifest,
  type ReleaseInfo,
} from "../apps/mobile/src/content-release.ts";
import {
  automaticRefreshAllowed,
  automaticSyncDue,
  AUTOMATIC_REFRESH_COOLDOWN_MS,
  FAILED_CHECK_RETRY_MS,
  formatCheckedAt,
  formatDataDate,
  isOfflineWithStaleData,
  mergeCheckRecord,
  parseContentCheckRecord,
  serializeContentCheckRecord,
  shouldRefreshOnResume,
} from "../apps/mobile/src/content-update-logic.ts";
import {
  ContentUpdateRuntimeError,
  syncContentRelease,
  type ActiveContent,
  type ContentSyncOptions,
} from "../apps/mobile/src/content-update-runtime.ts";

const ORIGIN = "https://manual.example";
const UA = "ManualSAMUR-iOS/9.9.9";

class MemoryStorage implements ContentStorage {
  values = new Map<string, string>();
  async getItem(key: string) { return this.values.get(key) ?? null; }
  async setItem(key: string, value: string) { this.values.set(key, value); }
  async removeItem(key: string) { this.values.delete(key); }
}

const validate = async (candidate: unknown) => isMobileContentSnapshot(candidate);

type ContentInput = Omit<MobileContent, "relationsIndex">;

function baseContent(): ContentInput {
  const procedure = (id: string, content: string) => ({
    id, title: `Procedimiento ${id}`, section: "sva", slug: `p-${id}`, routeKey: `procedure:${id}`,
    tags: [], synonyms: [], related: [], backlinks: [], relations: [], editorialBlocks: [],
    updated: "2026-10-01", sourceUpdated: "2026-10-01", attachments: [], content, searchText: content,
  });
  return {
    procedures: [procedure("301", "Activar código 1 ante parada."), procedure("302", "Sin códigos.")],
    codes: {
      incidente: [{ code: "1", name: "Parada" }], sva: [{ code: "10", name: "Uno" }], svb: [], upsi: [], upsq: [],
      icao: [], indicativos: [], claves: [], lima: [], cheatsheet: [],
    },
    drugs: [{ id: "adrenalina", name: "Adrenalina", synonyms: [], category: "a", subcategory: "b", presentation: "1 mg", indication: "PCR", dose: "1 mg", route: ["iv"], contraindications: "" }],
    perfusions: [], fluids: [], commercialNames: [], abbreviations: [], hospitals: [], bases: [], status4: [],
    manual: { manualVersion: "v1.1 Mayo 2026", manualVersionCurrent: "v1.1 Mayo 2026", lastApprovedAt: "2026-10-28T08:12:00.248Z" },
    links: { sourceUrl: "", updatedAt: "", avisoImportanteUrl: "", samurEmail: "", officialWebUrl: "", abbreviationsUrl: "", collaboratorsUrl: "" },
    updates: [],
  };
}

function makeSnapshot(input: ContentInput, generatedAt = "2026-10-28T08:12:00.248Z"): MobileSnapshot {
  const content: MobileContent = { ...input, relationsIndex: buildMobileRelationsIndex(input.procedures, input.codes) };
  const hash = contentHash(content);
  return {
    schema: "samur-manual.mobile-content", version: 3, generatedAt, hash, contentHash: hash,
    packageHash: packageHash(content, mobileAttachmentEntries(content)), content,
  };
}

interface Release { id: string; snapshot: MobileSnapshot; manifest: PublicManifest; bodies: Map<string, string> }

/** Publish exactly as the Worker does (scripts/backend/public-datasets.ts). */
function publish(id: string, snapshot: MobileSnapshot): Release {
  const { files, manifest } = buildPublicDatasetArtifacts(snapshot, id);
  const bodies = new Map<string, string>();
  for (const [path, body] of files) bodies.set(`/api/public/releases/${id}/${path}`, body);
  bodies.set(`/api/public/releases/${id}/snapshot`, JSON.stringify(snapshot));
  return { id, snapshot, manifest: { ...manifest, publishedAt: "2026-10-28T09:00:00.000Z" } as PublicManifest, bodies };
}

interface Call { url: string; headers: Record<string, string> }

function server(live: Release, overrides: Record<string, string> = {}) {
  const calls: Call[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({ url, headers });
    const path = url.slice(ORIGIN.length);
    if (path === "/api/public/manifest") {
      if (headers["If-None-Match"] === `"${live.manifest.contentHash}"`) return new Response(null, { status: 304 });
      return new Response(overrides[path] ?? JSON.stringify(live.manifest), { status: 200 });
    }
    const body = overrides[path] ?? live.bodies.get(path);
    return body === undefined ? new Response('{"error":"no"}', { status: 404 }) : new Response(body, { status: 200 });
  }) as typeof fetch;
  return { calls, fetchImpl, paths: () => calls.map((call) => call.url.slice(ORIGIN.length)) };
}

function options(active: ActiveContent, storage: ContentStorage, fetchImpl: typeof fetch, extra: Partial<ContentSyncOptions> = {}): ContentSyncOptions {
  return { origin: ORIGIN, userAgent: UA, active, storage, validate, fetchImpl, now: () => "2026-10-31T09:00:00.000Z", ...extra };
}

/** Install `release` as the active package, as a previous successful sync would have. */
async function installed(release: Release): Promise<{ storage: MemoryStorage; active: ActiveContent }> {
  const storage = new MemoryStorage();
  const seed = buildSeedSnapshot(release.snapshot);
  const result = await syncContentRelease(options({ snapshot: seed, isSeed: true }, storage, server(release).fetchImpl));
  assert.equal(result.kind, "updated");
  return { storage, active: { snapshot: release.snapshot, release: result.kind === "updated" ? result.release : undefined, isSeed: false } };
}

const releaseA = publish("release-a", makeSnapshot(baseContent()));
const releaseB = (() => {
  const content = baseContent();
  content.drugs = [{ ...content.drugs[0], dose: "1 mg cada 4 min" }];
  content.codes = { ...content.codes, sva: [...content.codes.sva, { code: "20", name: "Dos" }] };
  content.manual = { ...content.manual, manualVersion: "v2.0 junio 2026", manualVersionCurrent: "v2.0 junio 2026" };
  return publish("release-b", makeSnapshot(content, "2026-10-30T10:00:00.000Z"));
})();

test("the bundled seed is superseded by the first successful sync, even with the same hash", async () => {
  const storage = new MemoryStorage();
  const seed = buildSeedSnapshot(releaseA.snapshot);
  assert.equal(seed.hash, releaseA.manifest.contentHash, "the seed keeps its source identity");
  const live = server(releaseA);
  const result = await syncContentRelease(options({ snapshot: seed, isSeed: true }, storage, live.fetchImpl));

  assert.equal(result.kind, "updated");
  assert.equal(result.kind === "updated" && result.mode, "snapshot");
  assert.equal(live.calls[0].headers["If-None-Match"], undefined, "the seed never sends a validator");
  assert.equal(live.calls[0].headers["User-Agent"], UA);
  assert.deepEqual(live.paths(), ["/api/public/manifest", "/api/public/releases/release-a/snapshot"]);

  // Next launch: the downloaded release wins over the seed, whatever their dates.
  const newerLookingSeed = { ...seed, generatedAt: "2099-01-01T00:00:00.000Z" };
  const boot = await readContentBoot(storage, newerLookingSeed);
  assert.equal(boot.snapshot.hash, releaseA.snapshot.hash);
  assert.notEqual(boot.snapshot, newerLookingSeed);
  assert.equal(boot.snapshot.content.procedures[0].searchText.length > 0, true, "full release, not the reduced seed");
  assert.equal(boot.transaction.release?.releaseId, "release-a");
  assert.equal(boot.transaction.release?.manualVersion, "v1.1 Mayo 2026");
});

test("304 Not Modified stops after the manifest", async () => {
  const { storage, active } = await installed(releaseA);
  const live = server(releaseA);
  const result = await syncContentRelease(options(active, storage, live.fetchImpl));
  assert.equal(result.kind, "not-modified");
  assert.equal(result.record.outcome, "up-to-date");
  assert.equal(result.record.verifiedAt, "2026-10-31T09:00:00.000Z");
  assert.deepEqual(live.paths(), ["/api/public/manifest"]);
  assert.equal(live.calls[0].headers["If-None-Match"], `"${releaseA.manifest.contentHash}"`);
});

test("a partial update downloads only the changed datasets and swaps the whole release", async () => {
  const { storage, active } = await installed(releaseA);
  const before = JSON.parse(storage.values.get(ACTIVE_POINTER_KEY) ?? "{}");
  const manifest = { ...releaseB.manifest, datasets: { ...releaseB.manifest.datasets, "future-thing": { url: "/api/public/datasets/future-thing.json", immutableUrl: "/api/public/releases/release-b/datasets/future-thing.json", sha256: "f".repeat(64), bytes: 9, count: null } } };
  const live = server(releaseB, { "/api/public/manifest": JSON.stringify(manifest) });

  const result = await syncContentRelease(options(active, storage, live.fetchImpl));

  assert.equal(result.kind, "updated");
  if (result.kind !== "updated") return;
  assert.equal(result.mode, "datasets");
  assert.deepEqual([...result.downloaded].sort(), ["codigos-sva", "manual", "vademecum"]);
  assert.deepEqual(live.paths().sort(), [
    "/api/public/manifest",
    "/api/public/releases/release-b/datasets/codigos-sva.json",
    "/api/public/releases/release-b/datasets/manual.json",
    "/api/public/releases/release-b/datasets/vademecum.json",
  ], "unchanged datasets, the snapshot and unknown names are not fetched");
  assert.equal(result.snapshot.hash, releaseB.snapshot.hash);
  assert.deepEqual(result.snapshot.content.relationsIndex, releaseB.snapshot.content.relationsIndex, "derived index rebuilt from the new codes");
  assert.equal(result.release.releaseId, "release-b");
  assert.equal(result.release.datasets["future-thing"], undefined);

  const transaction = await readTransaction(storage, validate);
  assert.equal(transaction.snapshot?.hash, releaseB.snapshot.hash);
  assert.equal(transaction.release?.releaseId, "release-b");
  assert.equal(transaction.release?.manualVersion, "v2.0 junio 2026");
  assert.equal(storage.values.has(before.packageKey), false, "superseded package is dropped only after the switch");
  assert.equal(storage.values.has(STAGED_PACKAGE_KEY), false);
});

test("a dataset whose sha256 does not match the manifest aborts and keeps the active release", async () => {
  const { storage, active } = await installed(releaseA);
  const path = "/api/public/releases/release-b/datasets/vademecum.json";
  const genuine = releaseB.bodies.get(path) ?? "";
  const tampered = genuine.replace("cada 4 min", "cada 9 min"); // same byte length, different bytes
  assert.equal(tampered.length, genuine.length);
  const live = server(releaseB, { [path]: tampered });

  await assert.rejects(
    () => syncContentRelease(options(active, storage, live.fetchImpl)),
    (error: unknown) => error instanceof ContentUpdateRuntimeError && error.outcome === "invalid-response" && /SHA-256/.test(error.message),
  );
  assert.equal((await readTransaction(storage, validate)).snapshot?.hash, releaseA.snapshot.hash);
  assert.equal(storage.values.has(STAGED_PACKAGE_KEY), false);
});

test("a truncated dataset or snapshot is rejected before anything is staged", async () => {
  const { storage, active } = await installed(releaseA);
  const path = "/api/public/releases/release-b/datasets/vademecum.json";
  const body = releaseB.bodies.get(path) ?? "";
  await assert.rejects(
    () => syncContentRelease(options(active, storage, server(releaseB, { [path]: body.slice(0, body.length / 2) }).fetchImpl)),
    (error: unknown) => error instanceof ContentUpdateRuntimeError && error.outcome === "invalid-response" && /incompleta/.test(error.message),
  );
  assert.equal((await readTransaction(storage, validate)).snapshot?.hash, releaseA.snapshot.hash);

  const fresh = new MemoryStorage();
  const snapshotPath = "/api/public/releases/release-a/snapshot";
  const full = releaseA.bodies.get(snapshotPath) ?? "";
  await assert.rejects(
    () => syncContentRelease(options({ snapshot: buildSeedSnapshot(releaseA.snapshot), isSeed: true }, fresh, server(releaseA, { [snapshotPath]: full.slice(0, -40) }).fetchImpl)),
    (error: unknown) => error instanceof ContentUpdateRuntimeError && error.outcome === "invalid-response",
  );
  assert.equal(fresh.values.has(ACTIVE_POINTER_KEY), false, "the seed stays; nothing half-written becomes active");
});

test("no network keeps the last good copy and classifies as offline", async () => {
  const { storage, active } = await installed(releaseA);
  const snapshotBefore = new Map(storage.values);
  await assert.rejects(
    () => syncContentRelease(options(active, storage, (async () => { throw new TypeError("Network request failed"); }) as typeof fetch)),
    (error: unknown) => error instanceof ContentUpdateRuntimeError && error.outcome === "offline" && error.record.outcome === "offline",
  );
  assert.deepEqual(storage.values, snapshotBefore, "storage untouched");
  const boot = await readContentBoot(storage, buildSeedSnapshot(releaseA.snapshot));
  assert.equal(boot.snapshot.hash, releaseA.snapshot.hash);
});

test("a stalled request times out as offline", async () => {
  const { storage, active } = await installed(releaseA);
  const hanging = ((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
  })) as unknown as typeof fetch;
  await assert.rejects(
    () => syncContentRelease(options(active, storage, hanging, { manifestTimeoutMs: 20 })),
    (error: unknown) => error instanceof ContentUpdateRuntimeError && error.outcome === "offline" && /tiempo de espera/.test(error.message),
  );
  assert.equal((await readTransaction(storage, validate)).snapshot?.hash, releaseA.snapshot.hash);
});

test("an incompatible manifest stops before downloading anything", async () => {
  const { storage, active } = await installed(releaseA);
  const live = server(releaseB, { "/api/public/manifest": JSON.stringify({ ...releaseB.manifest, version: 2 }) });
  await assert.rejects(
    () => syncContentRelease(options(active, storage, live.fetchImpl)),
    (error: unknown) => error instanceof ContentUpdateRuntimeError && error.outcome === "incompatible",
  );
  assert.deepEqual(live.paths(), ["/api/public/manifest"]);
  const garbage = server(releaseB, { "/api/public/manifest": "<html>Cloudflare</html>" });
  await assert.rejects(
    () => syncContentRelease(options(active, storage, garbage.fetchImpl)),
    (error: unknown) => error instanceof ContentUpdateRuntimeError && error.outcome === "invalid-response",
  );
  assert.equal((await readTransaction(storage, validate)).snapshot?.hash, releaseA.snapshot.hash);
});

test("server errors are failures, not offline, and keep the active copy", async () => {
  const { storage, active } = await installed(releaseA);
  const failing = (async () => new Response('{"error":"Aún no hay publicación"}', { status: 503 })) as typeof fetch;
  await assert.rejects(
    () => syncContentRelease(options(active, storage, failing)),
    (error: unknown) => error instanceof ContentUpdateRuntimeError && error.outcome === "failure",
  );
  assert.equal((await readTransaction(storage, validate)).snapshot?.hash, releaseA.snapshot.hash);
});

test("a rebuild that does not reproduce the published hash falls back to the release snapshot", async () => {
  const { storage, active } = await installed(releaseA);
  // A stale dataset map makes the diff miss the procedures change.
  const lying: ReleaseInfo = { ...active.release!, datasets: { ...active.release!.datasets } };
  const content = baseContent();
  content.procedures = [{ ...content.procedures[0], content: "Texto nuevo" }, content.procedures[1]];
  const releaseC = publish("release-c", makeSnapshot(content));
  lying.datasets.procedures = { ...releaseC.manifest.datasets.procedures };
  const live = server(releaseC);
  const result = await syncContentRelease(options({ ...active, release: lying }, storage, live.fetchImpl));
  assert.equal(result.kind === "updated" && result.mode, "snapshot");
  assert.equal(live.paths().at(-1), "/api/public/releases/release-c/snapshot");
  assert.equal((await readTransaction(storage, validate)).snapshot?.hash, releaseC.snapshot.hash);
});

test("an identical manifest (no validator match) is up to date without downloads", async () => {
  const { storage, active } = await installed(releaseA);
  const live = server(releaseA);
  const result = await syncContentRelease(options({ ...active, snapshot: { ...active.snapshot } }, storage, (async (url: string, init?: RequestInit) => live.fetchImpl(url, { ...init, headers: {} })) as typeof fetch));
  assert.equal(result.kind, "up-to-date");
  assert.deepEqual(live.paths(), ["/api/public/manifest"]);
});

test("manifest parsing ignores unknown and malformed dataset entries", () => {
  const raw = { ...releaseA.manifest, datasets: { ...releaseA.manifest.datasets, "NOPE!": {}, extra: { url: "/api/public/x", immutableUrl: "/api/public/y", sha256: "bad", bytes: 1 } } };
  const manifest = parsePublicManifest(raw);
  assert.equal(manifest.datasets["NOPE!"], undefined);
  assert.equal(manifest.datasets.extra, undefined);
  for (const name of KNOWN_DATASETS) assert.ok(manifest.datasets[name], `published dataset ${name} is known to the app`);
  assert.throws(() => parsePublicManifest({ ...raw, schema: "otro" }), /esquema/);
  assert.throws(() => parsePublicManifest({ ...raw, contentHash: "x" }), /contentHash/);
});

test("planning: seed always downloads, missing datasets force the snapshot", () => {
  const info = releaseInfoFromManifest(releaseA.manifest, releaseA.snapshot.packageHash!);
  assert.deepEqual(planSync(releaseA.manifest, { snapshot: releaseA.snapshot, release: info, isSeed: true }), { kind: "snapshot", reason: "seed" });
  assert.deepEqual(planSync(releaseA.manifest, { snapshot: releaseA.snapshot, release: info, isSeed: false }), { kind: "up-to-date" });
  assert.deepEqual(planSync(releaseB.manifest, { snapshot: releaseA.snapshot, isSeed: false }), { kind: "snapshot", reason: "no-release-record" });
  const withoutCodes = { ...releaseB.manifest, datasets: { ...releaseB.manifest.datasets } };
  delete withoutCodes.datasets["codigos-lima"];
  assert.deepEqual(planSync(withoutCodes, { snapshot: releaseA.snapshot, release: info, isSeed: false }), { kind: "snapshot", reason: "missing-dataset" });
  assert.equal(manualVersionOf(releaseA.snapshot), "v1.1 Mayo 2026");
  assert.equal(manualVersionOf(releaseA.snapshot, { manualVersion: "v2" }), "v2");
});

test("the seed drops only redundant fields", () => {
  const seed = buildSeedSnapshot(releaseA.snapshot);
  assert.equal(seed.content.procedures[0].searchText, "");
  assert.equal(seed.content.procedures[0].content, releaseA.snapshot.content.procedures[0].content);
  assert.deepEqual(seed.content.updates, []);
  assert.deepEqual(seed.content.drugs, releaseA.snapshot.content.drugs);
  assert.deepEqual(seed.content.codes, releaseA.snapshot.content.codes);
});

test("content check records round-trip defensively and keep the last confirmation", () => {
  const record = { checkedAt: "2026-09-09T10:00:00.000Z", outcome: "up-to-date" as const, remoteIdentity: "same", verifiedAt: "2026-09-09T10:00:00.000Z" };
  assert.deepEqual(parseContentCheckRecord(serializeContentCheckRecord(record)), record);
  assert.equal(parseContentCheckRecord('{"outcome":"unknown"}'), undefined);
  const offline = mergeCheckRecord(record, { checkedAt: "2026-09-10T10:00:00.000Z", outcome: "offline" });
  assert.equal(offline.verifiedAt, "2026-09-09T10:00:00.000Z");
});

test("automatic sync is throttled from the persisted record; the seed is always due", () => {
  const now = Date.parse("2026-10-31T12:00:00.000Z");
  const at = (ms: number) => new Date(now - ms).toISOString();
  assert.equal(automaticSyncDue(undefined, false, now), true);
  assert.equal(automaticSyncDue({ checkedAt: at(60_000), outcome: "up-to-date" }, true, now), true);
  assert.equal(automaticSyncDue({ checkedAt: at(AUTOMATIC_REFRESH_COOLDOWN_MS - 1), outcome: "up-to-date" }, false, now), false);
  assert.equal(automaticSyncDue({ checkedAt: at(AUTOMATIC_REFRESH_COOLDOWN_MS), outcome: "up-to-date" }, false, now), true);
  assert.equal(automaticSyncDue({ checkedAt: at(FAILED_CHECK_RETRY_MS - 1), outcome: "offline" }, false, now), false);
  assert.equal(automaticSyncDue({ checkedAt: at(FAILED_CHECK_RETRY_MS), outcome: "offline" }, false, now), true);
  // Legacy in-memory helpers still behave.
  assert.equal(automaticRefreshAllowed(undefined, now), true);
  assert.equal(shouldRefreshOnResume("background", "active", now - AUTOMATIC_REFRESH_COOLDOWN_MS, now), true);
  assert.equal(shouldRefreshOnResume("inactive", "background", undefined, now), false);
});

test("the offline banner shows only for the seed or data unconfirmed for a day", () => {
  const now = Date.parse("2026-10-31T12:00:00.000Z");
  const offline = (verifiedAgoMs?: number) => ({ checkedAt: new Date(now).toISOString(), outcome: "offline" as const, ...(verifiedAgoMs === undefined ? {} : { verifiedAt: new Date(now - verifiedAgoMs).toISOString() }) });
  assert.equal(isOfflineWithStaleData(offline(), true, now), true);
  assert.equal(isOfflineWithStaleData(offline(60 * 60 * 1000), false, now), false);
  assert.equal(isOfflineWithStaleData(offline(25 * 60 * 60 * 1000), false, now), true);
  assert.equal(isOfflineWithStaleData({ checkedAt: new Date(now).toISOString(), outcome: "up-to-date" }, true, now), false);
});

test("dates are formatted for Spain", () => {
  assert.equal(formatDataDate("2026-10-28T08:12:44.103Z"), "28 de octubre de 2026");
  assert.equal(formatDataDate("2026-10-31T23:30:00.000Z"), "1 de noviembre de 2026", "Madrid calendar, not UTC");
  assert.equal(formatDataDate(null), "fecha no disponible");
  const now = new Date("2026-10-31T12:00:00.000Z");
  assert.equal(formatCheckedAt("2026-10-31T08:14:00.000Z", now), "hoy, 9:14");
  assert.equal(formatCheckedAt("2026-10-30T17:02:00.000Z", now), "ayer, 18:02");
  assert.match(formatCheckedAt("2026-10-20T08:14:00.000Z", now) ?? "", /^20 oct 2026, 10:14$/);
  assert.equal(formatCheckedAt(undefined, now), undefined);
});

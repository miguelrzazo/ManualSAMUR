import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import type { MobileSnapshot } from "../packages/manual-content/src/index.ts";
import { STAGED_PACKAGE_KEY, type ContentStorage } from "../apps/mobile/src/content-transaction.ts";
import {
  contentIdentity,
  contentUpdateNeeded,
  parseContentCheckRecord,
  serializeContentCheckRecord,
  type PublishedContentMetadata,
} from "../apps/mobile/src/content-update-logic.ts";
import { checkAndStageContent, ContentUpdateRuntimeError } from "../apps/mobile/src/content-update-runtime.ts";

class MemoryStorage implements ContentStorage {
  values = new Map<string, string>();
  async getItem(key: string) { return this.values.get(key) ?? null; }
  async setItem(key: string, value: string) { this.values.set(key, value); }
  async removeItem(key: string) { this.values.delete(key); }
}

const hash = (identity: string) => createHash("sha256").update(identity).digest("hex");

const metadata = (identity: string, packageHash = hash(identity)): PublishedContentMetadata => ({
  schema: "samur-manual.mobile-content",
  version: 3,
  hash: hash(identity),
  packageHash,
  generatedAt: "2026-09-09T10:00:00.000Z",
});

const snapshot = (identity: string): MobileSnapshot => ({
  schema: "samur-manual.mobile-content",
  version: 3,
  generatedAt: "2026-09-09T10:00:00.000Z",
  hash: hash(identity),
  contentHash: hash(identity),
  packageHash: hash(identity),
  content: { procedures: [], relationsIndex: { codes: {} } } as MobileSnapshot["content"],
});

function response(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "content-length": "128" } });
}

test("content identity prefers packageHash and detects any package change", () => {
  assert.equal(contentIdentity({ hash: "content", packageHash: "package" }), "package");
  assert.equal(contentIdentity({ hash: "content", packageHash: undefined }), "content");
  assert.equal(contentUpdateNeeded(metadata("new"), snapshot("old")), true);
  assert.equal(contentUpdateNeeded(metadata("same"), snapshot("same")), false);
});

test("content check records round-trip defensively", () => {
  const record = { checkedAt: "2026-09-09T10:00:00.000Z", outcome: "up-to-date" as const, remoteIdentity: "same" };
  assert.deepEqual(parseContentCheckRecord(serializeContentCheckRecord(record)), record);
  assert.equal(parseContentCheckRecord('{"outcome":"unknown"}'), undefined);
});

test("unchanged metadata avoids downloading the full content package", async () => {
  const storage = new MemoryStorage();
  const calls: string[] = [];
  const result = await checkAndStageContent({
    contentUrl: "https://example.test/content",
    metadataUrl: "https://example.test/metadata",
    activeSnapshot: snapshot("same"),
    storage,
    validate: async () => true,
    now: () => "2026-09-09T10:01:00.000Z",
    fetchImpl: async (url) => { calls.push(url); return response(metadata("same")); },
  });
  assert.equal(result.kind, "up-to-date");
  assert.deepEqual(calls, ["https://example.test/metadata"]);
  assert.equal(storage.values.has(STAGED_PACKAGE_KEY), false);
});

test("changed metadata downloads, validates, and stages the new package", async () => {
  const storage = new MemoryStorage();
  const calls: string[] = [];
  const result = await checkAndStageContent({
    contentUrl: "https://example.test/content",
    metadataUrl: "https://example.test/metadata",
    activeSnapshot: snapshot("old"),
    storage,
    validate: async () => true,
    now: () => "2026-09-09T10:01:00.000Z",
    fetchImpl: async (url) => {
      calls.push(url);
      return url.endsWith("metadata") ? response(metadata("new")) : response(snapshot("new"));
    },
  });
  assert.equal(result.kind, "staged");
  assert.equal(result.record.outcome, "update-available");
  assert.deepEqual(calls, ["https://example.test/metadata", "https://example.test/content"]);
  assert.equal(storage.values.has(STAGED_PACKAGE_KEY), true);
});

test("invalid metadata becomes a typed, user-classifiable failure", async () => {
  await assert.rejects(
    () => checkAndStageContent({
      contentUrl: "https://example.test/content",
      metadataUrl: "https://example.test/metadata",
      activeSnapshot: snapshot("old"),
      storage: new MemoryStorage(),
      validate: async () => true,
      fetchImpl: async () => response({ nope: true }),
    }),
    (error: unknown) => error instanceof ContentUpdateRuntimeError && error.outcome === "invalid-response",
  );
});

test("network errors classify as offline without touching the active package", async () => {
  const storage = new MemoryStorage();
  await assert.rejects(
    () => checkAndStageContent({
      contentUrl: "https://example.test/content",
      metadataUrl: "https://example.test/metadata",
      activeSnapshot: snapshot("old"),
      storage,
      validate: async () => true,
      fetchImpl: async () => { throw new TypeError("Network request failed"); },
    }),
    (error: unknown) => error instanceof ContentUpdateRuntimeError && error.outcome === "offline",
  );
  assert.equal(storage.values.has(STAGED_PACKAGE_KEY), false);
});

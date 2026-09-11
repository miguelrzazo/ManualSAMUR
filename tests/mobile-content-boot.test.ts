import assert from "node:assert/strict";
import test from "node:test";
import {
  contentHash,
  packageHash,
  type MobileContent,
  type MobileSnapshot,
} from "../packages/manual-content/src/index.ts";
import {
  ACTIVE_POINTER_KEY,
  CONTENT_STORAGE_SCHEMA,
  CONTENT_STORAGE_VERSION,
  type ContentStorage,
  stagePackage,
  activateStagedPackage,
} from "../apps/mobile/src/content-transaction.ts";
import { readContentBoot, validateBootSnapshot, validateSnapshotOnce } from "../apps/mobile/src/content-boot.ts";

class MemoryStorage implements ContentStorage {
  values = new Map<string, string>();

  async getItem(key: string) { return this.values.get(key) ?? null; }
  async setItem(key: string, value: string) { this.values.set(key, value); }
  async removeItem(key: string) { this.values.delete(key); }
}

function shapedSnapshot(digit: string): MobileSnapshot {
  return {
    schema: "samur-manual.mobile-content",
    version: 3,
    generatedAt: "2026-09-09T00:00:00.000Z",
    hash: digit.repeat(64),
    contentHash: digit.repeat(64),
    packageHash: digit.repeat(64),
    content: { procedures: [], relationsIndex: { codes: {} } } as MobileSnapshot["content"],
  };
}

function validSnapshot(): MobileSnapshot {
  const content = { procedures: [], relationsIndex: { codes: {} } } as unknown as MobileContent;
  const hash = contentHash(content);
  return {
    schema: "samur-manual.mobile-content",
    version: 3,
    generatedAt: "2026-09-09T00:00:00.000Z",
    hash,
    contentHash: hash,
    packageHash: packageHash(content, []),
    content,
  };
}

test("content boot returns the bundled snapshot without cryptographic validation", async () => {
  const bundled = shapedSnapshot("a");
  const result = await readContentBoot(new MemoryStorage(), bundled);

  assert.equal(result.snapshot, bundled);
  assert.equal(result.transaction.snapshot, undefined);
});

test("content boot adopts an activated package after cheap pointer and shape checks", async () => {
  const storage = new MemoryStorage();
  const active = shapedSnapshot("b");
  const packageKey = `manualsamur.content.package.v1.${active.packageHash}`;
  storage.values.set(ACTIVE_POINTER_KEY, JSON.stringify({
    schema: CONTENT_STORAGE_SCHEMA,
    version: CONTENT_STORAGE_VERSION,
    packageHash: active.packageHash,
    packageKey,
    activatedAt: active.generatedAt,
  }));
  storage.values.set(packageKey, JSON.stringify({
    schema: CONTENT_STORAGE_SCHEMA,
    version: CONTENT_STORAGE_VERSION,
    packageHash: active.packageHash,
    snapshot: active,
  }));

  const bundled = shapedSnapshot("c");
  const result = await readContentBoot(storage, bundled);
  assert.deepEqual(result.snapshot, active);
  assert.equal(result.transaction.warning, undefined);
});

test("malformed persisted content falls back to the bundled snapshot", async () => {
  const storage = new MemoryStorage();
  const malformed = { ...shapedSnapshot("d"), content: {} };
  const packageKey = `manualsamur.content.package.v1.${malformed.packageHash}`;
  storage.values.set(ACTIVE_POINTER_KEY, JSON.stringify({
    schema: CONTENT_STORAGE_SCHEMA,
    version: CONTENT_STORAGE_VERSION,
    packageHash: malformed.packageHash,
    packageKey,
    activatedAt: malformed.generatedAt,
  }));
  storage.values.set(packageKey, JSON.stringify({
    schema: CONTENT_STORAGE_SCHEMA,
    version: CONTENT_STORAGE_VERSION,
    packageHash: malformed.packageHash,
    snapshot: malformed,
  }));

  const bundled = shapedSnapshot("e");
  const result = await readContentBoot(storage, bundled);
  assert.equal(result.snapshot, bundled);
  assert.match(result.transaction.warning ?? "", /comprobaciones locales/);
});

test("strict validation is cached by immutable package hash", async () => {
  const snapshot = validSnapshot();
  const first = validateSnapshotOnce(snapshot);
  const second = validateSnapshotOnce(snapshot);

  assert.strictEqual(first, second);
  assert.equal(await first, true);
});

test("deferred validation falls back to the bundled snapshot when the active package is corrupted", async () => {
  const valid = validSnapshot();
  const corrupted = { ...valid, hash: "f".repeat(64), contentHash: "f".repeat(64) };
  const bundled = shapedSnapshot("9");

  assert.equal(await validateBootSnapshot(corrupted, bundled), bundled);
});

test("staging and activation still require strict validation", async () => {
  const storage = new MemoryStorage();
  const snapshot = validSnapshot();
  const staged = await stagePackage(storage, snapshot, validateSnapshotOnce);
  const pointer = await activateStagedPackage(storage, staged, validateSnapshotOnce);

  assert.equal(pointer.packageHash, snapshot.packageHash);
  assert.equal(JSON.parse(storage.values.get(ACTIVE_POINTER_KEY) ?? "{}").packageHash, snapshot.packageHash);

  const invalid = { ...snapshot, hash: "a".repeat(64), contentHash: "a".repeat(64) };
  await assert.rejects(() => stagePackage(storage, invalid, validateSnapshotOnce), /integridad/);
});

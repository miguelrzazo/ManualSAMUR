import test from "node:test";
import assert from "node:assert/strict";
import type { MobileSnapshot } from "../apps/mobile/src/data/schema.ts";
import {
  ACTIVE_POINTER_KEY,
  LEGACY_SNAPSHOT_KEY,
  STAGED_PACKAGE_KEY,
  discardStagedPackage,
  readTransaction,
  resumeStagedPackage,
  stagePackage,
  activateStagedPackage,
  contentFreshness,
  type ContentStorage,
} from "../apps/mobile/src/content-transaction.ts";

const hash = (digit: string) => digit.repeat(64);
const snapshot = (digit: string): MobileSnapshot => ({
  schema: "samur-manual.mobile-content",
  version: 2,
  generatedAt: "2026-09-01T00:00:00.000Z",
  hash: hash(digit),
  contentHash: hash(digit),
  packageHash: hash(digit),
  content: {} as MobileSnapshot["content"],
});

class MemoryStorage implements ContentStorage {
  values = new Map<string, string>();
  failKey?: string;
  async getItem(key: string) { return this.values.get(key) ?? null; }
  async setItem(key: string, value: string) {
    if (key === this.failKey) throw new Error(`write failed: ${key}`);
    this.values.set(key, value);
  }
  async removeItem(key: string) { this.values.delete(key); }
}

const accepts = async (value: unknown) => Boolean(value && typeof value === "object" && (value as MobileSnapshot).schema === "samur-manual.mobile-content");

test("staging writes an immutable package and recovery record without changing the active pointer", async () => {
  const storage = new MemoryStorage();
  await stagePackage(storage, snapshot("a"), accepts, "2026-09-05T10:00:00.000Z");
  assert.equal(await storage.getItem(ACTIVE_POINTER_KEY), null);
  const transaction = await readTransaction(storage, accepts);
  assert.equal(transaction.snapshot, undefined);
  assert.equal(transaction.stagedSnapshot?.packageHash, hash("a"));
  assert.equal(transaction.staged?.phase, "staged");
});

test("activation changes only the small pointer after validating the staged package", async () => {
  const storage = new MemoryStorage();
  const old = snapshot("b");
  const staged = await stagePackage(storage, snapshot("c"), accepts, "2026-09-05T10:00:00.000Z");
  const pointer = await activateStagedPackage(storage, staged, accepts, "2026-09-05T10:01:00.000Z");
  assert.equal(pointer.packageHash, hash("c"));
  assert.equal((await readTransaction(storage, accepts)).snapshot?.packageHash, hash("c"));
  assert.equal(await storage.getItem(STAGED_PACKAGE_KEY), null);

  // A second staged package remains independent of the already active one.
  await stagePackage(storage, old, accepts, "2026-09-05T10:02:00.000Z");
  assert.equal((await readTransaction(storage, accepts)).snapshot?.packageHash, hash("c"));
});

test("validation failure never replaces last-known-good content", async () => {
  const storage = new MemoryStorage();
  const good = await stagePackage(storage, snapshot("d"), accepts);
  await activateStagedPackage(storage, good, accepts);
  const invalid = snapshot("e");
  await assert.rejects(() => stagePackage(storage, invalid, async () => false), /integridad/);
  assert.equal((await readTransaction(storage, accepts)).snapshot?.packageHash, hash("d"));
});

test("pointer write failure leaves staged content resumable and active content intact", async () => {
  const storage = new MemoryStorage();
  const good = await stagePackage(storage, snapshot("f"), accepts);
  await activateStagedPackage(storage, good, accepts);
  const staged = await stagePackage(storage, snapshot("1"), accepts);
  storage.failKey = ACTIVE_POINTER_KEY;
  await assert.rejects(() => activateStagedPackage(storage, staged, accepts), /write failed/);
  const afterFailure = await readTransaction(storage, accepts);
  assert.equal(afterFailure.snapshot?.packageHash, hash("f"));
  assert.equal(afterFailure.stagedSnapshot?.packageHash, hash("1"));
  assert.equal(afterFailure.staged?.phase, "staged");
});

test("a staged-record or package write failure cannot move the active pointer", async () => {
  const storage = new MemoryStorage();
  const good = await stagePackage(storage, snapshot("6"), accepts);
  await activateStagedPackage(storage, good, accepts);
  storage.failKey = STAGED_PACKAGE_KEY;
  await assert.rejects(() => stagePackage(storage, snapshot("7"), accepts), /write failed/);
  assert.equal((await readTransaction(storage, accepts)).snapshot?.packageHash, hash("6"));
});

test("process-death recovery can resume or discard a staged package", async () => {
  const storage = new MemoryStorage();
  const staged = await stagePackage(storage, snapshot("2"), accepts);
  const resumed = await resumeStagedPackage(storage, accepts);
  assert.equal(resumed?.snapshot.packageHash, hash("2"));
  assert.equal((await readTransaction(storage, accepts)).snapshot?.packageHash, hash("2"));

  await stagePackage(storage, snapshot("3"), accepts);
  await discardStagedPackage(storage);
  const transaction = await readTransaction(storage, accepts);
  assert.equal(transaction.snapshot?.packageHash, hash("2"));
  assert.equal(transaction.staged, undefined);
  assert.equal(staged.phase, "staged");
});

test("legacy raw snapshots are migrated transactionally", async () => {
  const storage = new MemoryStorage();
  const legacy = snapshot("4");
  await storage.setItem(LEGACY_SNAPSHOT_KEY, JSON.stringify(legacy));
  const { migrateLegacySnapshot } = await import("../apps/mobile/src/content-transaction.ts");
  const migrated = await migrateLegacySnapshot(storage, accepts, "2026-09-05T11:00:00.000Z");
  assert.equal(migrated?.packageHash, hash("4"));
  assert.equal((await readTransaction(storage, accepts)).snapshot?.packageHash, hash("4"));
});

test("unknown or tampered pointers are ignored rather than trusted", async () => {
  const storage = new MemoryStorage();
  await storage.setItem(ACTIVE_POINTER_KEY, JSON.stringify({ schema: "future", version: 99, packageHash: hash("5"), packageKey: "bad" }));
  const transaction = await readTransaction(storage, accepts);
  assert.equal(transaction.snapshot, undefined);
  assert.equal(transaction.active, undefined);
});

test("freshness is deterministic and treats malformed metadata as unknown", () => {
  const now = new Date("2026-09-05T00:00:00.000Z");
  assert.equal(contentFreshness("2026-09-01T00:00:00.000Z", now), "fresh");
  assert.equal(contentFreshness("2026-01-01T00:00:00.000Z", now), "stale");
  assert.equal(contentFreshness("not-a-date", now), "unknown");
});

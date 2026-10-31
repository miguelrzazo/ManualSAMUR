import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { createHash } from "node:crypto";

const files = new Map<string, Uint8Array>();
let downloaded = new Uint8Array([1, 2, 3]);
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
class Directory {
  uri: string;
  constructor(base: string | Directory, name = "") { this.uri = `${typeof base === "string" ? base : base.uri}/${name}`; }
  create() {}
}
class File {
  uri: string;
  parentDirectory = new Directory("file:///documents");
  constructor(base: string | Directory, name?: string) { this.uri = name === undefined ? String(base) : `${typeof base === "string" ? base : base.uri}/${name}`; }
  get exists() { return files.has(this.uri); }
  async bytes() { const bytes = files.get(this.uri); if (!bytes) throw new Error("missing"); return bytes; }
  delete() { files.delete(this.uri); }
  static createDownloadTask(_url: string, destination: File) {
    return { state: "done", async downloadAsync() { files.set(destination.uri, downloaded); return destination; }, release() {} };
  }
}
const bundle = { content: { procedures: [] as { attachments: unknown[] }[] } };
const records = new Map<string, string>();
const storage = { async getItem(key: string) { return records.get(key) ?? null; }, async setItem(key: string, value: string) { records.set(key, value); }, async removeItem(key: string) { records.delete(key); }, async getAllKeys() { return [...records.keys()]; } };
const platform = { File, Directory, storage, bundle, digest: async (_algorithm: string, bytes: Uint8Array) => new Uint8Array(createHash("sha256").update(bytes).digest()).buffer };
const testGlobal = globalThis as typeof globalThis & { __attachmentTest?: typeof platform };
testGlobal.__attachmentTest = platform;
const mocks: Record<string, string> = {
  "@react-native-async-storage/async-storage": "export default globalThis.__attachmentTest.storage;",
  "expo-file-system": "export const { File, Directory } = globalThis.__attachmentTest; export const Paths = { document: new Directory('file:///documents'), bundle: new Directory('file:///bundle') };",
  "expo-crypto": "export const digest = globalThis.__attachmentTest.digest; export const CryptoDigestAlgorithm = { SHA256: 'sha256' };",
  "./content-origin": "export const manualContentOrigin = () => 'https://manual.example';",
  "./data/seed.json": "export default globalThis.__attachmentTest.bundle;",
};
// Compile this native boundary into an isolated module with explicit platform doubles.
// This works on the supported Node 22.13 baseline without newer module-hook APIs.
const runtimePath = new URL("../apps/mobile/src/attachment-runtime.ts", import.meta.url);
let runtimeSource = ts.transpileModule(readFileSync(runtimePath, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
for (const [specifier, source] of Object.entries(mocks)) {
  const url = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
  runtimeSource = runtimeSource.replace(JSON.stringify(specifier), JSON.stringify(url));
}
runtimeSource = runtimeSource.replace(JSON.stringify("./attachment-logic"), JSON.stringify(new URL("../apps/mobile/src/attachment-logic.ts", import.meta.url).href));
const runtime: typeof import("../apps/mobile/src/attachment-runtime.ts") = await import(`data:text/javascript;base64,${Buffer.from(runtimeSource).toString("base64")}`);
const logic = await import("../apps/mobile/src/attachment-logic.ts");
const oldBytes = new Uint8Array([4, 5, 6]);
const attachment = { id: "versioned", filename: "manual.pdf", localPath: "/docs/manual.pdf", sourceUrl: "https://official.example/manual.pdf", kind: "pdf" as const, byteLength: 3, sha256: digest(downloaded) };

function seedLastGood() {
  files.clear(); records.clear();
  files.set("file:///documents/old.pdf", oldBytes);
  const old = logic.markAttachmentAvailable(logic.createAttachmentRecord(attachment, "before"), { localUri: "file:///documents/old.pdf", byteLength: 3, sha256: digest(oldBytes) }, { ...attachment, sha256: digest(oldBytes) }, "before");
  records.set(logic.attachmentStorageKey(attachment.id), JSON.stringify(old));
  return old;
}

test("failed integrity check preserves last-good bytes and pointer", async () => {
  seedLastGood(); downloaded = new Uint8Array([9, 9, 9]);
  const result = await runtime.downloadOptionalAttachment(attachment, { storage });
  assert.equal(result.status, "available");
  assert.equal(result.localUri, "file:///documents/old.pdf");
  assert.match(result.error ?? "", /última copia verificada/);
  assert.deepEqual(files.get(result.localUri!), oldBytes);
  assert.equal(files.size, 1);
});

test("verified replacement commits before retiring the previous downloaded version", async () => {
  seedLastGood(); downloaded = new Uint8Array([1, 2, 3]);
  const result = await runtime.downloadOptionalAttachment(attachment, { storage });
  assert.equal(logic.isLocallyAvailable(result, attachment), true);
  assert.equal(files.has("file:///documents/old.pdf"), false);
  assert.deepEqual(files.get(result.localUri!), downloaded);
  assert.equal(JSON.parse(records.get(logic.attachmentStorageKey(attachment.id))!).sha256, attachment.sha256);
});

test("interrupted persisted download recovers and revalidates its last-good file", async () => {
  const old = seedLastGood();
  records.set(logic.attachmentStorageKey(attachment.id), JSON.stringify({ ...old, status: "downloading", lastGood: old }));
  const result = await runtime.reconcileAttachmentRecord(attachment, storage);
  assert.equal(result.status, "available");
  assert.equal(result.sha256, digest(oldBytes));
  files.set("file:///documents/old.pdf", new Uint8Array([0]));
  const corrupt = await runtime.reconcileAttachmentRecord(attachment, storage);
  assert.equal(logic.isReadableOffline(corrupt), false);
});

test("a bundle with an older approved digest stays readable and is never overwritten", async () => {
  files.clear(); records.clear();
  const bundledMetadata = { ...attachment, sha256: digest(oldBytes) };
  bundle.content.procedures = [{ attachments: [bundledMetadata] }];
  const bundledUri = runtime.bundledAttachmentUri(attachment);
  files.set(bundledUri, oldBytes);
  const previous = await runtime.reconcileAttachmentRecord(attachment, storage);
  assert.equal(logic.isLocallyAvailable(previous, attachment), false);
  assert.equal(logic.isReadableOffline(previous), true);
  assert.equal(previous.sha256, digest(oldBytes));
  downloaded = new Uint8Array([1, 2, 3]);
  const current = await runtime.downloadOptionalAttachment(attachment, { storage });
  assert.equal(logic.isLocallyAvailable(current, attachment), true);
  assert.notEqual(current.localUri, bundledUri);
  assert.deepEqual(files.get(bundledUri), oldBytes);
});

test.after(() => { delete testGlobal.__attachmentTest; });

import test from "node:test";
import assert from "node:assert/strict";

import {
  MOBILE_SNAPSHOT_SCHEMA,
  MOBILE_SNAPSHOT_VERSION,
  buildMobileContentSnapshot,
  canonicalJson,
  contentHash,
  isMobileContentPackage,
  isMobileContentSnapshot,
  packageHash,
  type MobileAttachmentManifest,
  type MobileContentSnapshot,
} from "../lib/mobile-snapshot.ts";

const content: MobileContentSnapshot["content"] = {
  procedures: [],
  codes: { incidente: [] },
  drugs: [],
  perfusions: [],
  fluids: [],
  commercialNames: [],
  abbreviations: [],
  hospitals: [],
  bases: [],
  status4: [],
  manual: {},
  links: {
    sourceUrl: "",
    updatedAt: "",
    avisoImportanteUrl: "",
    samurEmail: "samur@madrid.es",
    officialWebUrl: "https://www.madrid.es/samur",
    abbreviationsUrl: "",
    collaboratorsUrl: "",
  },
  updates: [],
};

test("mobile snapshots validate their schema, version and content hash", () => {
  const snapshot: MobileContentSnapshot = {
    schema: MOBILE_SNAPSHOT_SCHEMA,
    version: MOBILE_SNAPSHOT_VERSION,
    generatedAt: "2026-07-11T00:00:00.000Z",
    hash: contentHash(content),
    content,
  };

  assert.equal(isMobileContentSnapshot(snapshot), true);
  assert.equal(isMobileContentSnapshot({ ...snapshot, version: 99 }), false);
  assert.equal(isMobileContentSnapshot({ ...snapshot, hash: "changed" }), false);
});

test("mobile snapshots give every procedure a unique route key", () => {
  const procedures = buildMobileContentSnapshot().content.procedures;

  assert.equal(new Set(procedures.map((procedure) => procedure.routeKey)).size, procedures.length);
  assert.equal(procedures.every((procedure) => procedure.routeKey === `procedure:${procedure.id}`), true);
});

test("canonical package bytes do not depend on object insertion order", () => {
  assert.equal(canonicalJson({ z: 1, a: { y: true, x: "ok" } }), '{"a":{"x":"ok","y":true},"z":1}');
});

test("package hash includes the attachment manifest", () => {
  const snapshot = buildMobileContentSnapshot();
  const attachments = snapshot.content.procedures.flatMap((procedure) => procedure.attachments.map((attachment) => ({ ...attachment, procedureId: procedure.id }))) as MobileAttachmentManifest["attachments"];
  assert.equal(snapshot.packageHash, packageHash(snapshot.content, attachments));
  assert.equal(isMobileContentPackage(snapshot, {
    schema: "samur-manual.mobile-attachments",
    version: 1,
    generatedAt: snapshot.generatedAt,
    contentHash: snapshot.hash,
    packageHash: snapshot.packageHash as string,
    attachments,
  }), true);
  assert.equal(isMobileContentPackage(snapshot, {
    schema: "samur-manual.mobile-attachments",
    version: 1,
    generatedAt: snapshot.generatedAt,
    contentHash: snapshot.hash,
    packageHash: snapshot.packageHash as string,
    attachments: [{ ...attachments[0], localPath: "/docs/../private.txt" }, ...attachments.slice(1)],
  }), false);
});

test("v2 snapshots carry canonical relation, editorial, update and attachment data", () => {
  const snapshot = buildMobileContentSnapshot();
  const procedure = snapshot.content.procedures.find((item) => item.editorialBlocks.length > 0);

  assert.ok(procedure);
  assert.ok(Array.isArray(procedure.relations));
  assert.ok(Array.isArray(procedure.updates));
  assert.ok(procedure.attachments.every((attachment) => attachment.id && attachment.filename));
});

test("the packaged bodies are normalized, not raw XWiki", async () => {
  // The corpus is raw XWiki markdown and the web normalizes on read. The package used to
  // ship the raw body, so every artifact the web strips reached the native reader.
  const { readFileSync } = await import("node:fs");
  const path = (await import("node:path")).default;
  const packaged = JSON.parse(readFileSync(path.join(process.cwd(), "apps/mobile/src/data/snapshot.json"), "utf8")) as MobileContentSnapshot;
  assert.ok(packaged.content.procedures.length > 200);

  for (const procedure of packaged.content.procedures) {
    assert.ok(!procedure.content.includes("((("), `${procedure.id} ships an xwiki cell wrapper`);
    assert.ok(!procedure.content.includes(")))"), `${procedure.id} ships an xwiki cell wrapper`);
    assert.ok(!/\bimage:/.test(procedure.content), `${procedure.id} ships an xwiki image macro`);
  }
});

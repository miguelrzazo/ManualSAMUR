import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { getAllProcedures } from "../lib/content.ts";
import { buildMobileContentPackage, canonicalJson, isMobileContentPackage } from "../lib/mobile-snapshot.ts";

const root = process.cwd();
const expected = buildMobileContentPackage(root);
const read = (file: string) => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const snapshot = read("apps/mobile/src/data/snapshot.json");
const manifest = read("apps/mobile/src/data/attachment-manifest.json");
assert.ok(isMobileContentPackage(snapshot, manifest), "Invalid embedded mobile package");
assert.ok(canonicalJson(snapshot) === canonicalJson(expected.snapshot), "Embedded and canonical snapshots differ");
assert.ok(canonicalJson(manifest) === canonicalJson(expected.manifest), "Attachment manifests differ");
const procedures = getAllProcedures();
const ids = new Set(procedures.map((procedure) => procedure.id));
assert.equal(ids.size, procedures.length, "Duplicate canonical procedure IDs");
assert.deepEqual(
  fs.readdirSync(path.join(root, "public/procedures")).filter((name) => name.endsWith(".md")).sort(),
  procedures.map((procedure) => `${procedure.id}.md`).sort(),
  "Public Markdown has stale or missing procedures",
);
for (const procedure of snapshot.content.procedures) {
  const web = procedures.find((item) => item.id === procedure.id);
  assert.ok(web, `Unknown mobile procedure ${procedure.id}`);
  assert.equal(procedure.content, web.content, `Reader content differs for ${procedure.id}`);
  assert.equal(procedure.title, web.title);
  assert.equal(procedure.slug, web.slug);
  assert.equal(procedure.updated, web.updated);
  for (const relation of procedure.relations) assert.ok(ids.has(relation.id), `Dangling relation ${procedure.id} → ${relation.id}`);
}
for (const endpoint of ["v3", "v2", "metadata"]) {
  const exported = read(`out/api/mobile/content/${endpoint}`);
  assert.equal(exported.hash, snapshot.hash, `Exported ${endpoint} hash differs`);
  assert.equal(exported.packageHash, snapshot.packageHash, `Exported ${endpoint} package differs`);
  if (endpoint === "v2") assert.ok(canonicalJson(exported) === canonicalJson(snapshot), "Exported mobile content differs");
}
const historyIndex = read("public/mobile-history/index.json");
assert.equal(historyIndex.publicationIdentity, snapshot.packageHash, "Mobile history belongs to another publication");
assert.equal(historyIndex.totalPages, historyIndex.pages.length, "Mobile history index has missing pages");
for (const page of historyIndex.pages) {
  const historyPage = read(`public${page.path}`);
  assert.equal(historyPage.publicationIdentity, snapshot.packageHash, `Mobile history page ${page.page} belongs to another publication`);
  assert.equal(historyPage.page, page.page, `Mobile history page ${page.page} has the wrong number`);
}
console.log(`Content parity passed: ${ids.size} procedures; shared snapshot ${snapshot.hash}`);

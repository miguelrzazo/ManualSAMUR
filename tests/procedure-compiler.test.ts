import test from "node:test";
import assert from "node:assert/strict";

import { getAllProcedures } from "../lib/content.ts";
import { compileProcedureCorpus, loadProcedureSources } from "../lib/procedure-compiler.ts";

test("web and generators share one canonical compiled procedure corpus", () => {
  const sources = loadProcedureSources();
  const compiledFromSources = compileProcedureCorpus(process.cwd(), sources);
  const web = getAllProcedures();

  assert.ok(sources.length > 200);
  assert.equal(compiledFromSources.length, sources.length);
  assert.deepEqual(
    compileProcedureCorpus().map((procedure) => procedure.id),
    web.map((procedure) => procedure.id),
  );

  const sample = compiledFromSources.find((procedure) => procedure.id === "305_02");
  const webSample = web.find((procedure) => procedure.id === "305_02");
  assert.ok(sample);
  assert.ok(webSample);
  assert.equal("filePath" in sample, false);
  assert.equal("relativePath" in sample, false);
  assert.equal(sample.content, webSample.content);
  assert.deepEqual(sample.relations, webSample.relations);
  assert.deepEqual(sample.attachments, webSample.attachments);
});

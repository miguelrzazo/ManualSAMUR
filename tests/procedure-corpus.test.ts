import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { getAllProcedures } from "../lib/content.ts";
import { findProcedureCorpusViolations, readProcedureCorpus } from "../lib/procedure-corpus.ts";

const proceduresDir = path.join(process.cwd(), "content/procedures");
const manualSyncPath = path.join(process.cwd(), "content/data/manual-sync.json");

test("procedure corpus has unique IDs, matching filenames, and unique canonical slugs", () => {
  const records = readProcedureCorpus(proceduresDir);

  assert.ok(records.length > 0);
  assert.deepEqual(findProcedureCorpusViolations(records), []);
});

test("canonical procedures 123 and 501 resolve once in their expected sections", () => {
  const records = readProcedureCorpus(proceduresDir);
  const procedures = getAllProcedures();

  for (const [id, expectedSection] of [["123", "Comunicaciones"], ["501", "Psicológicos"]] as const) {
    const corpusMatches = records.filter((record) => record.id === id);
    assert.equal(corpusMatches.length, 1, `expected one corpus record for ${id}`);
    assert.equal(corpusMatches[0].section, expectedSection);

    const runtimeMatches = procedures.filter((procedure) => procedure.id === id);
    assert.equal(runtimeMatches.length, 1, `expected one runtime procedure for ${id}`);
    assert.equal(runtimeMatches[0].section, expectedSection);
  }
});

test("manual sync metadata does not point at removed duplicate procedure paths", () => {
  const manualSync = fs.readFileSync(manualSyncPath, "utf8");

  assert.doesNotMatch(manualSync, /content\/procedures\/general\/501\.md/);
  assert.doesNotMatch(manualSync, /content\/procedures\/tecnicas\/123\.md/);
});

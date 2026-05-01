import test from "node:test";
import assert from "node:assert/strict";

import {
  buildBacklinks,
  deriveRelatedIds,
  extractCodeFamily,
  normalizeCookieIds,
} from "../lib/manual-data.ts";

test("deriveRelatedIds keeps only existing local procedure ids from markdown links", () => {
  const ids = new Set(["104", "205", "309_02"]);
  const related = deriveRelatedIds(
    `
    Ver [uniformidad](104.htm), [informes](205.htm), [externo](https://foo.test/a),
    [otro](309_02.htm), [fantasma](999.htm), [repetido](104.htm)
    `,
    ids,
  );

  assert.deepEqual(related, ["104", "205", "309_02"]);
});

test("buildBacklinks derives incoming references from related edges", () => {
  const backlinks = buildBacklinks([
    { id: "201", related: ["205", "301"] },
    { id: "205", related: ["301"] },
    { id: "301", related: [] },
  ]);

  assert.deepEqual(backlinks, {
    "201": [],
    "205": ["201"],
    "301": ["201", "205"],
  });
});

test("extractCodeFamily groups alpha and numeric code schemes", () => {
  assert.equal(extractCodeFamily("PS.0.1"), "PS");
  assert.equal(extractCodeFamily("C.12.3"), "C");
  assert.equal(extractCodeFamily("6.1"), "6");
  assert.equal(extractCodeFamily("13"), "13");
});

test("normalizeCookieIds deduplicates, preserves valid order and caps list length", () => {
  assert.deepEqual(
    normalizeCookieIds('["301","205","301","999","201"]', new Set(["201", "205", "301"]), 3),
    ["301", "205", "201"],
  );

  assert.deepEqual(normalizeCookieIds("bad-json", new Set(["201"]), 3), []);
});

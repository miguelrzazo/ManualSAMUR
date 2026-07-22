import test from "node:test";
import assert from "node:assert/strict";

import {
  MOBILE_SNAPSHOT_SCHEMA,
  MOBILE_SNAPSHOT_VERSION,
  buildMobileContentSnapshot,
  contentHash,
  isMobileContentSnapshot,
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
});

test("v2 snapshots carry canonical relation, editorial, update and attachment data", () => {
  const snapshot = buildMobileContentSnapshot();
  const procedure = snapshot.content.procedures.find((item) => item.editorialBlocks.length > 0);

  assert.ok(procedure);
  assert.ok(Array.isArray(procedure.relations));
  assert.ok(Array.isArray(procedure.updates));
  assert.ok(procedure.attachments.every((attachment) => attachment.id && attachment.filename));
});

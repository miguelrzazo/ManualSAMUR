import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  canRecordRecent,
  parseSavedRouteKeys,
  pushRecentRouteKey,
  savedReferenceIndex,
  selectSavedReferences,
  serializeSavedRouteKeys,
  toggleSavedRouteKey,
} from "../apps/mobile/src/saved-logic.ts";
import type { MobileSnapshot } from "../apps/mobile/src/data/schema.ts";

const snapshot = JSON.parse(readFileSync(path.join(process.cwd(), "apps/mobile/src/data/snapshot.json"), "utf8")) as MobileSnapshot;
const content = snapshot.content;
const index = savedReferenceIndex(content);

test("saved identities cover procedures, medicines, codes, bases and hospitals", () => {
  const procedure = content.procedures[0];
  const drug = content.drugs[0];
  const code = [...index.values()].find((item) => item.kind === "code");
  const hospital = [...index.values()].find((item) => item.kind === "hospital");
  const base = [...index.values()].find((item) => item.kind === "base");
  assert.ok(index.has(`procedure:${procedure.id}`));
  assert.ok(drug && index.has(`vademecum:drug:${String(drug.id)}`));
  assert.ok(code);
  assert.ok(hospital);
  assert.ok(base);
  assert.equal(new Set(index.keys()).size, index.size);
});

test("legacy procedure-only storage migrates and duplicate routes remain stable", () => {
  assert.deepEqual(parseSavedRouteKeys(JSON.stringify(["301", "procedure:301", "301", "vademecum:drug:ABC"])), ["procedure:301", "vademecum:drug:ABC"]);
  assert.equal(serializeSavedRouteKeys(["301", "procedure:301"]), '["procedure:301"]');
  assert.deepEqual(toggleSavedRouteKey(["procedure:301"], "procedure:301"), []);
  assert.deepEqual(toggleSavedRouteKey([], "procedure:301"), ["procedure:301"]);
});

test("favorites preserve insertion order while recents move successful opens to the front", () => {
  assert.deepEqual(pushRecentRouteKey(["procedure:101", "vademecum:drug:A"], "procedure:101"), ["procedure:101", "vademecum:drug:A"]);
  assert.deepEqual(pushRecentRouteKey(["procedure:101", "vademecum:drug:A"], "vademecum:drug:A"), ["vademecum:drug:A", "procedure:101"]);
  assert.deepEqual(pushRecentRouteKey(["procedure:101"], "procedure:102", 1), ["procedure:102"]);
});

test("only resolvable detail routes qualify for recents; stale saved records remain visible", () => {
  const procedureKey = `procedure:${content.procedures[0].id}`;
  const code = [...index.values()].find((item) => item.kind === "code");
  const location = [...index.values()].find((item) => item.kind === "hospital");
  assert.equal(canRecordRecent(content, procedureKey), true);
  assert.equal(canRecordRecent(content, code?.routeKey ?? "code:missing"), Boolean(code));
  assert.equal(canRecordRecent(content, location?.routeKey ?? "location:hospital:missing"), Boolean(location));
  assert.equal(canRecordRecent(content, "procedure:not-in-this-package"), false);
  assert.equal(canRecordRecent(content, "vademecum:drug:not-in-this-package"), false);
  assert.equal(canRecordRecent(content, "location:hospital:not-in-this-package"), false);
  const selected = selectSavedReferences(content, [procedureKey, "vademecum:drug:not-in-this-package"]);
  assert.equal(selected[0].kind, "procedure");
  assert.equal(selected[1].kind, "stale");
  assert.equal(selected[1].stale, true);
});


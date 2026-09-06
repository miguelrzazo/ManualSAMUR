import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  canRecordRecent,
  MAX_RECENT_QUERIES,
  parseRecentQueries,
  parseSavedRouteKeys,
  pushRecentQuery,
  removeRecentQuery,
  pushRecentRouteKey,
  savedReferenceIndex,
  selectProcedureReferences,
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


test("recent queries dedupe by fingerprint, keep what the user typed, and drop keystrokes", () => {
  // Accent- and case-insensitive dedupe, because nobody means two different things by
  // "vía aérea" and "via aerea" — but the stored string is the one actually typed.
  const afterFirst = pushRecentQuery([], "Vía aérea");
  assert.deepEqual(afterFirst, ["Vía aérea"]);
  const afterRepeat = pushRecentQuery(["intubación", "Vía aérea"], "via aerea");
  assert.deepEqual(afterRepeat, ["via aerea", "intubación"], "a repeat moves to the front, it does not duplicate");

  // One or two characters is a keystroke on the way somewhere, not a search.
  assert.deepEqual(pushRecentQuery(["pcr"], "vi"), ["pcr"]);
  assert.deepEqual(pushRecentQuery(["pcr"], "   "), ["pcr"]);
  assert.deepEqual(pushRecentQuery([], " sca   grave "), ["sca grave"], "whitespace is collapsed, not preserved");

  // Most recent first, bounded.
  let queries: string[] = [];
  for (let index = 0; index < MAX_RECENT_QUERIES + 4; index += 1) queries = pushRecentQuery(queries, `consulta ${index}`);
  assert.equal(queries.length, MAX_RECENT_QUERIES);
  assert.equal(queries[0], `consulta ${MAX_RECENT_QUERIES + 3}`);

  assert.deepEqual(removeRecentQuery(["Vía aérea", "pcr"], "VIA AEREA"), ["pcr"]);
});

test("recent queries survive a bad or missing storage payload without throwing", () => {
  assert.deepEqual(parseRecentQueries(null), []);
  assert.deepEqual(parseRecentQueries("not json"), []);
  assert.deepEqual(parseRecentQueries('{"nope":1}'), []);
  assert.deepEqual(parseRecentQueries('["pcr", 7, null, "pcr", "sca"]'), ["pcr", "sca"]);
});

test("selectProcedureReferences keeps the Inicio card on procedures while storage stays cross-domain", () => {
  const procedureKey = `procedure:${content.procedures[0].id}`;
  const drugKey = [...index.keys()].find((key) => key.startsWith("vademecum:drug:"))!;
  const codeKey = [...index.keys()].find((key) => key.startsWith("code:"))!;
  const mixed = [drugKey, procedureKey, codeKey, "procedure:no-existe"];

  const procedures = selectProcedureReferences(content, mixed);
  assert.deepEqual(procedures.map((reference) => reference.routeKey), [procedureKey]);
  assert.ok(procedures.every((reference) => reference.kind === "procedure"));

  // The store itself is untouched: Guardados still resolves every domain.
  assert.equal(selectSavedReferences(content, mixed).length, 4);
  assert.equal(pushRecentRouteKey([procedureKey], drugKey)[0], drugKey);
});

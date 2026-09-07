import test from "node:test";
import assert from "node:assert/strict";
import { diffReferenceDataset, parsePathologyCodes, reconcileCodeRecords } from "../lib/reference-dataset-sync.ts";
import { mergeImportedDrugs, type DrugRecord } from "../lib/vademecum-sync.ts";

test("pathology imports preserve wrapped source text and reject broken or duplicate tables", () => {
  const fixture = "ICAO Alfa\n" + Array.from({ length: 20 }, (_, i) => `A.1.${i} Definición ${i}\ncontinuación`).join("\n");
  const rows = parsePathologyCodes(fixture);
  assert.equal(rows.length, 20);
  assert.deepEqual(rows[0], { code: "A.1.0", name: "Definición 0 continuación", category: "Alfa" });
  assert.throws(() => parsePathologyCodes("Service unavailable"), /Unrecognized/);
  assert.throws(() => parsePathologyCodes(fixture + "\nA.1.0 Duplicado"), /Duplicate/);
});

test("code reconciliation handles additions, updates and limited withdrawals without losing taxonomy", () => {
  const before = Array.from({ length: 10 }, (_, i) => ({ code: `A.1.${i}`, name: `Nombre ${i}`, category: "Editorial" }));
  const imported = before.slice(1).map((row) => ({ ...row, category: "Fuente" }));
  imported[0] = { ...imported[0], name: "Texto actualizado" };
  imported.push({ code: "A.2.0", name: "Nuevo", category: "Fuente" });
  const result = reconcileCodeRecords(before, imported);
  assert.equal(result.find((row) => row.code === "A.1.1")?.name, "Texto actualizado");
  assert.equal(result.find((row) => row.code === "A.1.1")?.category, "Editorial");
  assert.equal(result.some((row) => row.code === "A.1.0"), false);
  assert.deepEqual(reconcileCodeRecords(result, result), result);
  assert.throws(() => reconcileCodeRecords(before, imported.slice(0, 2)), /bajas masivas/);
  assert.throws(() => reconcileCodeRecords(before, imported.map((row, i) => ({ ...row, code: `B.1.${i}` }))), /bajas masivas/);
});

test("reference history emits only real record changes with readable before/after diffs", () => {
  const before = Array.from({ length: 10 }, (_, i) => ({ id: String(i), name: `Nombre ${i}` }));
  const after = before.slice(1).map((row) => ({ ...row }));
  after[0].name = "Actualizado";
  after.push({ id: "10", name: "Nuevo" });
  const changes = diffReferenceDataset(before, after, "drug");
  assert.deepEqual(changes.map((row) => row.changeKind).sort(), ["actualizado", "eliminado", "nuevo"]);
  const update = changes.find((row) => row.changeKind === "actualizado")!;
  assert.equal(update.routeKey, "vademecum:drug:1");
  assert.match(update.diff, /-.*Nombre 1/);
  assert.match(update.diff, /\+.*Actualizado/);
  assert.deepEqual(diffReferenceDataset(after, after, "drug"), []);
  assert.throws(() => diffReferenceDataset(before, [], "drug"), /bajas masivas/);
  assert.throws(() => diffReferenceDataset([], [{ name: "No ID" }], "drug"), /Invalid/);
});

test("vademecum removes only records previously confirmed as source-managed", () => {
  const record = (id: string): DrugRecord => ({ id, name: id, synonyms: [], category: "Otros", subcategory: "", presentation: "", indication: "", dose: "", route: [], contraindications: "" });
  const result = mergeImportedDrugs([record("retirado"), record("editorial")], [], ["retirado"]);
  assert.deepEqual(result.map((row) => row.id), ["editorial"]);
});

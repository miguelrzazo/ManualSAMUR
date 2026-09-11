import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { parseMedicationDose } from "../packages/manual-content/src/index.ts";

const root = process.cwd();

test("the shared medication dose model keeps web and mobile audience grouping aligned", () => {
  const sections = parseMedicationDose("- Adultos:\n1 mg iv\n- Niños:\n0,1 mg/kg");
  assert.deepEqual(sections.map((section) => section.label), ["Adultos", "Niños"]);
  assert.deepEqual(sections.map((section) => section.lines.map((line) => line.text)), [["1 mg iv"], ["0,1 mg/kg"]]);
});

test("the web medication dialog exposes the new hierarchy and safety panels", () => {
  const source = readFileSync(path.join(root, "components/vademecum/VademecumView.tsx"), "utf8");
  assert.match(source, /Vías de administración/);
  assert.match(source, /parseMedicationDose/);
  assert.match(source, /function DoseSection/);
  assert.match(source, /function SafetyRow/);
  assert.match(source, /Seguridad/);
  assert.match(source, /Contraindicaciones/);
  assert.match(source, /Efectos secundarios/);
  assert.doesNotMatch(source, /Dosis publicada/);
  assert.doesNotMatch(source, /Presentación publicada/);
});

test("the native medication detail exposes all imported safety fields", () => {
  const source = readFileSync(path.join(root, "apps/mobile/App.tsx"), "utf8");
  assert.match(source, /DRUG_SAFETY_FIELDS/);
  assert.match(source, /MedicationDoseSectionView/);
  assert.match(source, /Seguridad/);
  assert.match(source, /Vías de administración/);
  assert.doesNotMatch(source, /Dosis publicada/);
  assert.doesNotMatch(source, /Presentación publicada/);
});

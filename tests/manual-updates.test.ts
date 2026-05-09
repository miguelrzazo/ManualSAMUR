import test from "node:test";
import assert from "node:assert/strict";

import {
  parseOfficialPdfUpdateText,
  resolveProcedureIdsFromSummary,
} from "../lib/manual-updates.ts";

test("parseOfficialPdfUpdateText extracts manual version and change entries", () => {
  const parsed = parseOfficialPdfUpdateText(`
Manual de Procedimientos 2026 versión 1.0 – de abril 2026.
• Actualización: Procedimientos asistenciales/ Procedimientos SVB/ Valoración de la escena
• Revisión: Procedimientos Asistenciales, SVA: Parada Cardiorrespiratoria
`);

  assert.equal(parsed.manualVersionCurrent, "abril 2026 v1.0");
  assert.equal(parsed.entries.length, 2);
  assert.equal(parsed.entries[0]?.changeKind, "actualizado");
  assert.equal(parsed.entries[1]?.changeKind, "revisado");
});

test("resolveProcedureIdsFromSummary uses explicit ids and stable title mapping", () => {
  const ids = resolveProcedureIdsFromSummary(
    "Actualización: Técnicas/ Vasculares/ Canalización de vías venosas periféricas 604_02",
    [{ id: "604_02", title: "Canalización de vías venosas periféricas", normalizedTitle: "canalizacion de vias venosas perifericas" }],
  );

  assert.deepEqual(ids, ["604_02"]);
});

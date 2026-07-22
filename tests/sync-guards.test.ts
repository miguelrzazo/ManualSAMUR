import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_DELETION_RATIO,
  DiscoveryImplausibleError,
  assertDiscoveryIsPlausible,
  checkDiscoveryPlausibility,
} from "../lib/sync-guards.ts";
import { parseProcedureSpacesXml } from "../lib/manual-sync.ts";

test("checkDiscoveryPlausibility permite el primer sync con corpus local vacío", () => {
  assert.equal(checkDiscoveryPlausibility(0, 0, 0).ok, true);
  assert.equal(checkDiscoveryPlausibility(234, 0, 0).ok, true);
});

test("checkDiscoveryPlausibility permite bajas sueltas", () => {
  // 2 de 234 desaparecidos: un borrado editorial normal.
  const result = checkDiscoveryPlausibility(232, 234, 2);
  assert.equal(result.ok, true);
});

test("checkDiscoveryPlausibility rechaza un descubrimiento vacío habiendo corpus local", () => {
  const result = checkDiscoveryPlausibility(0, 234, 234);
  assert.equal(result.ok, false);
  assert.match(result.reason ?? "", /no devolvió ningún procedimiento/);
});

test("checkDiscoveryPlausibility rechaza superar la proporción máxima de bajas", () => {
  // 50 de 234 es un 21,4%, justo por encima del 20%.
  const result = checkDiscoveryPlausibility(184, 234, 50);
  assert.equal(result.ok, false);
  assert.match(result.reason ?? "", /por encima del 20%/);
});

test("checkDiscoveryPlausibility acepta justo en el límite de la proporción", () => {
  const existing = 100;
  const missing = existing * MAX_DELETION_RATIO; // exactamente el 20%
  assert.equal(checkDiscoveryPlausibility(80, existing, missing).ok, true);
});

test("assertDiscoveryIsPlausible lanza DiscoveryImplausibleError al abortar", () => {
  assert.throws(
    () => assertDiscoveryIsPlausible(0, 234, 234),
    (error: unknown) => error instanceof DiscoveryImplausibleError,
  );
  // El camino correcto no debe lanzar.
  assert.doesNotThrow(() => assertDiscoveryIsPlausible(232, 234, 2));
});

// ─── El escenario real que motiva el suelo ────────────────────────────────────

test("parseProcedureSpacesXml devuelve [] ante entradas no-XML", () => {
  // Los tres 200 plausibles que puede servir el wiki en lugar del XML esperado.
  assert.deepEqual(parseProcedureSpacesXml(""), []);
  assert.deepEqual(parseProcedureSpacesXml("<html><body>Mantenimiento</body></html>"), []);
  assert.deepEqual(parseProcedureSpacesXml("<html><form id=\"login\"></form></html>"), []);
  assert.deepEqual(parseProcedureSpacesXml("{\"error\":\"not found\"}"), []);
});

test("un descubrimiento vacío no puede cascar en borrado masivo", () => {
  // Reproduce la cadena completa: el wiki devuelve una página de mantenimiento,
  // el parser da [], y todos los procedimientos locales quedarían "eliminado".
  const spaces = parseProcedureSpacesXml("<html><body>503 Service Unavailable</body></html>");
  assert.equal(spaces.length, 0);

  const existingCount = 234;
  const missingCount = existingCount - spaces.length;

  assert.throws(
    () => assertDiscoveryIsPlausible(spaces.length, existingCount, missingCount),
    DiscoveryImplausibleError,
    "Un descubrimiento vacío debe abortar el sync, no emitir 234 eventos 'eliminado'",
  );
});

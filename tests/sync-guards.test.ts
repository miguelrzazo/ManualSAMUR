import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_DELETION_RATIO,
  DiscoveryImplausibleError,
  assertDiscoveryIsPlausible,
  checkDiscoveryPlausibility,
  isDeletionCandidate,
  assertDatasetNotEmptied,
  DatasetEmptiedError,
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

// ─── Quién puede darse de baja ────────────────────────────────────────────────

test("solo son candidatos a baja los procedimientos sincronizados del wiki", () => {
  const HOST = "servpub.madrid.es";
  const wiki = `https://${HOST}/manualsamur/bin/view/Tecnicas/Algo`;

  // Caso normal: viene del wiki y se sincronizó de él.
  assert.equal(isDeletionCandidate(wiki, "abc123", HOST), true);

  // Importado de otra fuente: el scraper del wiki no lo descubre nunca, así que
  // su ausencia no significa que lo hayan retirado.
  assert.equal(isDeletionCandidate("https://www.samurpc.net/data/218.htm", "abc123", HOST), false);

  // Del wiki pero nunca sincronizado (source truncado, sin hash): no hay
  // constancia de que llegara a existir ahí.
  assert.equal(isDeletionCandidate(wiki, "", HOST), false);
  assert.equal(isDeletionCandidate(wiki, "   ", HOST), false);

  // Sin origen declarado.
  assert.equal(isDeletionCandidate("", "abc123", HOST), false);
});

test("el filtro de bajas reproduce el resultado de la primera ejecucion real", () => {
  const HOST = "servpub.madrid.es";
  const wiki = `https://${HOST}/manualsamur/bin/view/x`;
  const externo = "https://www.samurpc.net/data/x.htm";

  // Los 11 que marcó la primera ejecución, con su origen y hash reales.
  const marcados = [
    { id: "101", source: wiki, hash: "" },        // wiki, nunca sincronizado
    { id: "102", source: wiki, hash: "" },        // wiki, nunca sincronizado
    { id: "205b", source: wiki, hash: "f11ce09" },   // baja real (404 en origen)
    { id: "214d", source: externo, hash: "" },
    { id: "216c", source: externo, hash: "" },
    { id: "216d", source: externo, hash: "" },
    { id: "218", source: externo, hash: "" },
    { id: "309_06", source: externo, hash: "" },
    { id: "601_04", source: externo, hash: "" },
    { id: "602_05", source: wiki, hash: "494c928" },  // baja real (404 en origen)
    { id: "604_05", source: externo, hash: "" },
  ];

  const candidatos = marcados
    .filter((p) => isDeletionCandidate(p.source, p.hash, HOST))
    .map((p) => p.id);

  assert.deepEqual(candidatos, ["205b", "602_05"], "Solo deben quedar las dos bajas verificadas");
});

// ─── Vaciado silencioso de datasets ───────────────────────────────────────────

test("un parseo vacio sobre un dataset con datos aborta", () => {
  // El caso real: el wiki cambio <h1> por <h3>, el parser devolvio [] y se
  // sobrescribieron 22 secciones de abreviaturas con un fichero vacio.
  assert.throws(
    () => assertDatasetNotEmptied("abreviaturas", 0, 22, 83161),
    DatasetEmptiedError,
  );
});

test("un parseo vacio es aceptable si no habia nada o la pagina vino vacia", () => {
  // Primer sync: no hay nada que proteger.
  assert.doesNotThrow(() => assertDatasetNotEmptied("abreviaturas", 0, 0, 83161));
  // Respuesta vacia o error de red: no es culpa del parser.
  assert.doesNotThrow(() => assertDatasetNotEmptied("abreviaturas", 0, 22, 10));
  // Y si extrajo algo, no hay nada que comprobar.
  assert.doesNotThrow(() => assertDatasetNotEmptied("abreviaturas", 22, 22, 83161));
});

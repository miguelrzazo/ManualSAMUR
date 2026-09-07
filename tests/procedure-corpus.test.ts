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

/**
 * El estándar de identificador vive en tres sitios que tienen que decir lo mismo:
 * el regex del corpus, el nombre de los ficheros y la tabla que el sync mensual
 * usa para asignar id a una página del wiki (`STABLE_PROCEDURE_IDS`).
 *
 * Este caso existe por el tercero. Si la tabla se queda con un id antiguo, nada
 * falla aquí y todo parece bien: el fallo aparece el día 1 del mes siguiente,
 * cuando el sync recrea la ficha con su identificador viejo y el corpus se
 * duplica. Es el único punto del renombrado que no se puede verificar mirando
 * el repositorio.
 */
test("every id the monthly sync can assign matches the standard and exists in the corpus", async () => {
  const { STABLE_PROCEDURE_IDS_FOR_TESTS } = await import("../lib/manual-sync.ts");
  const ids = new Set(readProcedureCorpus(proceduresDir).map((record) => record.id));
  const standard = /^\d{3}(_\d{2})?$/;

  const assignable = Object.entries(STABLE_PROCEDURE_IDS_FOR_TESTS);
  assert.ok(assignable.length > 0, "the sync must have a title → id table");

  const offStandard = assignable.filter(([, id]) => !standard.test(id));
  assert.deepEqual(offStandard, [], "these titles would be assigned an id the corpus validator rejects");

  const dangling = assignable.filter(([, id]) => !ids.has(id));
  assert.deepEqual(dangling, [], "these titles point at an id no procedure file carries");
});

/**
 * Dos fichas para la misma página del wiki.
 *
 * Así se duplicó el corpus sin que saltara nada: 218 y 217_00 eran el mismo
 * procedimiento, y 309_06 duplicaba a 309_02c. El caso comprueba las dos mitades
 * de la condición, porque cada una por su cuenta da falsos positivos reales.
 */
test("dos fichas de la misma pagina del wiki con el mismo titulo son un duplicado", () => {
  const base = { filePath: "x", sectionDirectory: "operativos", section: "Operativos", body: "", slug: "s" };
  const url = "https://servpub.madrid.es/manualsamur/bin/view/Procedimientos%20Operativos/Disturbios/";

  const duplicates = findProcedureCorpusViolations([
    { ...base, relativePath: "operativos/217_00.md", filenameStem: "217_00", id: "217_00", slug: "217_00-a", title: "Disturbios urbanos y Actos antisociales", source: url },
    { ...base, relativePath: "operativos/218.md", filenameStem: "218", id: "218", slug: "218-b", title: "Disturbios urbanos y actos antisociales", source: url },
  ]);
  assert.equal(duplicates.length, 2, "las dos fichas del par tienen que quedar señaladas");

  // Misma URL, títulos distintos: 101 y 102 comparten la URL de su sección.
  // Mismo título, URLs distintas: la valoración del politraumatizado existe en SVA y en SVB.
  const legitimate = findProcedureCorpusViolations([
    { ...base, relativePath: "a/101.md", filenameStem: "101", id: "101", slug: "101-a", title: "Organigrama Operativo", source: "https://servpub.madrid.es/x/" },
    { ...base, relativePath: "a/102.md", filenameStem: "102", id: "102", slug: "102-b", title: "Organigrama Administrativo", source: "https://servpub.madrid.es/x/" },
    { ...base, relativePath: "a/304_01.md", filenameStem: "304_01", id: "304_01", slug: "304_01-c", title: "Valoración inicial del paciente politraumatizado", source: "https://servpub.madrid.es/sva/" },
    { ...base, relativePath: "a/412_00.md", filenameStem: "412_00", id: "412_00", slug: "412_00-d", title: "Valoración inicial del paciente politraumatizado", source: "https://servpub.madrid.es/svb/" },
  ]);
  assert.deepEqual(legitimate, [], "estos pares son distintos de verdad y no deben saltar");
});

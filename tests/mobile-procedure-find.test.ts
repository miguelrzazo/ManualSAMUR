import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  findProcedureMatches,
  formatMatchCounter,
  isFindableQuery,
  stepMatchIndex,
} from "../apps/mobile/src/procedure-find-logic.ts";
import { splitMarkdownBlocks, splitProcedureSections } from "../apps/mobile/src/procedure-logic.ts";
import { countMatches, highlightSegments } from "../apps/mobile/src/search-snippet-logic.ts";
import type { MobileProcedure } from "../apps/mobile/src/data/schema.ts";

const appRoot = path.join(process.cwd(), "apps", "mobile");
const snapshot = JSON.parse(readFileSync(path.join(appRoot, "src/data/snapshot.json"), "utf8")) as {
  content: { procedures: MobileProcedure[] };
};

test("finding inside a procedure matches the rendered text, not the raw markdown", () => {
  const markdown = [
    "## Valoración inicial",
    "",
    "Comprueba la [vía aérea](/manual/301) antes de nada.",
    "",
    "![](/images/procedures/301/via-aerea.jpg)",
    "",
    "- Administra **oxígeno** a alto flujo",
  ].join("\n");
  const sections = splitProcedureSections(markdown);

  // El destino de un enlace no es texto visible: buscar "manual" no puede dar un
  // resultado que el lector no verá al saltar a él.
  assert.equal(findProcedureMatches(sections, "manual").length, 0);
  // La ruta de la imagen tampoco.
  assert.equal(findProcedureMatches(sections, "jpg").length, 0);

  // La etiqueta del enlace sí, porque es lo que se dibuja.
  const viaAerea = findProcedureMatches(sections, "vía aérea");
  assert.equal(viaAerea.length, 1);
  assert.match(viaAerea[0].text, /vía aérea/);

  // Sin acentos y sin mayúsculas encuentra lo mismo.
  assert.equal(findProcedureMatches(sections, "VIA AEREA").length, 1);

  // El asterisco de la negrita no cuenta como parte de la palabra.
  assert.equal(findProcedureMatches(sections, "oxígeno").length, 1);
});

test("a match in a section heading is reachable", () => {
  const sections = splitProcedureSections("## Contraindicaciones\n\nNinguna descrita.");
  const matches = findProcedureMatches(sections, "contraindicaciones");
  assert.equal(matches.length, 1);
  assert.equal(matches[0].blockKey, sections[0].key);
});

test("match block keys are the same keys MarkdownContent renders with", () => {
  // Si no coincidieran, la coincidencia se contaría en la barra y el salto no
  // encontraría el desplazamiento registrado: un contador que no lleva a ningún sitio.
  const source = readFileSync(path.join(appRoot, "App.tsx"), "utf8");
  assert.match(source, /const key = `\$\{section\.key\}-table-\$\{block\.startIndex\}`/);
  assert.match(source, /const key = `\$\{section\.key\}-\$\{block\.index\}`/);

  const markdown = "## Dosis\n\n| Fármaco | Dosis |\n| --- | --- |\n| Adrenalina | 1 mg |\n\nRepetir cada 3 minutos.";
  const sections = splitProcedureSections(markdown);
  const blocks = splitMarkdownBlocks(sections[0].lines);
  const table = blocks.find((block) => block.kind === "table");
  assert.ok(table && table.kind === "table");

  const tableMatch = findProcedureMatches(sections, "adrenalina");
  assert.equal(tableMatch.length, 1);
  assert.equal(tableMatch[0].blockKey, `${sections[0].key}-table-${table.startIndex}`);

  const lineMatch = findProcedureMatches(sections, "repetir");
  assert.equal(lineMatch.length, 1);
  const line = blocks.find((block) => block.kind === "line" && block.line.includes("Repetir"));
  assert.ok(line && line.kind === "line");
  assert.equal(lineMatch[0].blockKey, `${sections[0].key}-${line.index}`);
});

test("a one-letter query finds nothing rather than everything", () => {
  const sections = splitProcedureSections("## A\n\nUn texto cualquiera.");
  assert.equal(isFindableQuery("a"), false);
  assert.equal(isFindableQuery(""), false);
  assert.equal(isFindableQuery("un"), true);
  assert.equal(findProcedureMatches(sections, "a").length, 0);
});

test("highlighting marks every occurrence in place without excerpting", () => {
  const segments = highlightSegments("Vía aérea y vía venosa", "via");
  assert.equal(segments.map((segment) => segment.text).join(""), "Vía aérea y vía venosa");
  assert.deepEqual(segments.filter((segment) => segment.match).map((segment) => segment.text), ["Vía", "vía"]);
  assert.equal(countMatches("Vía aérea y vía venosa", "via"), 2);

  // Sin coincidencia devuelve el texto entero en un solo tramo, para que quien lo
  // dibuja no tenga que distinguir el caso.
  assert.deepEqual(highlightSegments("Sin nada", "zzz"), [{ text: "Sin nada", match: false }]);
});

test("stepping through matches wraps at both ends", () => {
  assert.equal(stepMatchIndex(0, 3, 1), 1);
  assert.equal(stepMatchIndex(2, 3, 1), 0);
  assert.equal(stepMatchIndex(0, 3, -1), 2);
  // Sin resultados no hay índice que mover.
  assert.equal(stepMatchIndex(0, 0, 1), 0);

  assert.equal(formatMatchCounter(0, 3), "1 de 3");
  assert.equal(formatMatchCounter(0, 0), "0 de 0");
});

test("finding works against a real procedure from the packaged snapshot", () => {
  const procedure = snapshot.content.procedures.find((candidate) => candidate.content.includes("|"));
  assert.ok(procedure, "el paquete debe traer algún procedimiento con tabla");
  const sections = splitProcedureSections(procedure.content);
  const matches = findProcedureMatches(sections, "paciente");
  // No se afirma un número: el corpus cambia cada mes. Sí que cada coincidencia
  // apunta a una sección que existe.
  const sectionKeys = new Set(sections.map((section) => section.key));
  for (const match of matches) assert.ok(sectionKeys.has(match.sectionKey), `sección desconocida: ${match.sectionKey}`);
});

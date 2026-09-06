import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  classifyMarkdownRows,
  createReadingPositionStore,
  parseMarkdownTableAt,
  procedureHeadings,
  procedureRouteKey,
  resolveProcedureReference,
  searchProcedures,
  splitMarkdownBlocks,
  splitProcedureSections,
} from "../apps/mobile/src/procedure-logic.ts";
import { buildSearchSnippet, readableSnippetSource, snippetText } from "../apps/mobile/src/search-snippet-logic.ts";
import type { MobileProcedure } from "../apps/mobile/src/data/schema.ts";

const snapshot = JSON.parse(readFileSync(path.join(process.cwd(), "apps/mobile/src/data/snapshot.json"), "utf8")) as {
  content: { procedures: MobileProcedure[] };
};

test("offline procedure lookup ranks exact identifier/title before synonym and content matches", () => {
  const fixture = (value: Pick<MobileProcedure, "id" | "title" | "synonyms" | "searchText" | "tags" | "content">): MobileProcedure => ({
    ...value,
    section: "Operativos",
    slug: `${value.id}-fixture`,
    routeKey: `procedure:${value.id}`,
    related: [],
    backlinks: [],
    relations: [],
    editorialBlocks: [],
    updates: [],
    updated: "",
    sourceUpdated: "",
    attachments: [],
  });
  const procedures = [
    fixture({ id: "301", title: "Parada cardiorrespiratoria", synonyms: ["RCP"], searchText: "reanimación", tags: [], content: "" }),
    fixture({ id: "301a", title: "Cuidados postparada", synonyms: [], searchText: "parada cardiorrespiratoria", tags: [], content: "" }),
  ];

  assert.equal(searchProcedures(procedures, "301")[0]?.procedure.id, "301");
  assert.equal(searchProcedures(procedures, "Parada cardiorrespiratoria")[0]?.procedure.id, "301");
  assert.equal(searchProcedures(procedures, "RCP")[0]?.procedure.id, "301");
  assert.equal(searchProcedures(procedures, "reanimación")[0]?.procedure.id, "301");
  assert.equal(searchProcedures(procedures, "301")[0]?.rank, 0);
});

test("known procedures resolve by canonical route, id, or slug while malformed references stay unavailable", () => {
  const procedure = snapshot.content.procedures.find((item) => item.id === "301");
  assert.ok(procedure);
  assert.equal(procedureRouteKey(procedure), "procedure:301");
  assert.equal(resolveProcedureReference(snapshot.content.procedures, "301")?.title, procedure.title);
  assert.equal(resolveProcedureReference(snapshot.content.procedures, procedure.slug)?.id, "301");
  assert.equal(resolveProcedureReference(snapshot.content.procedures, "procedure:301")?.id, "301");
  assert.equal(resolveProcedureReference(snapshot.content.procedures, "not-a-procedure"), undefined);
});

test("procedure reading preserves complete section order and stable duplicate-safe anchors", () => {
  const markdown = "Introducción\n\n## Evaluación inicial\nPrimero\n### Signos\nSegundo\n## Evaluación inicial\nTercero";
  const sections = splitProcedureSections(markdown);
  assert.deepEqual(sections.map((section) => section.heading?.text), [undefined, "Evaluación inicial", "Signos", "Evaluación inicial"]);
  assert.deepEqual(procedureHeadings(markdown).map((heading) => heading.id), ["evaluacion-inicial", "signos", "evaluacion-inicial-2"]);
  assert.equal(sections.flatMap((section) => section.lines).join("\n").includes("Tercero"), true);
});

test("reading position is retained by stable procedure route across Back", () => {
  const positions = createReadingPositionStore();
  positions.set("procedure:301", 428);
  assert.equal(positions.get("procedure:301"), 428);
  assert.equal(positions.get("procedure:missing"), 0);
});

test("malformed local references do not crash lookup and remain unavailable", () => {
  const malformed = { id: "999", title: "Broken", synonyms: undefined } as unknown as MobileProcedure;
  assert.deepEqual(searchProcedures([malformed], "broken"), []);
  assert.equal(resolveProcedureReference([malformed], "999"), undefined);
});

test("classifyMarkdownRows numbers ordered items itself instead of trusting the source marker", () => {
  const rows = classifyMarkdownRows([
    "1. Primer paso.",
    "1. Segundo paso.",
    "1. Tercer paso.",
    "11. Cuarto paso.",
  ]);

  assert.deepEqual(rows, [
    { kind: "ordered", ordinal: 1 },
    { kind: "ordered", ordinal: 2 },
    { kind: "ordered", ordinal: 3 },
    { kind: "ordered", ordinal: 4 },
  ]);
});

test("classifyMarkdownRows keeps loose lists numbered and restarts after a paragraph", () => {
  const rows = classifyMarkdownRows([
    "1. Primer paso.",
    "",
    "1. Segundo paso.",
    "Un parrafo intermedio.",
    "1. Nueva lista.",
  ]);

  assert.deepEqual(rows.map((row) => (row.kind === "ordered" ? row.ordinal : row.kind)), [1, "skip", 2, "text", 1]);
});

test("classifyMarkdownRows separates bullets from ordered items", () => {
  const rows = classifyMarkdownRows(["* Una vinieta.", "1. Un paso.", "### Encabezado", "1. Otro paso."]);
  assert.deepEqual(rows.map((row) => (row.kind === "ordered" ? row.ordinal : row.kind)), ["bullet", 1, "skip", 1]);
});

test("parseMarkdownTableAt preserves empty, multiline, and escaped-pipe cells", () => {
  const parsed = parseMarkdownTableAt(["**Criterio** | **Resultado** | **Puntuación**", "| :--- | ---: | --- |", "| Edad | >65 | |", "| Signos | <br />• Convulsiones<br />• Déficit | 1\\|2 |", "", "Texto posterior"], 0);
  assert.deepEqual(parsed, { table: { headers: ["**Criterio**", "**Resultado**", "**Puntuación**"], rows: [["Edad", ">65", ""], ["Signos", "<br />• Convulsiones<br />• Déficit", "1|2"]] }, nextIndex: 4 });
});

test("parseMarkdownTableAt supports the bundled legacy pipe-table shape", () => {
  const parsed = parseMarkdownTableAt(["|**Edad**|**TAS**|**TAM**", "|50-69|> 100 mmHg|>80 mmHg", "|15-49|> 110 mmHg|85 mmHg", "", "Texto posterior"], 0);
  assert.deepEqual(parsed, { table: { headers: ["**Edad**", "**TAS**", "**TAM**"], rows: [["50-69", "> 100 mmHg", ">80 mmHg"], ["15-49", "> 110 mmHg", "85 mmHg"]] }, nextIndex: 3 });
});

test("parseMarkdownTableAt keeps non-pipe continuation lines in the active cell", () => {
  const parsed = parseMarkdownTableAt(["|Criterio|Resultado", "|Edad|Mayor de 65", "años", "|Signos|Convulsiones", "", "Texto posterior"], 0);
  assert.deepEqual(parsed, { table: { headers: ["Criterio", "Resultado"], rows: [["Edad", "Mayor de 65\naños"], ["Signos", "Convulsiones"]] }, nextIndex: 4 });
});

test("splitMarkdownBlocks emits tables in document order and restarts list numbering", () => {
  const blocks = splitMarkdownBlocks(["1. Primer paso.", "| Criterio | Valor |", "| --- | --- |", "| Edad | >65 |", "1. Segundo paso."]);
  assert.deepEqual(blocks.map((block) => block.kind === "table" ? "table" : block.row.kind === "ordered" ? `ordered-${block.row.ordinal}` : block.row.kind), ["ordered-1", "table", "ordered-1"]);
});

test("all bundled table-bearing procedures produce a native table block", () => {
  const tableProcedures = ["304_02", "410a", "214f", "314_06", "309_02b"];
  for (const id of tableProcedures) {
    const procedure = snapshot.content.procedures.find((item) => item.id === id);
    assert.ok(procedure, `missing fixture procedure ${id}`);
    assert.ok(splitProcedureSections(procedure.content).some((section) => splitMarkdownBlocks(section.lines).some((block) => block.kind === "table")), `no table block for ${id}`);
  }
});

// ─── Full-text search snippets ──────────────────────────────────────────────

test("a body match is explained with the sentence it was found in", () => {
  const snippet = buildSearchSnippet(
    "Ante un accidente de tráfico, valore la escena. En el atropello de más de tres víctimas active el operativo de múltiples víctimas y comunique por TETRA.",
    "atropello",
  );
  assert.ok(snippet, "a body match must produce an excerpt");
  const text = snippetText(snippet);
  assert.match(text, /atropello/);
  assert.deepEqual(snippet.segments.filter((segment) => segment.match).map((segment) => segment.text), ["atropello"]);
  // Context on both sides, and ellipses where the excerpt was cut.
  assert.match(text, /^…/);
  assert.match(text, /…$/);
});

test("the excerpt is accent- and case-insensitive, and marks every occurrence in view", () => {
  const snippet = buildSearchSnippet("Valoración de la Vía aérea. Mantenga la via aérea permeable en todo momento.", "via");
  assert.ok(snippet);
  const matched = snippet.segments.filter((segment) => segment.match).map((segment) => segment.text);
  // The original casing and accents are preserved in what is shown.
  assert.deepEqual(matched, ["Vía", "via"]);
});

test("an excerpt never cuts a word in half", () => {
  const snippet = buildSearchSnippet(`${"palabra ".repeat(40)}atropello ${"otra ".repeat(40)}`, "atropello");
  assert.ok(snippet);
  const text = snippetText(snippet).replace(/^…|…$/g, "").trim();
  for (const word of text.split(/\s+/)) {
    assert.ok(["palabra", "atropello", "otra"].includes(word), `truncated word: ${word}`);
  }
});

test("markdown line breaks and table pipes collapse instead of shredding the excerpt", () => {
  const snippet = buildSearchSnippet("| Edad |\n| --- |\n\nEl   atropello\nleve", "atropello");
  assert.ok(snippet);
  assert.doesNotMatch(snippetText(snippet), /\n/);
  assert.doesNotMatch(snippetText(snippet), /  /);
});

test("table scaffolding is flattened before the excerpt is cut, not left in it", () => {
  // The real shape this was written for: an excerpt from a code table read
  // "…víctimas confirmadas | | 1.4 | Atropello | | 1.5 | Accidente…".
  const table = "## Códigos\n\n| Código | Nombre |\n| --- | --- |\n| 1.3 | Accidente con más de 3 víctimas confirmadas |\n| 1.4 | Atropello |\n| 1.5 | Accidente de motocicleta |\n";
  const readable = readableSnippetSource(table);
  assert.doesNotMatch(readable, /\|/);
  assert.doesNotMatch(readable, /---/);
  assert.doesNotMatch(readable, /· ·/, "empty cells must not stack up separators");
  assert.match(readable, /1\.4 · Atropello · 1\.5/);

  const snippet = buildSearchSnippet(readable, "atropello");
  assert.ok(snippet);
  assert.doesNotMatch(snippetText(snippet), /\|/);
});

test("list bullets, headings and emphasis do not survive into an excerpt", () => {
  const readable = readableSnippetSource("### Mecanismo\n\n* Colisión.\n* **Atropello**.\n- _Vuelco_.\n> Nota final.\n");
  assert.equal(readable, "Mecanismo Colisión. Atropello. Vuelco. Nota final.");
});

test("no excerpt where there is nothing to explain", () => {
  assert.equal(buildSearchSnippet("texto cualquiera", ""), null);
  assert.equal(buildSearchSnippet("", "atropello"), null);
  assert.equal(buildSearchSnippet("nada que ver aquí", "atropello"), null);
  // Single characters are not a full-text query.
  assert.equal(buildSearchSnippet("un atropello", "a"), null);
});

test("searchProcedures explains body hits but not title hits", () => {
  const base = {
    section: "SVA", slug: "", routeKey: "", tags: [], synonyms: [], related: [], backlinks: [],
    relations: [], editorialBlocks: [], updates: [], attachments: [], sourceUpdated: "", source: "", updated: "",
  };
  const procedures = [
    { ...base, id: "1", title: "Atropello", content: "Cualquier cosa.", searchText: "" },
    { ...base, id: "2", title: "Accidente de tráfico", content: "En el atropello de más de tres víctimas active el operativo.", searchText: "" },
  ] as unknown as Parameters<typeof searchProcedures>[0];

  const results = searchProcedures(procedures, "atropello");
  const byId = Object.fromEntries(results.map((result) => [result.procedure.id, result]));
  assert.equal(byId["1"].snippet, undefined, "a title that already says it needs no excerpt");
  assert.ok(byId["2"].snippet, "a body-only match must be explained");
  assert.match(snippetText(byId["2"].snippet!), /atropello/);
});

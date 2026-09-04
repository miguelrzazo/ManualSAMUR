import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  createReadingPositionStore,
  procedureHeadings,
  procedureRouteKey,
  resolveProcedureReference,
  searchProcedures,
  splitProcedureSections,
} from "../apps/mobile/src/procedure-logic.ts";
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

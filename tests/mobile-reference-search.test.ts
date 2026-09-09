import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  SEARCH_SCOPES,
  buildAbbreviationReferences,
  buildCodeReferences,
  buildVademecumReferences,
  codeRouteKey,
  getMobileSearchIndex,
  relatedProcedureIdsForDrug,
  resolveCodeReference,
  resolveVademecumReference,
  searchAbbreviations,
  searchCodes,
  searchVademecum,
} from "../apps/mobile/src/reference-search-logic.ts";
import type { MobileContent } from "../apps/mobile/src/data/schema.ts";

const snapshot = JSON.parse(readFileSync(path.join(process.cwd(), "apps/mobile/src/data/snapshot.json"), "utf8")) as { content: MobileContent };

test("the bundled vademécum search index includes medicines, perfusions, fluids and commercial names", () => {
  const references = buildVademecumReferences(snapshot.content);
  assert.equal(references.filter((item) => item.kind === "drug").length, snapshot.content.drugs.length);
  assert.equal(references.filter((item) => item.kind === "perfusion").length, snapshot.content.perfusions.length);
  assert.equal(references.filter((item) => item.kind === "fluid").length, snapshot.content.fluids.length);
  assert.equal(references.filter((item) => item.kind === "commercialName").length, snapshot.content.commercialNames.length);
  assert.equal(searchVademecum(snapshot.content, "Hidonac")[0]?.targetId, "n-acetilcisteina");
  assert.equal(searchVademecum(snapshot.content, "glucosado")[0]?.kind, "fluid");
  assert.equal(searchVademecum(snapshot.content, "adrenalina perf")[0]?.kind, "perfusion");
});

test("code lookup covers every code group and ranks exact code over descriptions", () => {
  const references = buildCodeReferences(snapshot.content.codes);
  assert.equal(references.length, Object.values(snapshot.content.codes).reduce((total, items) => total + items.length, 0));
  const results = searchCodes(snapshot.content.codes, "1.1");
  assert.equal(results[0]?.badge, "1.1");
  assert.equal(results[0]?.title, "Accidente no especificado");
  assert.ok(searchCodes(snapshot.content.codes, "plantillas").some((item) => item.title === "Plantillas operativas"));
});

test("abbreviation lookup searches both abbreviation and expanded meaning without network", () => {
  const references = buildAbbreviationReferences(snapshot.content.abbreviations);
  assert.equal(references.length, snapshot.content.abbreviations.reduce((total, group) => total + (Array.isArray(group.entries) ? group.entries.length : 0), 0));
  assert.equal(searchAbbreviations(snapshot.content.abbreviations, "EPOC")[0]?.subtitle, "Enfermedad pulmonar obstructiva crónica");
  assert.equal(searchAbbreviations(snapshot.content.abbreviations, "electrocardiograma")[0]?.title, "ECG");
  assert.equal(searchAbbreviations(snapshot.content.abbreviations, "sin coincidencia").length, 0);
});

test("reference lookup is accent insensitive and deterministic for empty queries", () => {
  const first = searchVademecum(snapshot.content, "Ácido acetil salicílico", 10);
  const second = searchVademecum(snapshot.content, "acido acetil salicilico", 10);
  assert.deepEqual(first.map((item) => item.id), second.map((item) => item.id));
  assert.equal(searchAbbreviations(snapshot.content.abbreviations, "", 500).length, buildAbbreviationReferences(snapshot.content.abbreviations).length);
});

test("one package identity reuses the shared mobile search index across search domains", () => {
  const index = getMobileSearchIndex(snapshot.content);
  assert.strictEqual(getMobileSearchIndex(snapshot.content), index);
  assert.strictEqual(getMobileSearchIndex(snapshot.content.procedures, "procedures"), index);
  assert.strictEqual(getMobileSearchIndex(snapshot.content.codes, "codes"), index);
  assert.strictEqual(getMobileSearchIndex(snapshot.content.abbreviations, "abbreviations"), index);
  assert.strictEqual(buildVademecumReferences(snapshot.content), buildVademecumReferences(snapshot.content));
  assert.strictEqual(buildCodeReferences(snapshot.content.codes), buildCodeReferences(snapshot.content.codes));
  assert.strictEqual(buildAbbreviationReferences(snapshot.content.abbreviations), buildAbbreviationReferences(snapshot.content.abbreviations));

  // The procedure search screen receives the collection directly. A later full
  // package lookup must promote that same identity instead of creating a second index.
  const procedures = snapshot.content.procedures.slice();
  const procedureFirstIndex = getMobileSearchIndex(procedures, "procedures");
  const packageWithSameCollections = { ...snapshot.content, procedures };
  assert.strictEqual(getMobileSearchIndex(packageWithSameCollections, "vademecum"), procedureFirstIndex);
});

test("drug relation lookup reuses normalized procedure bodies after the first query", () => {
  let contentReads = 0;
  const procedure = {
    id: "fixture",
    title: "Procedimiento fixture",
    section: "SVA",
    slug: "procedimiento-fixture",
    routeKey: "procedure:fixture",
    tags: [],
    synonyms: [],
    related: [],
    backlinks: [],
    relations: [],
    editorialBlocks: [],
    updated: "",
    sourceUpdated: "",
    attachments: [],
    searchText: "adrenalina",
    get content() {
      contentReads += 1;
      return "La adrenalina se administra según el procedimiento.";
    },
  } as unknown as MobileContent["procedures"][number];
  const content = { procedures: [procedure] } as unknown as Pick<MobileContent, "procedures">;
  const drug = { id: "adrenalina", name: "Adrenalina" };

  assert.deepEqual(relatedProcedureIdsForDrug(content, drug), ["fixture"]);
  const readsAfterFirstLookup = contentReads;
  assert.ok(readsAfterFirstLookup > 0);
  assert.deepEqual(relatedProcedureIdsForDrug(content, drug), ["fixture"]);
  assert.equal(contentReads, readsAfterFirstLookup);
});

test("code and vademécum entries resolve through stable detail routes and recover when absent", () => {
  const code = buildCodeReferences(snapshot.content.codes).find((item) => item.badge === "1.1");
  assert.ok(code);
  assert.equal(code.routeKey, codeRouteKey("incidente", "1.1"));
  assert.equal(resolveCodeReference(snapshot.content.codes, code.routeKey)?.title, "Accidente no especificado");
  assert.equal(resolveCodeReference(snapshot.content.codes, "code:missing:9.9"), undefined);

  const medicine = buildVademecumReferences(snapshot.content).find((item) => item.kind === "drug" && item.targetId === "n-acetilcisteina");
  assert.ok(medicine);
  assert.equal(resolveVademecumReference(snapshot.content, medicine.routeKey)?.title, medicine.title);
  const fluid = buildVademecumReferences(snapshot.content).find((item) => item.kind === "fluid");
  assert.ok(fluid);
  assert.equal(resolveVademecumReference(snapshot.content, fluid.routeKey)?.kind, "fluid");
  assert.equal(resolveVademecumReference(snapshot.content, "vademecum:fluid:missing"), undefined);
  assert.ok(relatedProcedureIdsForDrug(snapshot.content, medicine.detail ?? {}).every((id) => snapshot.content.procedures.some((procedure) => procedure.id === id)));
});

test("abbreviations stay out of global search while remaining in the information hub", () => {
  const source = readFileSync(path.join(process.cwd(), "apps/mobile/App.tsx"), "utf8");
  const searchStart = source.indexOf("function SearchScreen");
  const searchEnd = source.indexOf("function ReferenceRow", searchStart);
  const globalSearch = source.slice(searchStart, searchEnd);
  assert.doesNotMatch(globalSearch, /searchAbbreviations|Abreviaturas/);
  assert.match(source, /onOpenAbbreviations/);
  // The hub itself is `SettingsModal`; App.tsx only wires the callback into it.
  assert.match(
    readFileSync(path.join(process.cwd(), "apps/mobile/src/components/SettingsModal.tsx"), "utf8"),
    /title="Abreviaturas"/,
  );
  assert.match(source, /Fármacos/);
  assert.match(source, /Comerciales/);
  assert.match(source, /Perfusiones/);
  assert.match(source, /Fluidos/);
  // Las etiquetas de la ficha de fármaco viven ahora en `drug-detail-logic.ts`: App.tsx
  // dibuja vía y dosis aparte y recorre `DRUG_DETAIL_FIELDS` para el resto.
  assert.match(source, /DRUG_DETAIL_FIELDS/);
  assert.match(
    readFileSync(path.join(process.cwd(), "apps/mobile/src/drug-detail-logic.ts"), "utf8"),
    /Presentación/,
  );
  assert.match(source, /Dosis/);
  assert.match(source, /Seguridad/);
  assert.doesNotMatch(source, /Dosis publicada/);
  assert.doesNotMatch(source, /Presentación publicada/);
  assert.match(source, /Procedimientos relacionados/);
  assert.match(source, /function CodeScreen/);
});

test("global search offers one scope row, not a second tier of the same taxonomy", () => {
  assert.deepEqual([...SEARCH_SCOPES], ["Todo", "Procedimientos", "Vademécum", "Códigos"]);
  const source = readFileSync(path.join(process.cwd(), "apps/mobile/App.tsx"), "utf8");
  const start = source.indexOf("function BuscarScreen");
  const end = source.indexOf("function SearchStartingPoints", start);
  const buscar = source.slice(start, end);
  // Exactly one chip row: the second one duplicated the Vademécum tab's own
  // domain switcher, chip for chip, on the screen that searches across all of them.
  assert.equal((buscar.match(/accessibilityRole="tablist"/g) ?? []).length, 1);
  assert.doesNotMatch(buscar, /VADEMECUM_SCOPES/);
});

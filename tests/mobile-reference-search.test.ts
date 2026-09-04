import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  buildAbbreviationReferences,
  buildCodeReferences,
  buildVademecumReferences,
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

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { displayTitle, isShoutingTitle } from "../apps/mobile/src/title-case.ts";

const snapshot = JSON.parse(readFileSync(path.join(process.cwd(), "apps/mobile/src/data/snapshot.json"), "utf8")).content;

test("shouting titles are normalised to the sentence case the rest of the corpus uses", () => {
  assert.equal(displayTitle("PARADA CARDIORRESPIRATORIA"), "Parada cardiorrespiratoria");
  assert.equal(displayTitle("CRICOTIROIDOTOMÍA"), "Cricotiroidotomía");
  assert.equal(displayTitle("EXPLORACIÓN ECOGRÁFICA EXTRAHOSPITALARIA"), "Exploración ecográfica extrahospitalaria");
});

test("titles that are already deliberate are returned byte-for-byte", () => {
  for (const title of [
    "Cuidados postparada",
    "Manejo avanzado de vía aérea",
    "PCR Traumática",
    "Sospecha de Síndrome Coronario Agudo (SCA)",
    "INTRODUCTOR DE FROVA 14,0 Fr (adultos)",
    "TORACOSTOMÍA CON SONDA Kit de Drenaje Torácico Portex®",
  ]) {
    assert.equal(displayTitle(title), title, `${title} must not be rewritten`);
  }
});

// The reason this module is structural rather than a whitelist: an acronym list
// was tried against the real corpus and mangled SCA, IMV, VISEM, TEP, EPOC,
// ICTUS, USVA, ETCO2, EZ-IO, INR, SIPE and RENFE, among others.
test("acronyms are never lower-cased, alone or inside a shouting title", () => {
  for (const acronym of ["SVA", "SVB", "PCR", "DRP", "OVACE", "NRBQ", "UPSI", "IMV", "SCA", "TEP", "EPOC", "INR"]) {
    assert.equal(displayTitle(acronym), acronym, `${acronym} must survive as written`);
    assert.equal(isShoutingTitle(acronym), false, `${acronym} must not register as shouting`);
  }
  assert.equal(displayTitle("PCR TRAUMÁTICA"), "PCR traumática");
});

test("the rule stays conservative against the shipped corpus", () => {
  const procedures = snapshot.procedures as { title: string }[];
  const changed = procedures.filter((item) => displayTitle(item.title) !== item.title);
  // Four procedures shout today. If a sync pushes this much higher the rule has
  // started catching titles it should not, and this test is the tripwire.
  assert.ok(changed.length <= 12, `expected a handful of shouting titles, got ${changed.length}`);
  for (const item of changed) {
    assert.match(item.title, /^[^a-záéíóúüñ]+$/u, `${item.title} was rewritten despite containing lowercase`);
  }

  // Drug names are already sentence case and must stay untouched.
  const drugs = (snapshot.drugs ?? []) as { name?: string }[];
  for (const drug of drugs) {
    if (typeof drug.name === "string") assert.equal(displayTitle(drug.name), drug.name, `${drug.name} must not be rewritten`);
  }
});

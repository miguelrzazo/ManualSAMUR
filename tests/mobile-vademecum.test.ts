import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  activeSectionKey,
  buildAlphabetSections,
  buildCategorySections,
  categoryAccent,
  categoryOf,
  filterByCategory,
  filterByTab,
  resolveActiveLetter,
  kindForTab,
  sortByTitle,
  supportsAlphabetNav,
  uniqueCategories,
  VADEMECUM_TABS,
  type VademecumTabKey,
} from "../apps/mobile/src/vademecum-logic.ts";
import { buildVademecumReferences } from "../apps/mobile/src/reference-search-logic.ts";
import type { MobileContent } from "../apps/mobile/src/data/schema.ts";

const snapshot = JSON.parse(readFileSync(path.join(process.cwd(), "apps/mobile/src/data/snapshot.json"), "utf8")) as {
  content: MobileContent;
};
const references = buildVademecumReferences(snapshot.content);

test("the four domains are ordered, labelled and mapped to the right reference kind", () => {
  assert.deepEqual(
    VADEMECUM_TABS.map((tab) => tab.key),
    ["farmacos", "perfusiones", "fluidos", "comerciales"],
  );
  assert.equal(kindForTab("farmacos"), "drug");
  assert.equal(kindForTab("comerciales"), "commercialName");
  assert.equal(kindForTab("perfusiones"), "perfusion");
  assert.equal(kindForTab("fluidos"), "fluid");
});

test("filtering by tab reproduces the exact counts pinned for the offline snapshot", () => {
  assert.equal(filterByTab(references, "farmacos").length, snapshot.content.drugs.length);
  assert.equal(filterByTab(references, "perfusiones").length, snapshot.content.perfusions.length);
  assert.equal(filterByTab(references, "fluidos").length, snapshot.content.fluids.length);
  assert.equal(filterByTab(references, "comerciales").length, snapshot.content.commercialNames.length);
  const total = (["farmacos", "perfusiones", "fluidos", "comerciales"] as VademecumTabKey[])
    .map((tab) => filterByTab(references, tab).length)
    .reduce((a, b) => a + b, 0);
  assert.equal(total, references.length);
});

test("category/type extraction falls back to Otros and drives per-domain category chips", () => {
  const drugs = filterByTab(references, "farmacos");
  assert.ok(drugs.every((drug) => categoryOf(drug).length > 0));
  const categories = uniqueCategories(drugs);
  assert.ok(categories.includes("Antídotos"));
  assert.ok(categories.length > 1);
  assert.equal(new Set(categories).size, categories.length, "categories must be de-duplicated");

  const fluids = filterByTab(references, "fluidos");
  const fluidTypes = uniqueCategories(fluids);
  assert.ok(fluidTypes.includes("Cristaloide isotónico") || fluidTypes.some((t) => t.startsWith("Cristaloide")));

  const missing = categoryOf({ ...drugs[0], detail: {} });
  assert.equal(missing, "Otros");
  assert.equal(categoryAccent("no existe"), categoryAccent("Otros"));
});

test("filterByCategory narrows one domain without touching the others, and null returns everything", () => {
  const drugs = filterByTab(references, "farmacos");
  const category = uniqueCategories(drugs)[0];
  const narrowed = filterByCategory(drugs, category);
  assert.ok(narrowed.length > 0);
  assert.ok(narrowed.every((drug) => categoryOf(drug) === category));
  assert.equal(filterByCategory(drugs, null).length, drugs.length);
});

test("only fármacos and comerciales carry an A-Z index, matching the web's alphabet nav", () => {
  assert.equal(supportsAlphabetNav("farmacos"), true);
  assert.equal(supportsAlphabetNav("comerciales"), true);
  assert.equal(supportsAlphabetNav("perfusiones"), false);
  assert.equal(supportsAlphabetNav("fluidos"), false);
});

test("A-Z sections are sorted, keyed by first letter, accent-fold, and put # first", () => {
  const drugs = filterByTab(references, "farmacos");
  const sections = buildAlphabetSections(drugs);
  assert.ok(sections.length > 1);
  const keys = sections.map((s) => s.key);
  assert.deepEqual([...keys].sort((a, b) => (a === "#" ? -1 : b === "#" ? 1 : a.localeCompare(b, "es"))), keys);
  for (const section of sections) {
    const titles = section.data.map((item) => item.title);
    assert.deepEqual([...titles].sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" })), titles);
  }
  const total = sections.reduce((sum, section) => sum + section.data.length, 0);
  assert.equal(total, drugs.length);
  // "Ácido acetilsalicílico" must fold under "A", not a separate accented bucket.
  const acidoSection = sections.find((s) => s.data.some((item) => item.title.toLowerCase().startsWith("ácido")));
  assert.equal(acidoSection?.key, "A");
});

test("category sections cover a whole domain exactly once, grouped by first-seen category order", () => {
  const perfusions = filterByTab(references, "perfusiones");
  const sections = buildCategorySections(perfusions);
  assert.deepEqual(sections.map((s) => s.key), uniqueCategories(perfusions));
  const total = sections.reduce((sum, section) => sum + section.data.length, 0);
  assert.equal(total, perfusions.length);
  for (const section of sections) {
    assert.ok(section.data.every((item) => categoryOf(item) === section.key));
    const titles = section.data.map((item) => item.title);
    assert.deepEqual([...titles].sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" })), titles);
  }
});

test("sortByTitle is a stable, accent-insensitive Spanish collation", () => {
  const drugs = filterByTab(references, "farmacos");
  const sorted = sortByTitle(drugs);
  const titles = sorted.map((item) => item.title);
  assert.deepEqual([...titles].sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" })), titles);
  assert.equal(sorted.length, drugs.length);
});

test("the mobile app exposes a real Vademécum screen with the four domains, not the old placeholder list", () => {
  const source = readFileSync(path.join(process.cwd(), "apps/mobile/src/screens/VademecumScreen.tsx"), "utf8");
  assert.match(source, /VADEMECUM_TABS/);
  assert.match(source, /DoseUtilityCard|calculateDoseConversion/);
  assert.match(source, /searchVademecum|searchMobileReferences/);
  // No internal identifiers: no raw drug/route "id" rows rendered as content.
  assert.doesNotMatch(source, /identificador estable|stable identifier|route key/i);

  const app = readFileSync(path.join(process.cwd(), "apps/mobile/App.tsx"), "utf8");
  assert.match(app, /VademecumScreen/);
  assert.doesNotMatch(app, /function VademecumListScreen/);
});

test("the A-Z index follows the list: the first still-visible row names the active letter", () => {
  assert.equal(activeSectionKey([{ sectionKey: "C" }, { sectionKey: "C" }, { sectionKey: "D" }]), "C");
  assert.equal(activeSectionKey([]), null);
  // Section headers arrive without a section on some RN versions — a gap, not an answer.
  assert.equal(activeSectionKey([{ sectionKey: undefined }, { sectionKey: "M" }]), "M");
  assert.equal(activeSectionKey([{ sectionKey: null }, { sectionKey: "" }]), null);
});

test("a tapped letter wins until the jump lands, so the index does not strobe through the alphabet", () => {
  // Mid-flight: the list is passing through B on its way to the tapped S.
  assert.equal(resolveActiveLetter("S", "B"), "S");
  // Settled: the tap is cleared and the list is the only source again.
  assert.equal(resolveActiveLetter(null, "S"), "S");
  assert.equal(resolveActiveLetter(null, null), null);
});

test("the alphabet index reports its selection and highlights it, rather than being write-only", () => {
  const source = readFileSync(path.join(process.cwd(), "apps/mobile/src/screens/VademecumScreen.tsx"), "utf8");
  assert.match(source, /onViewableItemsChanged/);
  assert.match(source, /alphabetChipActive/);
  assert.match(source, /accessibilityState=\{\{ selected \}\}/);
});

test("domain rows drop the per-row glyph that only repeated the tab the reader already picked", () => {
  const source = readFileSync(path.join(process.cwd(), "apps/mobile/src/screens/VademecumScreen.tsx"), "utf8");
  const start = source.indexOf("function VademecumRow");
  const end = source.indexOf("function SearchField");
  assert.ok(start >= 0 && end > start);
  const row = source.slice(start, end);
  assert.doesNotMatch(row, /name=\{icon\}/);
  // The category accent bar stays: unlike the glyph, it varies within a tab.
  assert.match(row, /rowAccentBar/);
});

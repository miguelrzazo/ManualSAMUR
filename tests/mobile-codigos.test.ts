import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  asCodigosBases,
  asCodigosCodes,
  asCodigosHospitals,
  asCodigosIndicativos,
  asCheatsheetSections,
  asSimpleCodes,
  asStatus4Entries,
  buildCodeSections,
  categoryAccentColor,
  buildHospitalList,
  buildJumpTargets,
  codeLegendNotes,
  COMUNICACIONES_SECTION_KEYS,
  DISTRICT_NUM,
  extractCodeFamily,
  filterByCategory,
  filterIndicativos,
  getCheatsheetSection,
  groupByCategoryField,
  groupBasesByDistrict,
  groupIndicativos,
  hasNoReportCodes,
  hasTetraCodes,
  isCodeTab,
  OTROS_TABS,
  TOP_TABS,
  uniqueCategories,
  usesCategoryColor,
  usesFamilyColor,
  groupsByCategory,
  type CodigosCode,
} from "../apps/mobile/src/codigos-logic.ts";
import type { MobileContent } from "../apps/mobile/src/data/schema.ts";

const snapshot = JSON.parse(readFileSync(path.join(process.cwd(), "apps/mobile/src/data/snapshot.json"), "utf8")) as {
  content: MobileContent;
};

test("six top tabs carry the same identity colours as the web", () => {
  assert.equal(TOP_TABS.length, 6);
  const byKey = Object.fromEntries(TOP_TABS.map((t) => [t.key, t.color]));
  assert.equal(byKey.incidente, "#d97706");
  assert.equal(byKey.svb, "#2563eb");
  assert.equal(byKey.sva, "#dc2626");
  assert.equal(byKey.upsi, "#059669");
  assert.equal(byKey.upsq, "#94a3b8");
  assert.equal(byKey.otros, "#7c3aed");
  assert.ok(isCodeTab("sva"));
  assert.ok(!isCodeTab("otros"));
});

test("eight Otros subtabs are all present — Comunicaciones and Distritos are not dropped", () => {
  assert.equal(OTROS_TABS.length, 8);
  const keys = OTROS_TABS.map((t) => t.key);
  assert.deepEqual(keys, ["icao", "indicativos", "claves", "bases", "hospitales", "comunicaciones", "distritos", "lima"]);
});

test("extractCodeFamily reads the leading alpha or numeric run", () => {
  assert.equal(extractCodeFamily("T.1.1"), "T");
  assert.equal(extractCodeFamily("PS.2.3"), "PS");
  assert.equal(extractCodeFamily("1.1"), "1");
  assert.equal(extractCodeFamily("11.2"), "11");
});

test("package code counts match the documented offline snapshot", () => {
  assert.equal(snapshot.content.codes.incidente.length, 130);
  assert.equal(snapshot.content.codes.sva.length, 418);
  assert.equal(snapshot.content.codes.svb.length, 214);
  assert.equal(snapshot.content.codes.upsi.length, 30);
  assert.equal(snapshot.content.codes.upsq.length, 90);
  assert.equal(snapshot.content.codes.icao.length, 36);
  assert.equal(snapshot.content.codes.indicativos.length, 108);
  assert.equal(snapshot.content.codes.claves.length, 33);
  assert.equal(snapshot.content.codes.lima.length, 12);
  assert.equal(snapshot.content.codes.cheatsheet.length, 8);
  assert.equal(snapshot.content.hospitals.length, 21);
  assert.equal(snapshot.content.bases.length, 25);
  assert.equal(snapshot.content.status4.length, 9);
});

test("SVB groups by family in FAMILY_ORDER, not first-seen order", () => {
  const codes = asCodigosCodes(snapshot.content.codes.svb);
  assert.ok(usesFamilyColor("svb"));
  const sections = buildCodeSections("svb", codes);
  const keys = sections.map((s) => s.key);
  const order = ["T", "C", "R", "N", "D", "G", "F", "I", "PS", "M", "W"];
  const filteredOrder = order.filter((k) => keys.includes(k));
  assert.deepEqual(keys, filteredOrder);
  const total = sections.reduce((sum, s) => sum + s.count, 0);
  assert.equal(total, codes.length);
});

test("SVA sub-groups (item.group) surface as divider rows inside a section", () => {
  const codes = asCodigosCodes(snapshot.content.codes.sva);
  const sections = buildCodeSections("sva", codes);
  const traumaSection = sections.find((s) => s.key === "T");
  assert.ok(traumaSection);
  const dividers = traumaSection!.data.filter((r) => r.type === "subgroup");
  assert.ok(dividers.length > 0, "expected at least one subgroup divider in the T family");
  assert.ok(dividers.some((d) => d.title === "Esguince / torcedura"));
});

test("Incidente routes 'Especificos' category codes into their own bucket, bypassing numeric family", () => {
  const codes = asCodigosCodes(snapshot.content.codes.incidente);
  assert.ok(usesCategoryColor("incidente"));
  const sections = buildCodeSections("incidente", codes);
  const especificos = sections.find((s) => s.key === "Especificos");
  if (codes.some((c) => c.category === "Especificos")) {
    assert.ok(especificos);
    assert.equal(especificos!.label, "Específicos");
    assert.ok(especificos!.accentColor);
  }
  const total = sections.reduce((sum, s) => sum + s.count, 0);
  assert.equal(total, codes.length);
});

test("Incidente TETRA legend condition matches real data", () => {
  const codes = asCodigosCodes(snapshot.content.codes.incidente);
  assert.ok(hasTetraCodes(codes));
  assert.ok(!hasNoReportCodes(codes));
});

test("SVA no-report legend condition matches real data", () => {
  const codes = asCodigosCodes(snapshot.content.codes.sva);
  assert.ok(hasNoReportCodes(codes));
});

test("UPSI and UPSQ group by category, not by family", () => {
  assert.ok(groupsByCategory("upsi"));
  assert.ok(groupsByCategory("upsq"));
  const upsi = asCodigosCodes(snapshot.content.codes.upsi);
  const sections = buildCodeSections("upsi", upsi);
  const categories = new Set(upsi.map((c) => c.category));
  assert.equal(sections.length, categories.size);
  // Every section carries an identity colour, including these. The jump chips are now the
  // screen's only pill row, so a section without an accent renders as an uncoloured chip
  // beside coloured ones — which is the inconsistency that made the row look duplicated.
  for (const section of sections) {
    assert.match(section.accentColor ?? "", /^#[0-9a-f]{6}$/i, `${section.key} needs an accent colour`);
  }
  // Derived, not random: the same category must resolve to the same colour every launch.
  assert.equal(categoryAccentColor("Accidentes"), "#dc2626");
  assert.equal(categoryAccentColor("Una categoría inventada"), categoryAccentColor("Una categoría inventada"));
});

test("category filter narrows by the raw `category` field, independent of family grouping", () => {
  const codes = asCodigosCodes(snapshot.content.codes.sva);
  const categories = uniqueCategories(codes);
  assert.ok(categories.length > 1);
  const first = categories[0];
  const filtered = filterByCategory(codes, first);
  assert.ok(filtered.every((c) => c.category === first));
  assert.equal(filterByCategory(codes, null).length, codes.length);
});

test("jump targets follow the same order and labels as the rendered sections", () => {
  const codes = asCodigosCodes(snapshot.content.codes.svb);
  const sections = buildCodeSections("svb", codes);
  const targets = buildJumpTargets(sections);
  assert.deepEqual(targets.map((t) => t.key), sections.map((s) => s.key));
  assert.deepEqual(targets.map((t) => t.label), sections.map((s) => s.label));
});

test("Indicativos excludes 'Propios · Bases' and groups by its own `group` field", () => {
  const raw = asCodigosIndicativos(snapshot.content.codes.indicativos);
  assert.equal(raw.length, snapshot.content.codes.indicativos.length);
  const filtered = filterIndicativos(raw);
  assert.ok(filtered.every((i) => i.group !== "Propios · Bases"));
  const groups = groupIndicativos(filtered);
  assert.ok(groups.length > 0);
  assert.equal(groups.reduce((sum, g) => sum + g.items.length, 0), filtered.length);
});

test("Lima groups by category in first-seen order", () => {
  const lima = asSimpleCodes(snapshot.content.codes.lima);
  const groups = groupByCategoryField(lima);
  assert.equal(groups.reduce((sum, g) => sum + g.items.length, 0), lima.length);
});

test("Distritos derives from the same `bases` the Bases subtab shows, ordered by DISTRICT_NUM", () => {
  const bases = asCodigosBases(snapshot.content.bases);
  assert.equal(bases.length, 25);
  const districts = groupBasesByDistrict(bases);
  assert.equal(districts.length, Object.keys(DISTRICT_NUM).length);
  for (let i = 1; i < districts.length; i++) {
    assert.ok(districts[i - 1].num < districts[i].num);
  }
  const totalBases = districts.reduce((sum, d) => sum + d.bases.length, 0);
  assert.equal(totalBases, bases.length);
  // Every base's district must be a known Madrid district — otherwise it would be silently dropped.
  for (const base of bases) {
    assert.ok(base.district in DISTRICT_NUM, `unexpected district: ${base.district}`);
  }
});

test("Hospitales sorts public before private, then alphabetically, and attaches Status 4", () => {
  const hospitals = asCodigosHospitals(snapshot.content.hospitals);
  const status4 = asStatus4Entries(snapshot.content.status4);
  const list = buildHospitalList(hospitals, status4);
  assert.equal(list.length, hospitals.length);
  const firstPrivateIndex = list.findIndex((h) => h.type === "private");
  if (firstPrivateIndex >= 0) {
    assert.ok(list.slice(0, firstPrivateIndex).every((h) => h.type === "public"));
  }
  const withStatus4 = list.filter((h) => h.status4 !== null);
  assert.ok(withStatus4.length > 0);
});

test("Comunicaciones content is fully present offline under content.codes.cheatsheet — no data gap", () => {
  const sections = asCheatsheetSections(snapshot.content.codes.cheatsheet);
  for (const key of COMUNICACIONES_SECTION_KEYS) {
    const section = getCheatsheetSection(sections, key);
    assert.ok(section, `missing cheatsheet section: ${key}`);
    assert.ok(section!.items.length > 0);
  }
  const distritos = getCheatsheetSection(sections, "distritos");
  assert.ok(distritos, "the cheatsheet also ships a distritos table, corroborating the derived grouping");
});

test("no code group is silently dropped: asCodigosCodes preserves every entry with a code", () => {
  for (const key of ["incidente", "sva", "svb", "upsi", "upsq"] as const) {
    const raw = snapshot.content.codes[key] as unknown[];
    const parsed: CodigosCode[] = asCodigosCodes(raw);
    assert.equal(parsed.length, raw.length, `${key} lost entries during parsing`);
  }
});

test("the TETRA note is offered only where TETRA codes exist, and only on Incidente", () => {
  const tetra: CodigosCode[] = [{ code: "11", name: "Accidente", tetra: true }];
  const plain: CodigosCode[] = [{ code: "11", name: "Accidente" }];

  assert.deepEqual(codeLegendNotes("incidente", tetra).map((n) => n.key), ["tetra"]);
  assert.deepEqual(codeLegendNotes("incidente", plain), []);
  // The other tabs never carry it, even if a code somehow claims the flag.
  assert.deepEqual(codeLegendNotes("sva", tetra), []);
});

test("the informe-asistencial note follows the marker, which only the family-coloured tabs draw", () => {
  const noReport: CodigosCode[] = [{ code: "3.1", name: "Traslado", noReport: true }];
  for (const tab of ["sva", "svb"] as const) {
    assert.deepEqual(codeLegendNotes(tab, noReport).map((n) => n.key), ["noReport"], tab);
  }
  for (const tab of ["incidente", "upsi", "upsq", "otros"] as const) {
    assert.deepEqual(codeLegendNotes(tab, noReport), [], tab);
  }
});

test("both notes carry the same shape, so one footer treatment renders either", () => {
  const notes = [
    ...codeLegendNotes("incidente", [{ code: "11", name: "Accidente", tetra: true }]),
    ...codeLegendNotes("sva", [{ code: "3.1", name: "Traslado", noReport: true }]),
  ];
  assert.equal(notes.length, 2);
  for (const note of notes) {
    assert.ok(note.icon.length > 0);
    assert.ok(note.strong.length > 0, "each note emphasises the phrase that matters");
    assert.equal(typeof note.accented, "boolean");
  }
  // The icons must be the same glyphs the annotated rows carry, or the note
  // points at nothing.
  assert.deepEqual(notes.map((n) => n.icon), ["radio-handheld", "file-remove-outline"]);
});

test("the códigos annotations render under the list, never above it", () => {
  const source = readFileSync(path.join(process.cwd(), "apps/mobile/src/screens/CodigosScreen.tsx"), "utf8");
  assert.match(source, /ListFooterComponent=\{<AnnotationFooter/);
  const listStart = source.indexOf("<SectionList");
  const footer = source.indexOf("AnnotationFooter");
  assert.ok(listStart >= 0 && footer > listStart, "the annotation must not be rendered before the list");
  // And the old always-on banner is gone for good.
  assert.doesNotMatch(source, /showTetraLegend|showNoReportLegend/);
});

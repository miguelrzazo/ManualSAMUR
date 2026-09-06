import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  applyManualRecencyWindow,
  asManualUpdateEvents,
  buildManualTree,
  flattenManualTree,
  groupManualEventsByDate,
  manualFlatSectionProcedures,
  manualNovedades,
  MANUAL_FLAT_SECTIONS,
  manualSectionColor,
  manualSectionKey,
  manualSectionProcedureCount,
  MANUAL_SECTIONS_PRIORITY,
  manualSidebarMeta,
  sortManualHistorial,
  sortManualSections,
  type ManualTreeProcedureRef,
} from "../apps/mobile/src/manual-tree-logic.ts";
import type { MobileSnapshot } from "../apps/mobile/src/data/schema.ts";

const snapshot = JSON.parse(readFileSync(path.join(process.cwd(), "apps/mobile/src/data/snapshot.json"), "utf8")) as MobileSnapshot;
const procedures: ManualTreeProcedureRef[] = snapshot.content.procedures.map((p) => ({ id: p.id, title: p.title, slug: p.slug, section: p.section }));

test("the bundled corpus carries exactly the 9 documented sections", () => {
  const sections = new Set(procedures.map((p) => p.section));
  assert.deepEqual([...sections].sort(), [...MANUAL_SECTIONS_PRIORITY].sort());
});

test("buildManualTree groups every procedure exactly once, and sortManualSections pins the web's order", () => {
  const tree = sortManualSections(buildManualTree(procedures));
  const seen = new Set<string>();
  for (const section of tree) {
    for (const group of section.groups) {
      for (const subgroup of group.subgroups) {
        for (const procedure of subgroup.procedures) {
          assert.equal(seen.has(procedure.id), false, `${procedure.id} must not appear twice`);
          seen.add(procedure.id);
        }
      }
    }
  }
  assert.equal(seen.size, procedures.length);
  assert.deepEqual(tree.map((s) => s.section), [...MANUAL_SECTIONS_PRIORITY]);
});

test("flat sections (Administrativos, Comunicaciones, DRP, Intervinientes) collapse to a single group with no subgroup accordion", () => {
  const tree = buildManualTree(procedures);
  for (const section of tree) {
    if (!MANUAL_FLAT_SECTIONS.has(section.section)) continue;
    assert.equal(section.groups.length, 1, `${section.section} must carry a single group`);
    assert.equal(section.groups[0].subgroups.length, 1, `${section.section} must carry a single subgroup`);
  }
});

test("non-flat sections split into more than one group, ordered and numbered by id", () => {
  const tree = buildManualTree(procedures);
  const sva = tree.find((s) => s.section === "SVA")!;
  assert.ok(sva.groups.length > 1);
  const flatSVA = manualFlatSectionProcedures(sva);
  for (let i = 1; i < flatSVA.length; i++) {
    assert.ok(flatSVA[i - 1].id.localeCompare(flatSVA[i].id, "es", { numeric: true }) <= 0);
  }
});

test("manualSidebarMeta routes 216c/216d to the high-risk pathogen subgroup, matching lib/manual-data.ts", () => {
  assert.deepEqual(manualSidebarMeta("Operativos", "216c", "Algo"), { group: "Riesgo biológico e infeccioso", subgroup: "Patógenos de alto riesgo" });
  assert.deepEqual(manualSidebarMeta("Operativos", "216a", "Exposición"), { group: "Riesgo biológico e infeccioso", subgroup: "Exposiciones biológicas" });
  assert.deepEqual(manualSidebarMeta("SVA", "314_02", "Urgencia pediátrica"), { group: "Urgencias específicas", subgroup: "Urgencias pediátricas" });
  assert.deepEqual(manualSidebarMeta("Administrativos", "101", "Cualquiera"), { group: "Procedimientos", subgroup: "Listado" });
});

test("manualSectionProcedureCount and manualSectionColor stay consistent with the tree", () => {
  const tree = buildManualTree(procedures);
  const total = tree.reduce((sum, section) => sum + manualSectionProcedureCount(section), 0);
  assert.equal(total, procedures.length);
  for (const section of tree) assert.ok(manualSectionColor(section.section).startsWith("#"));
  assert.equal(manualSectionColor("not-a-real-section"), manualSectionColor("General"));
});

test("flattenManualTree only reveals a section's children once it is in openKeys, and rows carry no internal identifiers", () => {
  const tree = sortManualSections(buildManualTree(procedures));
  const collapsedRows = flattenManualTree(tree, new Set());
  assert.equal(collapsedRows.length, tree.length);
  assert.ok(collapsedRows.every((row) => row.kind === "section"));

  const firstSectionKey = manualSectionKey(tree[0].section);
  const oneOpenRows = flattenManualTree(tree, new Set([firstSectionKey]));
  assert.ok(oneOpenRows.length > collapsedRows.length);

  // A flat section (Administrativos) reveals procedure rows directly on a single
  // expand. Procedure ids ("101", "216c"...) are content and must stay on the row;
  // there is no separate internal routeKey/plumbing field on a ManualTreeRow.
  const administrativosKey = manualSectionKey("Administrativos");
  const administrativosRows = flattenManualTree(tree, new Set([administrativosKey]));
  const procedureRow = administrativosRows.find((row) => row.kind === "procedure");
  assert.ok(procedureRow?.procedure?.id);
});

test("expanding a flat section lists its procedures directly, without a Listado subgroup row", () => {
  const tree = buildManualTree(procedures);
  const administrativos = tree.find((s) => s.section === "Administrativos")!;
  const openKeys = new Set([manualSectionKey("Administrativos")]);
  const rows = flattenManualTree([administrativos], openKeys);
  assert.ok(rows.some((row) => row.kind === "procedure"));
  assert.equal(rows.some((row) => row.kind === "group" || row.kind === "subgroup"), false);
});

test("Psicologicos expands straight to 501-509 with no Intervencion psicologica tier", () => {
  const tree = buildManualTree(procedures);
  const psicologicos = tree.find((section) => section.section === "Psicológicos")!;
  const rows = flattenManualTree([psicologicos], new Set([manualSectionKey("Psicológicos")]));

  const procedureRows = rows.filter((row) => row.kind === "procedure");
  assert.equal(procedureRows.length, 9);
  assert.equal(rows.some((row) => row.kind === "group" || row.kind === "subgroup"), false);
  assert.deepEqual(procedureRows.map((row) => row.procedure!.id), ["501", "502", "503", "504", "505", "506", "507", "508", "509"]);
});

// ─── Update history ──────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<ReturnType<typeof asManualUpdateEvents>[number]> & { eventId: string; summary: string }) {
  return {
    procedureIds: ["101"],
    changeKind: "actualizado",
    effectiveDate: "2026-01-01",
    approvedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

test("asManualUpdateEvents guards the boundary against a damaged snapshot", () => {
  assert.deepEqual(asManualUpdateEvents(null), []);
  assert.deepEqual(asManualUpdateEvents([{ eventId: "x" }]), []); // no summary
  const [parsed] = asManualUpdateEvents([{ eventId: "e1", summary: "Actualizado: 101", changeKind: "actualizado", procedureIds: ["101"] }]);
  assert.equal(parsed.eventId, "e1");
  assert.equal(parsed.changeKind, "actualizado");
});

test("applyManualRecencyWindow recomputes isRecent against the device clock instead of trusting a possibly-stale baked value", () => {
  const now = new Date("2026-06-15T00:00:00.000Z");
  const [withinWindow, outsideWindow, malformed] = applyManualRecencyWindow([
    makeEvent({ eventId: "a", summary: "reciente", approvedAt: "2026-06-01T00:00:00.000Z", isRecent: false }),
    makeEvent({ eventId: "b", summary: "viejo", approvedAt: "2025-01-01T00:00:00.000Z", isRecent: true }),
    makeEvent({ eventId: "c", summary: "sin fecha", approvedAt: undefined, isRecent: true }),
  ], now);
  assert.equal(withinWindow.isRecent, true);
  assert.equal(outsideWindow.isRecent, false);
  assert.equal(malformed.isRecent, false);
});

test("manualNovedades excludes revisado events and sorts most-recent first", () => {
  const now = new Date("2026-06-15T00:00:00.000Z");
  const events = applyManualRecencyWindow([
    makeEvent({ eventId: "old", summary: "Actualizado viejo", approvedAt: "2026-06-01T00:00:00.000Z" }),
    makeEvent({ eventId: "new", summary: "Actualizado nuevo", approvedAt: "2026-06-10T00:00:00.000Z" }),
    makeEvent({ eventId: "reviewed", summary: "Revisado", changeKind: "revisado", approvedAt: "2026-06-12T00:00:00.000Z" }),
  ], now);
  const novedades = manualNovedades(events);
  assert.deepEqual(novedades.map((e) => e.eventId), ["new", "old"]);
});

test("groupManualEventsByDate groups by day, most recent day first", () => {
  const events = [
    makeEvent({ eventId: "a", summary: "a", approvedAt: "2026-06-01T09:00:00.000Z" }),
    makeEvent({ eventId: "b", summary: "b", approvedAt: "2026-06-01T10:00:00.000Z" }),
    makeEvent({ eventId: "c", summary: "c", approvedAt: "2026-06-02T09:00:00.000Z" }),
  ];
  const groups = groupManualEventsByDate(events);
  assert.deepEqual(groups.map((g) => g.date), ["2026-06-02", "2026-06-01"]);
  assert.equal(groups[1].events.length, 2);
});

test("sortManualHistorial keeps revisado events (unlike manualNovedades) and is stable most-recent-first", () => {
  const events = [
    makeEvent({ eventId: "a", summary: "a", approvedAt: "2026-06-01T00:00:00.000Z" }),
    makeEvent({ eventId: "b", summary: "b", changeKind: "revisado", approvedAt: "2026-06-05T00:00:00.000Z" }),
  ];
  const sorted = sortManualHistorial(events);
  assert.deepEqual(sorted.map((e) => e.eventId), ["b", "a"]);
});

test("the bundled update history parses cleanly and stays internally consistent", () => {
  const events = asManualUpdateEvents(snapshot.content.updates);
  assert.ok(events.length > 1000);
  assert.equal(new Set(events.map((e) => e.eventId)).size, events.length);
  const recomputed = applyManualRecencyWindow(events, new Date("2026-09-05T00:00:00.000Z"));
  assert.ok(recomputed.every((e) => typeof e.isRecent === "boolean"));
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  getAdjacentProcedures,
  getAllProcedures,
  getProcedureById,
  getProcedureBySlug,
  getProcedureCatalog,
  getProcedureMeta,
  getProcedureRouteData,
  getRelatedProcedures,
  getBacklinkProcedures,
  getSuggestedProcedures,
} from "../lib/content.ts";

test("procedure catalog indexes preserve lookup identity and ordered projections", () => {
  const catalog = getProcedureCatalog();
  const procedures = getAllProcedures();
  const sample = procedures.find((procedure) => procedure.id === "305_02");

  assert.ok(sample);
  assert.equal(catalog.byId.get(sample.id), sample);
  assert.equal(catalog.bySlug.get(sample.slug), sample);
  assert.equal(getProcedureById(sample.id), sample);
  assert.equal(getProcedureBySlug(sample.slug), sample);
  assert.deepEqual(catalog.nav.map((procedure) => procedure.id), procedures.map((procedure) => procedure.id));
  assert.deepEqual(catalog.metadata.map((procedure) => procedure.id), getProcedureMeta().map((procedure) => procedure.id));
  assert.deepEqual(
    getAdjacentProcedures(sample.id),
    {
      prev: catalog.metadata[catalog.indexById.get(sample.id)! - 1],
      next: catalog.metadata[catalog.indexById.get(sample.id)! + 1],
    },
  );
});

test("route data uses narrow relation views and preserves compatibility helper output", () => {
  const sample = getAllProcedures().find((procedure) => procedure.id === "305_02");
  assert.ok(sample);
  const route = getProcedureRouteData(sample.slug);
  assert.ok(route);

  assert.deepEqual(route.related.map((procedure) => procedure.id), getRelatedProcedures(sample).map((procedure) => procedure.id));
  assert.deepEqual(route.backlinks.map((procedure) => procedure.id), getBacklinkProcedures(sample).map((procedure) => procedure.id));
  assert.deepEqual(route.suggested.map((procedure) => procedure.id), getSuggestedProcedures(sample).map((procedure) => procedure.id));
  assert.deepEqual(route.validProcedureIds, getAllProcedures().map((procedure) => procedure.id));

  for (const procedure of [...route.procedureNav, ...route.related, ...route.backlinks, ...route.suggested]) {
    assert.deepEqual(Object.keys(procedure).sort(), ["id", "section", "slug", "title"]);
  }

  const linkedIds = new Set([
    ...route.related.map((procedure) => procedure.id),
    ...route.backlinks.map((procedure) => procedure.id),
    ...route.suggested.map((procedure) => procedure.id),
  ]);
  assert.deepEqual(new Set(Object.keys(route.previewByProcedureId)), linkedIds);
  assert.equal("searchText" in route.related[0]!, false);
  assert.equal("content" in route.related[0]!, false);
});

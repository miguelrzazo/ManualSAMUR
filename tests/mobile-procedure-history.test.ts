import test from "node:test";
import assert from "node:assert/strict";
import {
  buildProcedureHistoryModel,
  PROCEDURE_HISTORY_EMPTY_MESSAGE,
  PROCEDURE_HISTORY_TITLE,
  procedureHistoryChangeLabel,
  procedureHistoryDiff,
  selectProcedureHistory,
} from "../apps/mobile/src/procedure-history-logic.ts";
import type { ManualUpdateEvent } from "../apps/mobile/src/manual-tree-logic.ts";

function event(overrides: Partial<ManualUpdateEvent> & Pick<ManualUpdateEvent, "eventId" | "summary">): ManualUpdateEvent {
  return {
    procedureIds: ["101"],
    changeKind: "actualizado",
    effectiveDate: "2026-01-01",
    ...overrides,
  };
}

test("procedure history strictly filters the global stream to the current procedure id", () => {
  const selected = selectProcedureHistory([
    event({ eventId: "exact", summary: "Exacto", procedureIds: ["101"] }),
    event({ eventId: "shared", summary: "Compartido", procedureIds: ["101", "102"] }),
    event({ eventId: "prefix", summary: "Prefijo", procedureIds: ["101a"] }),
    event({ eventId: "other", summary: "Otro", procedureIds: ["102"] }),
  ], "101");

  assert.deepEqual(selected.map((item) => item.eventId), ["shared", "exact"]);
});

test("procedure history orders newest first using approval date before effective date", () => {
  const selected = selectProcedureHistory([
    event({ eventId: "old", summary: "Antiguo", effectiveDate: "2026-02-01" }),
    event({ eventId: "new", summary: "Nuevo", effectiveDate: "2026-03-01" }),
    event({ eventId: "approved", summary: "Aprobado", effectiveDate: "2025-01-01", approvedAt: "2026-04-01T10:00:00Z" }),
  ], "101");

  assert.deepEqual(selected.map((item) => item.eventId), ["approved", "new", "old"]);
});

test("procedure history rejects malformed update input at its runtime boundary", () => {
  assert.deepEqual(selectProcedureHistory(null, "101"), []);
  assert.deepEqual(selectProcedureHistory({ updates: [] }, "101"), []);
  assert.deepEqual(selectProcedureHistory([
    null,
    { eventId: "missing-summary", procedureIds: ["101"] },
    { eventId: "bad-procedures", summary: "No enlazado", procedureIds: "101" },
    { eventId: "valid", summary: "Válido", procedureIds: ["101"] },
  ], "101").map((item) => item.eventId), ["valid"]);
});

test("known change kinds have Spanish labels and unknown kinds get a readable fallback", () => {
  assert.equal(procedureHistoryChangeLabel("nuevo"), "Nuevo");
  assert.equal(procedureHistoryChangeLabel("actualizado"), "Actualizado");
  assert.equal(procedureHistoryChangeLabel("revisado"), "Revisado");
  assert.equal(procedureHistoryChangeLabel("eliminado"), "Eliminado");
  assert.equal(procedureHistoryChangeLabel("sync"), "Sincronizado");
  assert.equal(procedureHistoryChangeLabel("correccion editorial"), "Correccion editorial");
});

test("the view-model contract always describes the section and its empty state", () => {
  const model = buildProcedureHistoryModel([], "101");
  assert.equal(model.title, PROCEDURE_HISTORY_TITLE);
  assert.equal(model.title, "Historial de este procedimiento");
  assert.equal(model.emptyMessage, PROCEDURE_HISTORY_EMPTY_MESSAGE);
  assert.equal(model.emptyMessage, "Sin cambios registrados");
  assert.deepEqual(model.items, []);
});

test("diff handling trims meaningful text and omits blank disclosure controls", () => {
  assert.equal(procedureHistoryDiff(event({ eventId: "diff", summary: "Con diff", diff: "  - antes\n+ después  " })), "- antes\n+ después");
  assert.equal(procedureHistoryDiff(event({ eventId: "blank", summary: "Vacío", diff: " \n " })), undefined);
  assert.equal(procedureHistoryDiff(event({ eventId: "absent", summary: "Ausente" })), undefined);

  const model = buildProcedureHistoryModel([
    event({ eventId: "with", summary: "Con", diff: " detalle " }),
    event({ eventId: "without", summary: "Sin", diff: " " }),
  ], "101");
  assert.equal(model.items.find((item) => item.event.eventId === "with")?.diff, "detalle");
  assert.equal(model.items.find((item) => item.event.eventId === "without")?.diff, undefined);
});

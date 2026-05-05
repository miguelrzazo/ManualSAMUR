import test from "node:test";
import assert from "node:assert/strict";

import {
  buildManualRelationsAudit,
  buildOutgoingRelations,
  buildSuggestedRelations,
  filterTableOfContentsHeadings,
  type ProcedureRelation,
} from "../lib/manual-data.ts";

test("buildOutgoingRelations classifies editorial, content-link and safe-mention relations", () => {
  const relations = buildOutgoingRelations({
    procedureId: "999",
    editorialIds: ["214d"],
    rawContent: `
Vea [Urgencias psiquiátricas](311.htm).
Active Código 19 si procede.
`,
    normalizedContent: `
Vea [Urgencias psiquiátricas](/manual/311-urgencias-psiquiatricas).
Active [Código 19](/manual/214e-codigo-19-codigo-tep) si procede.
`,
    validIds: new Set(["214d", "311", "214e"]),
    slugToId: new Map([
      ["214d-codigo-100", "214d"],
      ["311-urgencias-psiquiatricas", "311"],
      ["214e-codigo-19-codigo-tep", "214e"],
    ]),
  });

  assert.deepEqual(relations, [
    { id: "214d", direction: "outgoing", kind: "editorial", strength: "strong" },
    { id: "311", direction: "outgoing", kind: "content-link", strength: "strong" },
    { id: "214e", direction: "outgoing", kind: "safe-mention", strength: "medium" },
  ] satisfies ProcedureRelation[]);
});

test("buildSuggestedRelations only suggests conservative same-family or subgroup siblings", () => {
  const suggestions = buildSuggestedRelations(
    {
      id: "214e",
      section: "Operativos",
      sidebarGroup: "Códigos especiales",
      sidebarSubgroup: "Protocolos de activación",
      related: ["214d"],
      backlinks: [],
    },
    [
      {
        id: "214d",
        section: "Operativos",
        sidebarGroup: "Códigos especiales",
        sidebarSubgroup: "Protocolos de activación",
        related: [],
        backlinks: [],
      },
      {
        id: "214f",
        section: "Operativos",
        sidebarGroup: "Códigos especiales",
        sidebarSubgroup: "Protocolos de activación",
        related: [],
        backlinks: [],
      },
      {
        id: "217_03",
        section: "Operativos",
        sidebarGroup: "Coordinación interservicios",
        sidebarSubgroup: "Actuaciones conjuntas",
        related: [],
        backlinks: [],
      },
      {
        id: "311",
        section: "SVA",
        sidebarGroup: "Urgencias específicas",
        sidebarSubgroup: "Urgencias psiquiátricas",
        related: [],
        backlinks: [],
      },
    ],
  );

  assert.deepEqual(suggestions, [
    { id: "214f", direction: "outgoing", kind: "suggested", strength: "medium" },
  ] satisfies ProcedureRelation[]);
});

test("buildManualRelationsAudit reports isolated notes and pending suggestions", () => {
  const audit = buildManualRelationsAudit([
    {
      id: "214d",
      title: "Código 100",
      related: ["311"],
      backlinks: [],
      relations: [
        { id: "311", direction: "outgoing", kind: "editorial", strength: "strong" },
      ],
    },
    {
      id: "214e",
      title: "Código 19",
      related: [],
      backlinks: [],
      relations: [
        { id: "214f", direction: "outgoing", kind: "suggested", strength: "medium" },
      ],
    },
    {
      id: "311",
      title: "Urgencias psiquiátricas",
      related: [],
      backlinks: ["214d"],
      relations: [
        { id: "214d", direction: "incoming", kind: "editorial", strength: "strong" },
      ],
    },
  ]);

  assert.deepEqual(audit.withoutOutgoing, ["214e", "311"]);
  assert.deepEqual(audit.withoutBacklinks, ["214d", "214e"]);
  assert.deepEqual(audit.suggestedPending, [
    { id: "214e", title: "Código 19", suggestedIds: ["214f"] },
  ]);
});

test("filterTableOfContentsHeadings removes title duplicates and empty headings", () => {
  const headings = filterTableOfContentsHeadings(
    [
      { id: "tecnicas-de-comunicacion", text: "Técnicas de comunicación", level: 2 },
      { id: "consideraciones", text: "Consideraciones generales", level: 2 },
      { id: "detalle", text: "  ", level: 3 },
      { id: "cierre", text: "Recomendaciones finales", level: 3 },
    ],
    "Técnicas de comunicación",
  );

  assert.deepEqual(headings, [
    { id: "consideraciones", text: "Consideraciones generales", level: 2 },
    { id: "cierre", text: "Recomendaciones finales", level: 3 },
  ]);
});

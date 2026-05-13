import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCodeHref,
  buildManualRelationsIndex,
  extractCodeReferences,
} from "../lib/manual-relations-index.ts";

const procedure = {
  id: "309_02",
  title: "Síndrome coronario agudo con elevación del ST",
  section: "SVA",
  sidebarGroup: "Urgencias específicas",
  sidebarSubgroup: "Urgencias cardiovasculares",
  slug: "309_02-sindrome-coronario-agudo-con-elevacion-del-st-scacest",
  tags: [],
  synonyms: [],
  related: [],
  backlinks: [],
  relations: [],
  updated: "",
  sourceUpdated: "",
  contentHash: "",
  source: "",
  attachments: [],
  editorialBlocks: [],
  searchText: "Active Código infarto y administre Adrenalina.",
  content: `
## Tratamiento
Active Código infarto y valore Código 16.
Administre <DrugLink name="Adrenalina" /> según situación clínica.
`,
};

test("buildCodeHref creates query-addressable code URLs", () => {
  assert.equal(
    buildCodeHref({ code: "16", tab: "incidente", name: "Código SCASEST" }),
    "/codigos?tab=incidente&code=16",
  );
  assert.equal(
    buildCodeHref({ code: "0", tab: "otros", subtab: "claves", name: "Recurso operativo" }),
    "/codigos?tab=otros&subtab=claves&code=0",
  );
});

test("extractCodeReferences detects only conservative code mentions", () => {
  const refs = extractCodeReferences(
    "Active Código infarto, Código 16 y clave 0. Código 999 no debe enlazar.",
    [
      { code: "11", name: "Código infarto", tab: "incidente" },
      { code: "16", name: "Código SCASEST", tab: "incidente" },
      { code: "0", name: "Recurso operativo", tab: "otros", subtab: "claves" },
    ],
  );

  assert.deepEqual(
    refs.map((ref) => [ref.code, ref.label, ref.href]),
    [
      ["11", "Código infarto", "/codigos?tab=incidente&code=11"],
      ["16", "Código 16", "/codigos?tab=incidente&code=16"],
      ["0", "Clave 0", "/codigos?tab=otros&subtab=claves&code=0"],
    ],
  );
});

test("buildManualRelationsIndex returns procedure drug/code refs and reverse drug mentions", () => {
  const index = buildManualRelationsIndex({
    procedures: [procedure],
    drugs: [
      {
        id: "adrenalina",
        name: "Adrenalina",
        synonyms: [],
        category: "Cardiovascular",
        subcategory: "Vasoactivos",
      },
    ],
    codes: [
      { code: "11", name: "Código infarto", tab: "incidente" },
      { code: "16", name: "Código SCASEST", tab: "incidente" },
    ],
  });

  assert.deepEqual(index.procedures["309_02"]?.drugIds, ["adrenalina"]);
  assert.deepEqual(index.procedures["309_02"]?.codeRefs.map((ref) => ref.code), ["11", "16"]);
  assert.equal(index.drugs.adrenalina?.[0]?.procedureId, "309_02");
  assert.match(index.procedures["309_02"]?.preview ?? "", /Active Código infarto/);
});

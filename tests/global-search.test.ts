import test from "node:test";
import assert from "node:assert/strict";

import { globalSearch } from "../lib/global-search.ts";

test("globalSearch returns matching procedures alongside other result types", async () => {
  const procedures = [
    {
      id: "301",
      title: "Parada cardiorrespiratoria",
      section: "SVA",
      sidebarGroup: "Reanimación y vía aérea",
      sidebarSubgroup: "Críticos",
      slug: "301-parada-cardiorrespiratoria",
      tags: ["PCR"],
      synonyms: ["rcp", "parada cardiorrespiratoria"],
      related: [],
      backlinks: [],
      updated: "",
      sourceUpdated: "",
      contentHash: "",
      attachments: [],
      editorialBlocks: [],
      searchText: "parada cardiorrespiratoria rcp desfibrilacion",
    },
  ];

  const drugs = [
    {
      id: "adrenalina",
      name: "Adrenalina",
      synonyms: ["Epinefrina"],
      category: "Cardiovascular",
      subcategory: "Vasoactivos",
      indication: "PCR",
      presentation: "1 mg/1 ml",
    },
  ];

  const codes = [
    {
      code: "13",
      name: "Ictus agudo",
      group: "Específicos",
      category: "Específicos",
      description: "Código ictus",
    },
  ];

  const hospitals = [
    {
      id: "HGM",
      name: "Hospital Gregorio Marañón",
      shortName: "Gregorio Marañón",
      address: "C/ Ibiza, 47",
      district: "Retiro",
    },
  ];

  const procedureResults = await globalSearch("rcp", procedures, drugs, codes, hospitals);
  assert.equal(procedureResults[0]?.type, "procedure");
  assert.equal(procedureResults[0]?.id, "301");
  assert.equal(procedureResults[0]?.href, "/manual/301-parada-cardiorrespiratoria");
  assert.equal(procedureResults[0]?.matchedField, "synonyms");
  assert.equal(procedureResults[0]?.snippet, undefined);

  const drugResults = await globalSearch("epinefrina", procedures, drugs, codes, hospitals);
  assert.equal(drugResults[0]?.type, "drug");
  assert.equal(drugResults[0]?.href, "/vademecum?farmaco=adrenalina");
});

test("globalSearch returns contextual snippets for procedure content matches", async () => {
  const procedures = [
    {
      id: "410",
      title: "Insuficiencia respiratoria aguda",
      section: "SVB",
      sidebarGroup: "Respiratorio",
      sidebarSubgroup: "Críticos",
      slug: "410-insuficiencia-respiratoria-aguda",
      tags: ["oxígeno"],
      synonyms: ["disnea"],
      related: [],
      backlinks: [],
      updated: "",
      sourceUpdated: "",
      contentHash: "",
      attachments: [],
      editorialBlocks: [],
      searchText: "Evalúe la fatiga respiratoria y la aparición de silencio auscultatorio antes del traslado.",
    },
  ];

  const results = await globalSearch("silencio auscultatorio", procedures, [], [], []);

  assert.equal(results[0]?.type, "procedure");
  assert.equal(results[0]?.matchedField, "searchText");
  assert.ok(results[0]?.snippet);
  assert.match(results[0]!.snippet!.text, /silencio auscultatorio/i);
  assert.equal(results[0]!.snippet!.highlights.length, 2);
});

test("globalSearch orders groups dynamically by the strongest match", async () => {
  const procedures = [
    {
      id: "113",
      title: "Coordinación de incidentes",
      section: "Operativos",
      sidebarGroup: "General",
      sidebarSubgroup: "General",
      slug: "113-coordinacion-de-incidentes",
      tags: ["mando"],
      synonyms: ["incidentes"],
      related: [],
      backlinks: [],
      updated: "",
      sourceUpdated: "",
      contentHash: "",
      attachments: [],
      editorialBlocks: [],
      searchText: "El procedimiento 13 se notificará a la central cuando corresponda.",
    },
  ];

  const drugs = [
    {
      id: "amiodarona",
      name: "Amiodarona",
      synonyms: ["antiarrítmico"],
      category: "Cardiovascular",
      subcategory: "Antiarrítmicos",
      indication: "Taquicardia",
      presentation: "150 mg",
    },
  ];

  const codes = [
    {
      code: "13",
      name: "Ictus agudo",
      group: "Específicos",
      category: "Específicos",
      description: "Código ictus",
    },
  ];

  const results = await globalSearch("13", procedures, drugs, codes, []);

  assert.equal(results[0]?.type, "code");
  assert.equal(results[0]?.id, "13");
  assert.equal(results[1]?.type, "procedure");
});

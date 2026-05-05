import test from "node:test";
import assert from "node:assert/strict";

import { buildSnippet, search } from "../lib/search.ts";

const procedures = [
  {
    id: "301",
    title: "Arritmia inestable",
    section: "SVA",
    sidebarGroup: "Cardiología",
    sidebarSubgroup: "Críticos",
    slug: "301-arritmia-inestable",
    tags: ["taquicardia"],
    synonyms: ["cardioversion"],
    related: [],
    backlinks: [],
    updated: "",
    sourceUpdated: "",
    contentHash: "",
    attachments: [],
    editorialBlocks: [],
    searchText: "Manejo de la taquicardia inestable con sedación y cardioversión sincronizada.",
  },
  {
    id: "302",
    title: "Paciente crítico indiferenciado",
    section: "SVA",
    sidebarGroup: "Cardiología",
    sidebarSubgroup: "Críticos",
    slug: "302-paciente-critico-indiferenciado",
    tags: ["estabilización"],
    synonyms: ["shock"],
    related: [],
    backlinks: [],
    updated: "",
    sourceUpdated: "",
    contentHash: "",
    attachments: [],
    editorialBlocks: [],
    searchText: "Si existe arritmia con compromiso hemodinámico, prepare cardioversión inmediata.",
  },
] as const;

test("search prioritizes title matches above content-only matches", () => {
  const results = search("arritmia", [...procedures]);

  assert.equal(results[0]?.item.id, "301");
  assert.equal(results[0]?.matchedField, "title");
  assert.equal(results[1]?.item.id, "302");
  assert.equal(results[1]?.matchedField, "searchText");
});

test("search returns content snippets for content-only matches", () => {
  const results = search("hemodinámico", [...procedures]);

  assert.equal(results[0]?.item.id, "302");
  assert.equal(results[0]?.matchedField, "searchText");
  assert.ok(results[0]?.snippet);
  assert.match(results[0]!.snippet!.text, /compromiso hemodinámico/i);
  assert.equal(results[0]!.snippet!.highlights.length, 1);
});

test("buildSnippet returns contextual text with ellipsis and multiple highlights", () => {
  const snippet = buildSnippet(
    "En la fase inicial de la asistencia avanzada se hará una valoración completa del entorno y de la seguridad de la escena antes de iniciar maniobras avanzadas con adrenalina precoz y compresiones torácicas de alta calidad mantenidas durante todo el ciclo.",
    "adrenalina calidad"
  );

  assert.ok(snippet);
  assert.match(snippet!.text, /^…/);
  assert.match(snippet!.text, /adrenalina/i);
  assert.match(snippet!.text, /calidad/i);
  assert.equal(snippet!.highlights.length, 2);

  const highlightTerms = snippet!.highlights.map(([start, end]) => snippet!.text.slice(start, end).toLowerCase());
  assert.deepEqual(highlightTerms, ["adrenalina", "calidad"]);
});

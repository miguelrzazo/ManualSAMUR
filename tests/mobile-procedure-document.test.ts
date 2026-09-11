import assert from "node:assert/strict";
import test from "node:test";
import {
  activeHeadingIdAtOffset,
  parseProcedureDocument,
} from "../apps/mobile/src/procedure-document.ts";
import { findProcedureMatches } from "../apps/mobile/src/procedure-find-logic.ts";
import type { MobileAttachment, MobileProcedure } from "../packages/manual-content/src/index.ts";

function attachment(id: string, localPath: string, kind: MobileAttachment["kind"]): MobileAttachment {
  return { id, localPath, kind, filename: `${id}.${kind === "image" ? "png" : "pdf"}`, sourceUrl: `https://example.test/${id}` };
}

function procedure(overrides: Partial<MobileProcedure> = {}): MobileProcedure {
  return {
    id: "301",
    title: "Parada cardiorrespiratoria",
    section: "SVA",
    slug: "parada-cardiorrespiratoria",
    routeKey: "procedure:301",
    tags: [],
    synonyms: [],
    related: [],
    backlinks: [],
    relations: [
      { id: "302", direction: "outgoing", kind: "related", strength: "strong" },
      { id: "303", direction: "incoming", kind: "related", strength: "strong" },
      { id: "304", direction: "outgoing", kind: "suggested", strength: "weak" },
    ],
    editorialBlocks: [],
    updated: "",
    sourceUpdated: "",
    attachments: [
      attachment("figure-inline", "/images/procedures/301/figure.png", "image"),
      attachment("figure-list", "/images/procedures/301/other.png", "image"),
      attachment("annex", "/docs/procedures/301/annex.pdf", "pdf"),
    ],
    content: [
      "## Valoración inicial",
      "",
      "Comprueba la vía aérea.",
      "![](/images/procedures/301/figure.png)",
      "",
      "### Tratamiento",
      "",
      "Administra oxígeno.",
    ].join("\n"),
    searchText: "",
    ...overrides,
  };
}

test("parsed procedure documents cache reader sections, find text, navigation, and assets", () => {
  const related = [procedure({ id: "302", title: "Salida" }), procedure({ id: "303", title: "Entrada" })];
  const document = parseProcedureDocument(procedure(), related);

  assert.deepEqual(document.headings.map((heading) => heading.text), ["Valoración inicial", "Tratamiento"]);
  assert.equal(document.renderSections[0].blocks.some((block) => block.kind === "image"), true);
  assert.equal(findProcedureMatches(document, "vía aérea")[0]?.blockKey, "valoracion-inicial-1");
  assert.equal(findProcedureMatches(document, "figure.png").length, 0);
  assert.deepEqual(document.navigation.outgoing.map((item) => item.id), ["302"]);
  assert.deepEqual(document.navigation.incoming.map((item) => item.id), ["303"]);
  assert.deepEqual(document.navigation.unresolvedRelatedIds, []);
  assert.deepEqual(document.rendering.imageAttachments.map((item) => item.id), ["figure-list"]);
  assert.deepEqual(document.rendering.documentAttachments.map((item) => item.id), ["annex"]);
  assert.equal(document.assets.attachmentsByLocalPath.get("/images/procedures/301/figure.png")?.id, "figure-inline");
});

test("active heading lookup uses measured document-order offsets", () => {
  const offsets = [
    { id: "first", offset: 100 },
    { id: "second", offset: 240 },
    { id: "third", offset: 510 },
  ];
  assert.equal(activeHeadingIdAtOffset(offsets, 99), null);
  assert.equal(activeHeadingIdAtOffset(offsets, 240), "second");
  assert.equal(activeHeadingIdAtOffset(offsets, 999), "third");
});

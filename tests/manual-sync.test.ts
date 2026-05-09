import test from "node:test";
import assert from "node:assert/strict";

import {
  applyNewThisWeek,
  buildTickerFromEvents,
  DEFAULT_MANUAL_VERSION,
  appendSyncRun,
  classifyProcedureChange,
  extractAttachmentLinks,
  parseProcedureSpacesXml,
  rewriteAttachmentLinks,
  resolveStableProcedureId,
  resolveStableProcedureIdForSource,
  stableContentHash,
} from "../lib/manual-sync.ts";

test("stableContentHash ignores insignificant whitespace changes", () => {
  assert.equal(
    stableContentHash("## Título\n\nDosis:  1 mg\n"),
    stableContentHash("## Título\r\n\r\nDosis: 1 mg"),
  );
});

test("classifyProcedureChange detects new, unchanged and updated procedures", () => {
  const incoming = {
    id: "301",
    title: "Parada cardiorrespiratoria",
    source: "https://servpub.madrid.es/manualsamur/bin/view/SVA/301/WebHome",
    sourceUpdated: "2026-04-01",
    contentHash: "hash-a",
    attachments: [],
  };

  assert.equal(classifyProcedureChange(null, incoming), "created");
  assert.equal(classifyProcedureChange({ ...incoming }, incoming), "unchanged");
  assert.equal(classifyProcedureChange({ ...incoming, contentHash: "hash-old" }, incoming), "updated");
  assert.equal(classifyProcedureChange({ ...incoming, sourceUpdated: "2026-03-01" }, incoming), "updated");
});

test("appendSyncRun keeps newest run first, derives ticker items and preserves manual version", () => {
  const metadata = appendSyncRun(
    {
      manualVersionCurrent: DEFAULT_MANUAL_VERSION,
      manualVersion: DEFAULT_MANUAL_VERSION,
      lastSyncAt: "",
      lastApprovedAt: "",
      ticker: { enabledUntil: "", items: [] },
      tickerEnabled: false,
      tickerItems: [],
      pendingChanges: [],
      approvedChanges: [],
      globalUpdateTimeline: [],
      runs: [],
    },
    {
      id: "2026-05-05T10:00:00.000Z",
      startedAt: "2026-05-05T10:00:00.000Z",
      finishedAt: "2026-05-05T10:02:00.000Z",
      dryRun: false,
      summary: {
        procedures: { discovered: 3, created: 1, updated: 1, unchanged: 1, failed: 0, skipped: 0 },
        vademecum: { created: 0, updated: 1, unchanged: 30, failed: 0, skipped: 0 },
        codigos: { created: 0, updated: 0, unchanged: 9, failed: 0, skipped: 0 },
        main: { created: 0, updated: 1, unchanged: 2, failed: 0, skipped: 0 },
      },
      changes: {
        procedures: [
          { id: "301", title: "Parada cardiorrespiratoria", changeType: "updated" },
          { id: "codigo-19", title: "Código 19", changeType: "created" },
        ],
        vademecum: [{ id: "urapidil", title: "Urapidil", changeType: "updated" }],
        codigos: [],
        main: [{ id: "content/data/abreviaturas.json", title: "abreviaturas.json", changeType: "updated" }],
      },
      errors: [],
    },
  );

  assert.equal(metadata.manualVersion, "Abril 2026");
  assert.equal(metadata.manualVersionCurrent, "Abril 2026");
  assert.equal(metadata.lastSyncAt, "2026-05-05T10:02:00.000Z");
  assert.equal(metadata.tickerEnabled, true);
  assert.deepEqual(metadata.tickerItems, [
    "Actualizado: 301 Parada cardiorrespiratoria",
    "Nuevo: codigo-19 Código 19",
  ]);
  assert.equal(metadata.ticker.items.length, 2);
  assert.equal(metadata.runs.length, 1);
});

test("applyNewThisWeek marks only events approved within the last 7 days", () => {
  const now = new Date("2026-05-09T12:00:00.000Z");
  const events = applyNewThisWeek([
    {
      eventId: "a",
      origin: "wiki",
      procedureIds: ["301"],
      changeKind: "actualizado",
      summary: "A",
      effectiveDate: "2026-05-09",
      approvedAt: "2026-05-08T10:00:00.000Z",
      isNewThisWeek: false,
    },
    {
      eventId: "b",
      origin: "wiki",
      procedureIds: ["302"],
      changeKind: "actualizado",
      summary: "B",
      effectiveDate: "2026-05-01",
      approvedAt: "2026-04-20T10:00:00.000Z",
      isNewThisWeek: false,
    },
  ], now);

  assert.equal(events[0].isNewThisWeek, true);
  assert.equal(events[1].isNewThisWeek, false);
});

test("buildTickerFromEvents enables ribbon for seven days from latest approved event", () => {
  const data = buildTickerFromEvents([
    {
      eventId: "a",
      origin: "wiki",
      procedureIds: ["301"],
      changeKind: "actualizado",
      summary: "Actualizado: 301",
      effectiveDate: "2026-05-09",
      approvedAt: "2026-05-09T10:00:00.000Z",
      isNewThisWeek: true,
    },
  ], new Date("2026-05-10T10:00:00.000Z"));

  assert.equal(data.tickerEnabled, true);
  assert.equal(data.ticker.items[0]?.href, "/manual?procedure=301#update-a");
});

test("parseProcedureSpacesXml filters XWiki containers and keeps procedure-like spaces", () => {
  const xml = `
    <spaces>
      <space><name>Procedimientos SVA</name><xwikiAbsoluteUrl>https://servpub.madrid.es/manualsamur/bin/view/Procedimientos%20SVA/WebHome</xwikiAbsoluteUrl></space>
      <space><name>Parada cardiorrespiratoria</name><xwikiAbsoluteUrl>https://servpub.madrid.es/manualsamur/bin/view/Procedimientos%20SVA/Parada%20cardiorrespiratoria/WebHome</xwikiAbsoluteUrl></space>
      <space><name>Desfibrilación</name><xwikiAbsoluteUrl>https://servpub.madrid.es/manualsamur/bin/view/T%C3%A9cnicas/Cardiacos/Desfibrilaci%C3%B3n/WebHome</xwikiAbsoluteUrl></space>
      <space><name>WebHome</name><xwikiAbsoluteUrl>https://servpub.madrid.es/manualsamur/bin/view/Menu/WebHome</xwikiAbsoluteUrl></space>
    </spaces>
  `;

  assert.deepEqual(
    parseProcedureSpacesXml(xml).map((space) => [space.title, space.section]),
    [
      ["Parada cardiorrespiratoria", "SVA"],
      ["Desfibrilación", "Técnicas"],
    ],
  );
});

test("extractAttachmentLinks and rewriteAttachmentLinks map official images and PDFs to local paths", () => {
  const sourceUrl = "https://servpub.madrid.es/manualsamur/bin/view/Procedimientos%20SVA/Parada";
  const markdown = `
    [[Figura>>attach:algoritmo inicial.png||target="_blank"]]
    [[Anexo>>https://servpub.madrid.es/manualsamur/bin/download/Procedimientos%20SVA/Parada/WebHome/anexo.pdf]]
    image:foto.jpeg||alt="Foto"
  `;

  const attachments = extractAttachmentLinks(markdown, sourceUrl, "301");

  assert.deepEqual(attachments, [
    {
      sourceUrl: "https://servpub.madrid.es/manualsamur/bin/download/Procedimientos%20SVA/Parada/WebHome/algoritmo%20inicial.png",
      localPath: "/images/procedures/301/algoritmo-inicial.png",
      kind: "image",
    },
    {
      sourceUrl: "https://servpub.madrid.es/manualsamur/bin/download/Procedimientos%20SVA/Parada/WebHome/foto.jpeg",
      localPath: "/images/procedures/301/foto.jpeg",
      kind: "image",
    },
    {
      sourceUrl: "https://servpub.madrid.es/manualsamur/bin/download/Procedimientos%20SVA/Parada/WebHome/anexo.pdf",
      localPath: "/docs/procedures/301/anexo.pdf",
      kind: "pdf",
    },
  ]);
  assert.match(rewriteAttachmentLinks(markdown, attachments), /\/images\/procedures\/301\/algoritmo-inicial\.png/);
  assert.match(rewriteAttachmentLinks(markdown, attachments), /\/docs\/procedures\/301\/anexo\.pdf/);
  assert.match(rewriteAttachmentLinks(markdown, attachments), /!\[\]\(\/images\/procedures\/301\/foto\.jpeg\)/);
});

test("resolveStableProcedureId prefers known SAMUR procedure codes over title slugs", () => {
  assert.equal(resolveStableProcedureId("Código Crisis"), "214g");
  assert.equal(resolveStableProcedureId("Código VISNNA"), "214h");
  assert.equal(resolveStableProcedureId("Código 18: Código SEPSIS"), "214f");
  assert.equal(resolveStableProcedureId("Hiponatremia"), "312_02b");
  assert.equal(resolveStableProcedureId("Manejo avanzado de vía aérea"), "302");
  assert.equal(resolveStableProcedureId("Síndrome Coronario Agudo sin elevación del SR (SCACEST)"), "309_02b");
  assert.equal(resolveStableProcedureId("Código 15.1"), "214c");
  assert.equal(resolveStableProcedureId("Procedimiento desconocido"), null);
});

test("resolveStableProcedureIdForSource disambiguates repeated SVA and SVB titles", () => {
  assert.equal(
    resolveStableProcedureIdForSource(
      "Valoración inicial del paciente politraumatizado",
      "https://servpub.madrid.es/manualsamur/bin/view/Procedimientos%20asistenciales/Procedimientos%20SVA/Urgencias%20traumatol%C3%B3gicas/Valoraci%C3%B3n%20inicial%20del%20paciente%20politraumatizado/",
    ),
    "304_01",
  );
  assert.equal(
    resolveStableProcedureIdForSource(
      "Valoración inicial del paciente politraumatizado",
      "https://servpub.madrid.es/manualsamur/bin/view/Procedimientos%20asistenciales/Procedimientos%20SVB/Traumatismos/Valoraci%C3%B3n%20inicial%20del%20paciente%20politraumatizado/",
    ),
    "412_00",
  );
  assert.equal(
    resolveStableProcedureIdForSource(
      "Valoración del niño grave",
      "https://servpub.madrid.es/manualsamur/bin/view/Procedimientos%20asistenciales/Procedimientos%20SVB/Valoraci%C3%B3n%20del%20ni%C3%B1o%20grave/",
    ),
    "402b",
  );
});

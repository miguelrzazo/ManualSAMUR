import test from "node:test";
import assert from "node:assert/strict";

import {
  applyRecencyWindow,
  buildTickerFromEvents,
  filterUserFacingTickerItems,
  filterUserFacingTickerEvents,
  getDefaultManualVersion,
  appendSyncRun,
  capManualUpdateEvents,
  classifyProcedureChange,
  classifyProcedureUpdateKind,
  extractAttachmentLinks,
  markAttachmentUnavailable,
  parseProcedureSpacesXml,
  rewriteAttachmentLinks,
  resolveStableProcedureId,
  resolveStableProcedureIdForSource,
  isContainerSpace,
  xwikiToMarkdown,
  stableContentHash,
} from "../lib/manual-sync.ts";
import { assertCodeDatasetIsPlausible, diffCodeDataset, CodeDatasetImplausibleError } from "../lib/codigos-sync-logic.ts";

test("stableContentHash ignores insignificant whitespace changes", () => {
  assert.equal(
    stableContentHash("## Título\n\nDosis:  1 mg\n"),
    stableContentHash("## Título\r\n\r\nDosis: 1 mg"),
  );
});

test("manual update history is capped to the newest events", () => {
  const events = Array.from({ length: 4 }, (_, index) => ({
    eventId: `event-${index}`,
    procedureIds: ["101"],
    changeKind: "nuevo" as const,
    origin: "wiki" as const,
    isRecent: false,
    summary: `Evento ${index}`,
    effectiveDate: `2026-01-0${index + 1}`,
  }));
  assert.deepEqual(capManualUpdateEvents(events, 2).map((event) => event.eventId), ["event-3", "event-2"]);
});

test("code dataset diffs emit routable per-code events and guard parser mass loss", () => {
  const before = [{ code: "13", name: "Antiguo", category: "sva" }, { code: "14", name: "Igual" }];
  const after = [{ code: "13", name: "Nuevo", category: "sva" }, { code: "15", name: "Añadido" }];
  assert.deepEqual(diffCodeDataset(before, after, "sva"), [
    { id: "code:sva:13", routeKey: "code:sva:13", title: "Nuevo", changeType: "updated", changeKind: "actualizado", category: "codigo" },
    { id: "code:sva:14", routeKey: "code:sva:14", title: "Igual", changeType: "deleted", changeKind: "eliminado", category: "codigo" },
    { id: "code:sva:15", routeKey: "code:sva:15", title: "Añadido", changeType: "created", changeKind: "nuevo", category: "codigo" },
  ]);
  assert.throws(() => assertCodeDatasetIsPlausible(10, 7), CodeDatasetImplausibleError);
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
  assert.equal(classifyProcedureChange({ ...incoming, title: "Otro título" }, incoming), "updated");
  assert.equal(
    classifyProcedureChange({ ...incoming, attachments: [{ sourceUrl: "u", localPath: "/p", kind: "pdf" }] }, incoming),
    "updated",
  );
});

test("classifyProcedureChange ignores a source date bump with identical content", () => {
  const incoming = {
    id: "301",
    title: "Parada cardiorrespiratoria",
    source: "https://servpub.madrid.es/manualsamur/bin/view/SVA/301/WebHome",
    sourceUpdated: "2026-04-01",
    contentHash: "hash-a",
    attachments: [],
  };

  // La wiki republica páginas subiendo solo la fecha. Tratarlo como cambio
  // reescribía los 230 ficheros, abría el PR mensual vacío y llenó el historial
  // de 492 entradas "revisado" sin contenido.
  assert.equal(classifyProcedureChange({ ...incoming, sourceUpdated: "2026-03-01" }, incoming), "unchanged");

  // Pero si además cambia el contenido, sigue siendo una actualización.
  assert.equal(
    classifyProcedureChange({ ...incoming, sourceUpdated: "2026-03-01", contentHash: "hash-old" }, incoming),
    "updated",
  );
});

test("classifyProcedureUpdateKind reserves revisado for editorial blocks", () => {
  const incoming = {
    id: "301",
    title: "Parada cardiorrespiratoria",
    source: "https://servpub.madrid.es/manualsamur/bin/view/SVA/301/WebHome",
    sourceUpdated: "2026-04-01",
    contentHash: "hash-a",
    attachments: [],
  };

  assert.equal(classifyProcedureUpdateKind(null, incoming, "created"), "nuevo");
  assert.equal(classifyProcedureUpdateKind({ ...incoming }, incoming, "unchanged"), "sync");
  assert.equal(classifyProcedureUpdateKind({ ...incoming, contentHash: "hash-old" }, incoming, "updated"), "actualizado");

  // "revisado" ya solo significa una cosa: origen ha cambiado y mantenemos
  // nuestra versión editada. Una subida de fecha a secas no llega hasta aquí.
  assert.equal(
    classifyProcedureUpdateKind({ ...incoming, contentHash: "hash-old" }, incoming, "blocked_by_editorial"),
    "revisado",
  );
  assert.equal(classifyProcedureUpdateKind({ ...incoming, sourceUpdated: "2026-03-01" }, incoming, "updated"), "actualizado");
});

test("the history filter keeps real changes and drops empty revisions", () => {
  // Mismo predicado que aplica update-content.yml al añadir al historial.
  const isMeaningful = (e: { changeKind: string; diff?: string }) =>
    e.changeKind !== "revisado" || Boolean(e.diff);

  assert.equal(isMeaningful({ changeKind: "actualizado" }), true);
  assert.equal(isMeaningful({ changeKind: "nuevo" }), true);
  assert.equal(isMeaningful({ changeKind: "revisado", diff: "@@ -1 +1 @@" }), true);
  assert.equal(isMeaningful({ changeKind: "revisado" }), false);
  assert.equal(isMeaningful({ changeKind: "revisado", diff: "" }), false);
});

test("appendSyncRun keeps newest run first, derives ticker items and preserves manual version", () => {
  const metadata = appendSyncRun(
    {
      manualVersionCurrent: getDefaultManualVersion(),
      manualVersion: getDefaultManualVersion(),
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

  assert.equal(metadata.manualVersion, getDefaultManualVersion());
  assert.equal(metadata.manualVersionCurrent, getDefaultManualVersion());
  assert.equal(metadata.lastSyncAt, "2026-05-05T10:02:00.000Z");
  assert.equal(metadata.tickerEnabled, true);
  assert.deepEqual(metadata.tickerItems, [
    "Actualizado: 301 Parada cardiorrespiratoria",
    "Nuevo: codigo-19 Código 19",
  ]);
  assert.equal(metadata.ticker.items.length, 2);
  assert.equal(metadata.runs.length, 1);
});

test("applyRecencyWindow marca solo lo aprobado dentro de la ventana de 30 dias", () => {
  const now = new Date("2026-05-09T12:00:00.000Z");
  const events = applyRecencyWindow([
    {
      eventId: "a",
      origin: "wiki",
      procedureIds: ["301"],
      changeKind: "actualizado",
      summary: "A",
      effectiveDate: "2026-05-09",
      approvedAt: "2026-05-08T10:00:00.000Z",
      isRecent: false,
    },
    {
      eventId: "b",
      origin: "wiki",
      procedureIds: ["302"],
      changeKind: "actualizado",
      summary: "B",
      effectiveDate: "2026-03-01",
      approvedAt: "2026-03-20T10:00:00.000Z",
      isRecent: false,
    },
  ], now);

  assert.equal(events[0].isRecent, true);
  assert.equal(events[1].isRecent, false);
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
      isRecent: true,
    },
  ], new Date("2026-05-10T10:00:00.000Z"));

  assert.equal(data.tickerEnabled, true);
  assert.equal(data.ticker.items[0]?.href, "/manual?procedure=301#update-a");
});

test("filterUserFacingTickerEvents excludes internal file and vademecum-only changes", () => {
  const events = filterUserFacingTickerEvents([
    {
      eventId: "procedure",
      origin: "wiki",
      procedureIds: ["301"],
      changeKind: "actualizado",
      summary: "Actualizado: 301",
      effectiveDate: "2026-05-09",
      approvedAt: "2026-05-09T10:00:00.000Z",
      isRecent: true,
    },
    {
      eventId: "main",
      origin: "wiki",
      procedureIds: [],
      changeKind: "actualizado",
      summary: "main actualizado: main-links.json",
      effectiveDate: "2026-05-09",
      approvedAt: "2026-05-09T10:00:00.000Z",
      isRecent: true,
    },
    {
      eventId: "vademecum",
      origin: "wiki",
      procedureIds: [],
      changeKind: "actualizado",
      summary: "vademecum actualizado: Adrenalina",
      effectiveDate: "2026-05-09",
      approvedAt: "2026-05-09T10:00:00.000Z",
      isRecent: true,
    },
    {
      eventId: "codigos",
      origin: "wiki",
      procedureIds: [],
      changeKind: "actualizado",
      summary: "codigos actualizado: Código 19",
      effectiveDate: "2026-05-09",
      approvedAt: "2026-05-09T10:00:00.000Z",
      isRecent: true,
    },
  ]);

  assert.deepEqual(events.map((event) => event.eventId), ["procedure", "codigos"]);
});

test("filterUserFacingTickerItems excludes legacy internal metadata ticker rows", () => {
  const items = filterUserFacingTickerItems([
    { label: "Main actualizado: main-links.json", href: "/manual?update=0" },
    { label: "Main actualizado: colaboradores.json", href: "/manual?update=1" },
    { label: "Actualizado: 301 Parada cardiorrespiratoria", href: "/manual?procedure=301", procedureId: "301" },
    { label: "codigos actualizado: Código 19", href: "/codigos?tab=incidente&code=19" },
  ]);

  assert.deepEqual(
    items.map((item) => item.label),
    ["Actualizado: 301 Parada cardiorrespiratoria", "codigos actualizado: Código 19"],
  );
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

test("markAttachmentUnavailable retains the local path and official source", () => {
  const attachment = { sourceUrl: "https://official.test/a.pdf", localPath: "/docs/a.pdf", kind: "pdf" as const };
  assert.deepEqual(markAttachmentUnavailable(attachment, { error: "HTTP 404" }), {
    ...attachment,
    availability: "unavailable",
    error: "HTTP 404",
  });
});

test("resolveStableProcedureId prefers known SAMUR procedure codes over title slugs", () => {
  assert.equal(resolveStableProcedureId("Código Crisis"), "214_06");
  assert.equal(resolveStableProcedureId("Código VISNNA"), "214_07");
  assert.equal(resolveStableProcedureId("Código 18: Código SEPSIS"), "214_05");
  assert.equal(resolveStableProcedureId("Hiponatremia"), "312_03");
  assert.equal(resolveStableProcedureId("Manejo avanzado de vía aérea"), "302");
  assert.equal(resolveStableProcedureId("Síndrome Coronario Agudo sin elevación del SR (SCACEST)"), "309_03");
  assert.equal(resolveStableProcedureId("Código 15.1"), "214_03");
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
    "402_01",
  );
});

/**
 * El wiki devuelve 244 espacios y solo 224 son fichas: el resto son carpetas
 * ("Urgencias cardiovasculares", "Vasculares", "Sondajes"...). La regla para
 * distinguirlas no puede ser solo "tiene hijos", porque "Actuaciones conjuntas"
 * tiene hijos (217_01..217_10) y además ES el procedimiento 217. Por eso la
 * condición lleva las dos mitades: tener hijos y no tener id.
 */
const space = (title: string, url: string) => ({ title, url, section: "SVA", depth: 3 });
const WIKI = "https://servpub.madrid.es/manualsamur/bin/view";

test("una carpeta del wiki no se confunde con una ficha, ni al reves", () => {
  const carpeta = space("Urgencias cardiovasculares", `${WIKI}/Procedimientos%20SVA/Urgencias%20cardiovasculares/`);
  const hija = space("Crisis hipertensivas", `${WIKI}/Procedimientos%20SVA/Urgencias%20cardiovasculares/Crisis%20hipertensivas/`);
  const hoja = space("Disturbios urbanos", `${WIKI}/Procedimientos%20Operativos/Disturbios%20urbanos/`);
  const all = [carpeta, hija, hoja];
  const sinId = () => false;

  assert.equal(isContainerSpace(carpeta, all, sinId), true, "tiene hijos y no tiene id: es carpeta");
  assert.equal(isContainerSpace(hija, all, sinId), false, "no tiene hijos: es ficha");
  assert.equal(isContainerSpace(hoja, all, sinId), false, "sin hijos ni id: sigue siendo ficha");

  // La mitad que importa: un espacio con id es ficha aunque tenga hijos.
  const conId = (candidate: { title: string }) => candidate.title === "Urgencias cardiovasculares";
  assert.equal(isContainerSpace(carpeta, all, conId), false, "217 tiene hijos y aun asi es un procedimiento");
});

test("el prefijo de url se compara por segmento, no por texto", () => {
  const a = space("Trauma", `${WIKI}/T%C3%A9cnicas/Trauma/`);
  const b = space("Traumatismos", `${WIKI}/T%C3%A9cnicas/Traumatismos/`);
  // "Traumatismos" empieza por "Trauma" como texto, pero no es hijo suyo.
  assert.equal(isContainerSpace(a, [a, b], () => false), false);
});

/**
 * Las tres formas de marcado de XWiki que llegaban al lector como texto literal.
 * El fragmento es marcado real de «Valoración del niño grave».
 */
test("el marcado de XWiki no se cuela en el texto de la ficha", () => {
  const raw = [
    "* (((",
    "[[image:314_00.jpg||alt=\"Triángulo de evaluación pediátrica\"]]",
    ")))",
    "[[Ver anexo - Medicación intranasal pediátrica>>attach:314_MedicacionIntranasal.pdf||target=\"_blank\"]]",
    "[[⇧ Inicio página>>doc:]]",
  ].join("\n");

  const markdown = xwikiToMarkdown(raw);

  for (const leak of [">>", "(((", ")))", "[[", "]]", "||", "Inicio página"]) {
    assert.ok(!markdown.includes(leak), `"${leak}" no puede llegar al texto: ${JSON.stringify(markdown)}`);
  }
  // El anexo conserva su enlace; `attach:` lo resuelve despues rewriteAttachmentLinks.
  assert.match(markdown, /\[Ver anexo - Medicación intranasal pediátrica\]\(attach:314_MedicacionIntranasal\.pdf\)/);
  // La imagen se queda en la forma que rewriteAttachmentLinks sabe convertir.
  assert.match(markdown, /image:314_00\.jpg/);
});

test("un enlace de anexo acaba apuntando a la ruta local, no a attach:", () => {
  const raw = '[[Ver anexo>>attach:x.pdf||target="_blank"]]';
  const url = "https://servpub.madrid.es/manualsamur/bin/view/Procedimientos%20Operativos/Algo/";
  const markdown = xwikiToMarkdown(raw);
  const attachments = extractAttachmentLinks(raw + "\n" + markdown, url, "301");
  const finalBody = rewriteAttachmentLinks(markdown, attachments);

  assert.match(finalBody, /\[Ver anexo\]\(\/docs\/procedures\/301\/x\.pdf\)/);
  assert.ok(!finalBody.includes("attach:"), "no debe quedar el esquema attach: en el cuerpo");
});

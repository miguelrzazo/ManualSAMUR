import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  buildBacklinks,
  deriveRelatedIds,
  extractCodeFamily,
  getProcedureSidebarMeta,
  normalizeProcedureContent,
  normalizeCookieIds,
} from "../lib/manual-data.ts";
import * as manualData from "../lib/manual-data.ts";
import { CODIGOS_COMMUNICATION_SUBTABS, CODIGOS_PATHOLOGY_SUBTABS, CODIGOS_TOP_LEVEL_TABS } from "../lib/codigos-config.ts";
import { VADEMECUM_TABS } from "../lib/vademecum-config.ts";

test("deriveRelatedIds keeps only existing local procedure ids from markdown links", () => {
  const ids = new Set(["104", "205", "309_02"]);
  const related = deriveRelatedIds(
    `
    Ver [uniformidad](104.htm), [informes](205.htm), [externo](https://foo.test/a),
    [otro](309_02.htm), [fantasma](999.htm), [repetido](104.htm)
    `,
    ids,
  );

  assert.deepEqual(related, ["104", "205", "309_02"]);
});

test("buildBacklinks derives incoming references from related edges", () => {
  const backlinks = buildBacklinks([
    { id: "201", related: ["205", "301"] },
    { id: "205", related: ["301"] },
    { id: "301", related: [] },
  ]);

  assert.deepEqual(backlinks, {
    "201": [],
    "205": ["201"],
    "301": ["201", "205"],
  });
});

test("extractCodeFamily groups alpha and numeric code schemes", () => {
  assert.equal(extractCodeFamily("PS.0.1"), "PS");
  assert.equal(extractCodeFamily("C.12.3"), "C");
  assert.equal(extractCodeFamily("6.1"), "6");
  assert.equal(extractCodeFamily("13"), "13");
});

test("normalizeCookieIds deduplicates, preserves valid order and caps list length", () => {
  assert.deepEqual(
    normalizeCookieIds('["301","205","301","999","201"]', new Set(["201", "205", "301"]), 3),
    ["301", "205", "201"],
  );

  assert.deepEqual(normalizeCookieIds("bad-json", new Set(["201"]), 3), []);
});

test("normalizeProcedureContent removes legacy chrome and rewrites internal manual links", () => {
  const normalized = normalizeProcedureContent(
    `
    [![Imprimir procedimiento](../images/print.gif) Central](javascript:window.print())

    Actúe según [Gestión de llamadas de emergencia](122.htm)
    y valore [Lorazepam](# "consultar vademecum").

    ![](../images/trans.gif)
    ![](../images/logo.gif)

    Manual de Procedimientos SAMUR-Protección Civil · edición 2015 0.0
    `,
    new Map([["122", "122-gestion-de-llamadas-de-emergencia"]]),
    undefined,
    {
      resolveDrugHref: (reference) =>
        reference === "Lorazepam" ? "/vademecum?farmaco=lorazepam" : null,
    },
  );

  assert.ok(!normalized.includes("javascript:window.print"));
  assert.ok(!normalized.includes("../images/trans.gif"));
  assert.ok(!normalized.includes("../images/logo.gif"));
  assert.ok(!normalized.includes("Manual de Procedimientos SAMUR-Protección Civil"));
  assert.ok(normalized.includes("/manual/122-gestion-de-llamadas-de-emergencia"));
  assert.ok(normalized.includes("[Lorazepam](/vademecum?farmaco=lorazepam)"));
});

test("normalizeProcedureContent keeps unresolved vademecum placeholders as plain text", () => {
  const normalized = normalizeProcedureContent(
    `Valore [Fármaco desconocido](# "consultar vademecum").`,
    new Map(),
    undefined,
    {
      resolveDrugHref: () => null,
    },
  );

  assert.equal(normalized, "Valore Fármaco desconocido.");
});

test("normalizeProcedureContent removes scraped procedure artifacts and preserves readable local assets", () => {
  const normalized = normalizeProcedureContent(`
Ver anexo: Algoritmo SVA>>/docs/procedures/301/301_algoritmo_SVA.pdf
* Inicio de maniobras:(((
![](/images/procedures/301/descarga.jpeg)
*Figure 1: RCP extracorpórea>>/images/procedures/301/descarga.jpeg*
Inicio página>>doc:
  `);

  assert.ok(!normalized.includes("((("));
  assert.ok(!normalized.includes("Inicio página>>doc:"));
  assert.ok(normalized.includes("[Ver anexo: Algoritmo SVA](/docs/procedures/301/301_algoritmo_SVA.pdf)"));
  assert.ok(normalized.includes("*Figure 1: RCP extracorpórea*"));
});

test("normalizeProcedureContent links only safe plain code mentions and preserves explicit manual links", () => {
  const normalized = normalizeProcedureContent(
    `
    Active Código 13 si procede.
    Considere Código 16.1 y Código infarto.
    Mantenga [Código 100](214d.htm) como enlace explícito.
    Código 33 no debe enlazarse.
    `,
    new Map([
      ["214", "214-reperfusion-precoz-en-el-ictus-agudo"],
      ["213", "213-codigo-infarto"],
      ["213a", "213a-codigo-16"],
      ["214d", "214d-codigo-100"],
    ]),
  );

  assert.match(normalized, /\[Código 13]\(\/manual\/214-reperfusion-precoz-en-el-ictus-agudo\)/);
  assert.match(normalized, /\[Código 16\.1]\(\/manual\/213a-codigo-16\)/);
  assert.match(normalized, /\[Código infarto]\(\/manual\/213-codigo-infarto\)/);
  assert.match(normalized, /\[Código 100]\(\/manual\/214d-codigo-100\)/);
  assert.match(normalized, /Código 33 no debe enlazarse\./);
  assert.doesNotMatch(normalized, /\[Código 33]/);
});

test("splitProcedureContentSections creates intro and heading keyed sections from normalized markdown", () => {
  assert.equal(typeof manualData.splitProcedureContentSections, "function");

  const sections = manualData.splitProcedureContentSections?.(`
Resumen introductorio.

## **Ritmos no desfibrilables**
Texto uno.

### **Actividad eléctrica sin pulso (AESP) o asistolia.**
Texto dos.
`);

  assert.ok(sections);
  assert.deepEqual(
    sections?.map((section) => ({
      key: section.key,
      title: section.heading,
      level: section.level,
    })),
    [
      { key: "__start", title: null, level: 0 },
      { key: "ritmos-no-desfibrilables", title: "Ritmos no desfibrilables", level: 2 },
      {
        key: "actividad-electrica-sin-pulso-aesp-o-asistolia",
        title: "Actividad eléctrica sin pulso (AESP) o asistolia.",
        level: 3,
      },
    ],
  );
});

test("groupProcedureEditorialBlocks anchors blocks by heading and falls back unmatched entries to the end", () => {
  assert.equal(typeof manualData.groupProcedureEditorialBlocks, "function");

  const sections = manualData.splitProcedureContentSections?.(`
Introducción.

## Ritmos no desfibrilables
Texto.

### PCR no recuperada
Texto final.
`) ?? [];

  const grouped = manualData.groupProcedureEditorialBlocks?.(
    [
      {
        id: "summary",
        type: "summary",
        targetHeading: "__start",
        placement: "before",
        items: ["RCP inmediata"],
      },
      {
        id: "cheatsheet",
        type: "cheatsheet",
        targetHeading: "ritmos-no-desfibrilables",
        placement: "after",
        items: ["ETCO2"],
      },
      {
        id: "unmatched",
        type: "editorial-note",
        targetHeading: "heading-inexistente",
        placement: "before",
        content: "fallback",
      },
    ],
    sections,
  );

  assert.ok(grouped);
  assert.deepEqual(grouped?.bySection.__start.before.map((block) => block.id), ["summary"]);
  assert.deepEqual(grouped?.bySection["ritmos-no-desfibrilables"].after.map((block) => block.id), ["cheatsheet"]);
  assert.deepEqual(grouped?.afterAll.map((block) => block.id), ["unmatched"]);
  assert.deepEqual(grouped?.unresolvedIds, ["unmatched"]);
});

test("collectCitedDrugs and collectCitedTechniques derive reusable operational references from content", () => {
  assert.equal(typeof manualData.collectCitedDrugs, "function");
  assert.equal(typeof manualData.collectCitedTechniques, "function");

  const source = `
  * Realice intubación endotraqueal conforme a procedimiento.
  * Si no es posible vía periférica, canalice preferentemente vía intraósea.
  * Realice exploración ecográfica para descartar causas reversibles.
  * Si existe neumotórax a tensión, realice drenaje. (ver toracocentesis. Técnicas).
  * Si existe taponamiento cardíaco, realice pericardiocentesis mientras prepara toracotomía de reanimación.
  * Administre <DrugLink name="Adrenalina" /> y <DrugLink name="BicarbonatoSodico" />.
  `;

  assert.deepEqual(manualData.collectCitedDrugs?.(source), ["Adrenalina", "BicarbonatoSodico"]);
  assert.deepEqual(manualData.collectCitedTechniques?.(source), [
    "Intubación endotraqueal",
    "Vía intraósea",
    "Exploración ecográfica",
    "Toracocentesis",
    "Pericardiocentesis",
    "Toracotomía de reanimación",
  ]);
});

test("getProcedureSidebarMeta keeps selected sections flat and preserves detailed grouping elsewhere", () => {
  assert.deepEqual(
    getProcedureSidebarMeta("Comunicaciones", "125_03", "Sospecha de Síndrome Coronario Agudo (SCA)"),
    { group: "Procedimientos", subgroup: "Listado" },
  );

  assert.deepEqual(
    getProcedureSidebarMeta("Administrativos", "101", "Disponibilidad y activación de personal"),
    { group: "Procedimientos", subgroup: "Listado" },
  );

  assert.deepEqual(
    getProcedureSidebarMeta("DRP", "drp_01", "Procedimiento general de los DRP"),
    { group: "Procedimientos", subgroup: "Listado" },
  );

  assert.deepEqual(
    getProcedureSidebarMeta("Intervinientes", "115", "Apoyo psicológico a intervinientes"),
    { group: "Procedimientos", subgroup: "Listado" },
  );

  assert.deepEqual(
    getProcedureSidebarMeta("Operativos", "217_03", "Actuación con Bomberos"),
    { group: "Coordinación interservicios", subgroup: "Actuaciones conjuntas" },
  );

  assert.deepEqual(
    getProcedureSidebarMeta("Operativos", "216c", "Asistencia a paciente con posible infección de ébola"),
    { group: "Riesgo biológico e infeccioso", subgroup: "Patógenos de alto riesgo" },
  );
});

test("perfusions dataset includes the missing lines documented in ListaPerfusiones.pdf", () => {
  const perfusiones = JSON.parse(
    fs.readFileSync(new URL("../content/data/perfusiones.json", import.meta.url), "utf8"),
  ) as Array<{ drug: string }>;

  const names = new Set(perfusiones.map((item) => item.drug));

  for (const expected of [
    "Flumazenil",
    "Gluconato Cálcico",
    "Metilprednisolona",
    "N-Acetilcisteína",
    "Naloxona",
    "Nitroprusiato",
    "Omeprazol",
    "Urapidil",
  ]) {
    assert.ok(names.has(expected), `missing perfusion entry for ${expected}`);
  }
});

test("vademecum tabs expose four peer subtabs including Lista perfusiones", () => {
  assert.deepEqual(
    VADEMECUM_TABS.map((tab) => tab.key),
    ["farmacos", "perfusiones", "fluidos", "comerciales"],
  );

  assert.equal(
    VADEMECUM_TABS.find((tab) => tab.key === "perfusiones")?.label,
    "Lista perfusiones",
  );
});

test("codigos navigation removes PC/Lima and nests communications subtabs", () => {
  assert.deepEqual(
    CODIGOS_TOP_LEVEL_TABS.map((tab) => tab.key),
    ["incidente", "comunicaciones", "icao"],
  );

  assert.ok(!CODIGOS_TOP_LEVEL_TABS.some((tab) => tab.label === "PC/Lima"));

  assert.deepEqual(
    CODIGOS_COMMUNICATION_SUBTABS.map((tab) => tab.key),
    ["indicativos", "claves", "incidentes", "patologia", "cheatsheet"],
  );

  assert.deepEqual(
    CODIGOS_PATHOLOGY_SUBTABS.map((tab) => tab.key),
    ["sva", "svb", "upsi", "upsq"],
  );
});

test("communications datasets exist with minimum expected sections", () => {
  const indicativos = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "content/data/codigos-indicativos.json"), "utf8"),
  ) as Array<{ code: string; name: string; group?: string }>;
  const claves = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "content/data/codigos-claves.json"), "utf8"),
  ) as Array<{ code: string; name: string; group?: string }>;
  const cheatsheet = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "content/data/codigos-cheatsheet.json"), "utf8"),
  ) as Array<{ key: string; title: string; items?: unknown[] }>;

  assert.ok(indicativos.some((item) => item.code === "Central" && item.group === "Propios · Particulares"));
  assert.ok(indicativos.some((item) => item.code === "SUMMA" && item.group === "Ajenos"));

  assert.ok(claves.some((item) => item.code === "0" && item.name === "Recurso operativo"));
  assert.ok(claves.some((item) => item.code === "VICTOR" || item.code === "Victor"));

  assert.deepEqual(
    cheatsheet.map((section) => section.key),
    ["plantillas", "grupos", "tetra", "estatus", "icao", "hospitales", "bases", "distritos"],
  );
  assert.ok(cheatsheet.every((section) => Array.isArray(section.items) && section.items.length > 0));
});

test("procedure content uses stable SAMUR ids without slug-generated ids", () => {
  const procedureDir = path.join(process.cwd(), "content/procedures");
  const files = fs.readdirSync(procedureDir).filter((file) => file.endsWith(".md"));
  const ids = new Map<string, string[]>();

  for (const file of files) {
    const raw = fs.readFileSync(path.join(procedureDir, file), "utf8");
    const id = raw.match(/^id:\s*["']?(.+?)["']?\s*$/m)?.[1] ?? "";
    assert.match(id, /^[0-9]{3}(?:[_a-z0-9]*)?$/i, `${file} has unstable id ${id}`);
    ids.set(id, [...(ids.get(id) ?? []), file]);
  }

  const duplicates = [...ids.entries()].filter(([, idFiles]) => idFiles.length > 1);
  assert.deepEqual(duplicates, []);
});

test("procedure content has no unresolved XWiki attachment options", () => {
  const procedureDir = path.join(process.cwd(), "content/procedures");
  const files = fs.readdirSync(procedureDir).filter((file) => file.endsWith(".md"));

  for (const file of files) {
    const raw = fs.readFileSync(path.join(procedureDir, file), "utf8");
    assert.ok(!raw.includes("%7C%7C"), `${file} has encoded XWiki link options`);
    assert.ok(!raw.includes("-target-_blank-"), `${file} has target flag in local attachment path`);
    assert.ok(!/\bimage:/.test(raw), `${file} has unresolved XWiki image syntax`);
    assert.ok(!/\(%[\s\S]*?%\)/.test(raw), `${file} has unresolved XWiki style syntax`);
    assert.ok(!/<(?!\/?DrugLink\b)/.test(raw), `${file} has raw less-than syntax that can break MDX`);
  }
});

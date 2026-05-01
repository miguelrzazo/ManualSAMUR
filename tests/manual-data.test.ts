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
  );

  assert.ok(!normalized.includes("javascript:window.print"));
  assert.ok(!normalized.includes("../images/trans.gif"));
  assert.ok(!normalized.includes("../images/logo.gif"));
  assert.ok(!normalized.includes("Manual de Procedimientos SAMUR-Protección Civil"));
  assert.ok(normalized.includes("/manual/122-gestion-de-llamadas-de-emergencia"));
  assert.ok(!normalized.includes('(# "consultar vademecum")'));
  assert.ok(normalized.includes("Lorazepam"));
});

test("getProcedureSidebarMeta derives nested manual groupings from section and procedure id", () => {
  assert.deepEqual(
    getProcedureSidebarMeta("Comunicaciones", "125_03", "Sospecha de Síndrome Coronario Agudo (SCA)"),
    { group: "Recomendaciones específicas", subgroup: "Patologías tiempo-dependientes" },
  );

  assert.deepEqual(
    getProcedureSidebarMeta("Operativos", "217_03", "Actuación con Bomberos"),
    { group: "Coordinación interservicios", subgroup: "Otros servicios" },
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
    ["sva", "svb", "upsi"],
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

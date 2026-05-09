import test from "node:test";
import assert from "node:assert/strict";
import {
  parseAbbreviationsFromHtml,
  parseCollaboratorsFromHtml,
  parseMainLinksFromHtml,
} from "../lib/main-content.ts";

test("parseAbbreviationsFromHtml groups entries by heading letter", () => {
  const html = `
    <div id="xwikicontent">
      <h1><span>A</span></h1>
      <table>
        <tr><td><strong>AAS</strong></td><td>Ácido acetil salicílico</td></tr>
        <tr><td><strong>AESP</strong></td><td>Actividad eléctrica sin pulso</td></tr>
      </table>
      <h1><span>B</span></h1>
      <table>
        <tr><td><strong>BNCO</strong></td><td>Bronconeumopatía crónica obstructiva</td></tr>
      </table>
    </div>
  `;

  assert.deepEqual(parseAbbreviationsFromHtml(html), [
    {
      letter: "A",
      entries: [
        { abbreviation: "AAS", meaning: "Ácido acetil salicílico" },
        { abbreviation: "AESP", meaning: "Actividad eléctrica sin pulso" },
      ],
    },
    {
      letter: "B",
      entries: [{ abbreviation: "BNCO", meaning: "Bronconeumopatía crónica obstructiva" }],
    },
  ]);
});

test("parseCollaboratorsFromHtml extracts full list and named blocks", () => {
  const html = `
    <div id="xwikicontent">
      <p><strong>Última modificación el 30/04/2026</strong></p>
      <p class="lead">LISTADO DE COLABORADORES</p>
      <table>
        <tr><td>Ana Uno</td><td>Bruno Dos</td></tr>
        <tr><td>Carla Tres</td><td>&nbsp;</td></tr>
      </table>
      <p class="lead">DIRECCIÓN Y COORDINACIÓN</p>
      <ul><li>Ana Uno</li></ul>
      <p class="lead">REVISION TECNICA</p>
      <ul><li>Bruno Dos</li></ul>
      <p class="lead">DISEÑO Y PROGRAMACION</p>
      <ul><li>Carla Tres</li></ul>
    </div>
  `;

  const parsed = parseCollaboratorsFromHtml(html, "https://servpub.madrid.es/manualsamur/bin/view/Menu/Cabecera%20principal/Colaboradores/WebHome");
  assert.equal(parsed.updatedAt, "30/04/2026");
  assert.deepEqual(parsed.list, ["Ana Uno", "Bruno Dos", "Carla Tres"]);
  assert.deepEqual(parsed.blocks.coordination, ["Ana Uno"]);
  assert.deepEqual(parsed.blocks.technicalReview, ["Bruno Dos"]);
  assert.deepEqual(parsed.blocks.designAndProgramming, ["Carla Tres"]);
});

test("parseMainLinksFromHtml resolves official links and contact", () => {
  const html = `
    <div id="xwikicontent"><p><strong>Última modificación el 30/04/2026</strong></p></div>
    <ul class="menu-items">
      <li><a href="/manualsamur/bin/view/Menu/Cabecera%20principal/Abreviaturas/WebHome">Abreviaturas</a></li>
      <li><a href="/manualsamur/bin/view/Menu/Cabecera%20principal/Colaboradores/WebHome">Colaboradores</a></li>
      <li><a href="/manualsamur/bin/download/Menu/Cabecera%20principal/WebHome/AvisoImportante.pdf">Aviso</a></li>
      <li><a href="mailto:samur@madrid.es">Correo</a></li>
    </ul>
    <div><a href="https://www.madrid.es/samur">Web oficial</a></div>
  `;

  const parsed = parseMainLinksFromHtml(html, "https://servpub.madrid.es/manualsamur/bin/view/Main/");
  assert.equal(parsed.updatedAt, "30/04/2026");
  assert.equal(parsed.samurEmail, "samur@madrid.es");
  assert.equal(parsed.officialWebUrl, "https://www.madrid.es/samur");
  assert.equal(
    parsed.avisoImportanteUrl,
    "https://servpub.madrid.es/manualsamur/bin/download/Menu/Cabecera%20principal/WebHome/AvisoImportante.pdf",
  );
  assert.equal(
    parsed.abbreviationsUrl,
    "https://servpub.madrid.es/manualsamur/bin/view/Menu/Cabecera%20principal/Abreviaturas/WebHome",
  );
  assert.equal(
    parsed.collaboratorsUrl,
    "https://servpub.madrid.es/manualsamur/bin/view/Menu/Cabecera%20principal/Colaboradores/WebHome",
  );
});

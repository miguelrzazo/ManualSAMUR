import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAlphabetSections,
  normalizeInitialLetter,
  resolveVademecumRouteState,
} from "../lib/vademecum-utils.ts";
import {
  extractVademecumAttachmentLinks,
  mergeImportedDrugs,
  parseCommercialRowsFromText,
  parseFluidsFromText,
  parsePerfusionsFromText,
  parseWikiDrugsFromHtml,
} from "../lib/vademecum-sync.ts";

test("normalizeInitialLetter strips accents and groups non-letter titles into #", () => {
  assert.equal(normalizeInitialLetter("Ácido Acetilsalicílico"), "A");
  assert.equal(normalizeInitialLetter("Ñandú terapéutico"), "N");
  assert.equal(normalizeInitialLetter("3% Salino hipertónico"), "#");
});

test("buildAlphabetSections groups items by normalized initial", () => {
  const sections = buildAlphabetSections(
    [
      { name: "Ácido Acetilsalicílico" },
      { name: "Adrenalina" },
      { name: "Bicarbonato" },
      { name: "3% Salino hipertónico" },
    ],
    (item) => item.name,
  );

  assert.deepEqual(
    sections.map((section) => [section.key, section.items.length]),
    [
      ["#", 1],
      ["A", 2],
      ["B", 1],
    ],
  );
});

test("resolveVademecumRouteState prioritizes farmaco deep-links and ignores legacy q filtering", () => {
  assert.deepEqual(
    resolveVademecumRouteState({
      farmaco: ["adrenalina", "midazolam"],
      q: "shock",
    }),
    {
      initialTab: "farmacos",
      highlightedDrugId: "adrenalina",
    },
  );

  assert.deepEqual(resolveVademecumRouteState({ q: "amiodarona" }), {
    initialTab: "farmacos",
    highlightedDrugId: null,
  });
});

test("extractVademecumAttachmentLinks reads the official annex urls from wiki html", () => {
  const html = `
    <div>
      <a href="/manualsamur/bin/download/Menu/Cabecera%20principal/Vadem%C3%A9cum/WebHome/vademecum_Fluidos.pdf?rev=1.1">Ver anexo - Tabla Fluidos</a>
      <a href="/manualsamur/bin/download/Menu/Cabecera%20principal/Vadem%C3%A9cum/WebHome/vademecum_ListaPerfusiones.pdf?rev=1.2">Ver anexo - Lista de Perfusiones</a>
      <a href="/manualsamur/bin/download/Menu/Cabecera%20principal/Vadem%C3%A9cum/WebHome/vademecum_identificacion.pdf?rev=1.2">Relación de nombres comerciales de medicamentos</a>
    </div>
  `;

  assert.deepEqual(extractVademecumAttachmentLinks(html), {
    fluidsPdf: "https://servpub.madrid.es/manualsamur/bin/download/Menu/Cabecera%20principal/Vadem%C3%A9cum/WebHome/vademecum_Fluidos.pdf?rev=1.1",
    perfusionsPdf: "https://servpub.madrid.es/manualsamur/bin/download/Menu/Cabecera%20principal/Vadem%C3%A9cum/WebHome/vademecum_ListaPerfusiones.pdf?rev=1.2",
    commercialNamesPdf: "https://servpub.madrid.es/manualsamur/bin/download/Menu/Cabecera%20principal/Vadem%C3%A9cum/WebHome/vademecum_identificacion.pdf?rev=1.2",
  });
});

test("parseWikiDrugsFromHtml extracts drug blocks by letter and preserves clinical text", () => {
  const html = `
    <div class="wiki-content">
      <h1 id="Acetilcisteina" class="colorTextoRojo"><span><strong>A</strong></span></h1>
      <p class="colorTextoRojo" id="Acetilcisteina"><ins><strong>Acetilcisteína</strong></ins></p>
      <p><strong>Función</strong>: antídoto de las intoxicaciones por paracetamol.<br/><strong>Indicaciones</strong>: intoxicación por paracetamol.<br/><strong>Dosis</strong>: iv lenta.</p>
      <ul>
        <li>Dosis de Ataque: 150 mg/kg.</li>
        <li>Dosis sucesivas: 50 mg/kg en 500 ml de SSF.</li>
      </ul>
      <p><strong>Contraindicaciones</strong>: no descritas. Precaución en asma.</p>
      <p><strong>Efectos secundarios</strong>: náuseas, vómito.</p>
      <p><strong>Presentación</strong>: vial de 25 ml con 5 g (200 mg/ml).</p>
      <p><a href="#">Inicio Vademécum</a></p>
      <h1 id="HU" class="colorTextoRojo"><span><strong>U</strong></span></h1>
      <p class="colorTextoRojo" id="Urapidil"><ins><strong>Urapidil</strong></ins></p>
      <p><strong>Acciones</strong>: Antihipertensivo.</p>
      <p><strong>Indicaciones</strong>: Emergencias hipertensivas.</p>
      <p><strong>Dosis</strong>: Perfusión continua de 9 - 30 mg / hora.</p>
      <p><strong>Contraindicaciones</strong>: alergias conocidas al Urapidil.</p>
      <p><strong>Presentación</strong>: ampolla de 50 mg/10 ml.</p>
    </div>
  `;

  const drugs = parseWikiDrugsFromHtml(html);

  assert.equal(drugs.length, 2);
  assert.deepEqual(
    drugs.map((drug) => ({ name: drug.name, initialLetter: drug.initialLetter, sourceAnchor: drug.sourceAnchor })),
    [
      { name: "Acetilcisteína", initialLetter: "A", sourceAnchor: "Acetilcisteina" },
      { name: "Urapidil", initialLetter: "U", sourceAnchor: "Urapidil" },
    ],
  );
  assert.match(drugs[0].dose, /Dosis de Ataque: 150 mg\/kg/);
  assert.match(drugs[0].notes ?? "", /Función: antídoto/);
  assert.match(drugs[0].notes ?? "", /Efectos secundarios: náuseas, vómito/);
  assert.equal(drugs[1].presentation, "ampolla de 50 mg/10 ml.");
});

test("mergeImportedDrugs preserves local taxonomy and marks new drugs for review", () => {
  const merged = mergeImportedDrugs(
    [
      {
        id: "adrenalina",
        name: "Adrenalina",
        synonyms: ["Epinefrina"],
        category: "Cardiovascular",
        subcategory: "Vasoactivos",
        presentation: "Amp 1 mg/1 ml",
        indication: "PCR",
        dose: "1 mg IV",
        route: ["IV", "IO", "IM"],
        contraindications: "Sin contraindicaciones absolutas en PCR.",
        notes: "Dato local",
      },
    ],
    [
      {
        name: "Adrenalina",
        sourceAnchor: "Adrenalina",
        initialLetter: "A",
        presentation: "Ampolla 1 mg / ml",
        indication: "PCR (FV/TVSP/AESP/Asistolia).",
        dose: "1 mg IV/IO cada 3-5 min",
        contraindications: "Precaución en HTA severa.",
        notes: "Función: simpaticomimético.",
      },
      {
        name: "Urapidil",
        sourceAnchor: "Urapidil",
        initialLetter: "U",
        presentation: "ampolla de 50 mg/10 ml.",
        indication: "Emergencias hipertensivas.",
        dose: "12,5 mg IV en bolo.",
        contraindications: "Alergia a Urapidil.",
        notes: "Acciones: antihipertensivo.",
      },
    ],
  );

  assert.equal(merged.length, 2);

  const adrenaline = merged.find((drug) => drug.id === "adrenalina");
  assert.ok(adrenaline);
  assert.equal(adrenaline.category, "Cardiovascular");
  assert.equal(adrenaline.subcategory, "Vasoactivos");
  assert.deepEqual(adrenaline.route, ["IV", "IO", "IM"]);
  assert.equal(adrenaline.presentation, "Ampolla 1 mg / ml");
  assert.match(adrenaline.notes ?? "", /Función: simpaticomimético/);

  const urapidil = merged.find((drug) => drug.id === "urapidil");
  assert.ok(urapidil);
  assert.equal(urapidil.category, "Pendiente de clasificar");
  assert.equal(urapidil.subcategory, "Revisar manualmente");
  assert.deepEqual(urapidil.route, []);
});

test("parseCommercialRowsFromText groups wrapped brand names under the same active ingredient", () => {
  const rows = parseCommercialRowsFromText(`
Acetilcisteína                     Vial 2000 mg / 10 ml          Hidonac Antídoto 200mg/ml vial 10ml
Adrenalina                        Ampolla 1 mg / ml             Adrenalina B. Braun 1mg amp. 1 ml
                                                                  Adrenalina Alt 1mg amp. 1ml
`);

  assert.deepEqual(rows, [
    {
      activeIngredient: "Acetilcisteína",
      presentation: "Vial 2000 mg / 10 ml",
      brandNames: ["Hidonac Antídoto 200mg/ml vial 10ml"],
    },
    {
      activeIngredient: "Adrenalina",
      presentation: "Ampolla 1 mg / ml",
      brandNames: [
        "Adrenalina B. Braun 1mg amp. 1 ml",
        "Adrenalina Alt 1mg amp. 1ml",
      ],
    },
  ]);
});

test("parsePerfusionsFromText keeps continuation lines attached to the previous perfusion", () => {
  const perfusions = parsePerfusionsFromText(`
Adrenalina            1 mg / 1 ml           1-10 mcg / min                   1 amp+ 99 ml SG 5%         6 - 60 ml / h
Nitroglicerina        5 mg / 5ml            1 - 4 mg / h                     2 amp+ 90 ml SG 5%         15 ml / h,

                                                                                                           comience 15 ml/h y aumente
                                                                                                           de 5 ml en 5 ml/h
`);

  assert.deepEqual(perfusions, [
    {
      drug: "Adrenalina",
      presentation: "1 mg / 1 ml",
      dose: "1-10 mcg / min",
      dilution: "1 amp+ 99 ml SG 5%",
      infusionRate: "6 - 60 ml / h",
    },
    {
      drug: "Nitroglicerina",
      presentation: "5 mg / 5ml",
      dose: "1 - 4 mg / h",
      dilution: "2 amp+ 90 ml SG 5%",
      infusionRate: "15 ml / h,\ncomience 15 ml/h y aumente\nde 5 ml en 5 ml/h",
    },
  ]);
});

test("parseFluidsFromText collects fluid blocks with contraindication lists", () => {
  const fluids = parseFluidsFromText(`
GLUCOSADO 5% (100 ml)                        278                       5                                                                    5
                                                                                                                                                   Fenitoína
                                                                                                                                                   Tenecteplase
SSF (0,9%) (100 ml)                          308                                  154          154                                        5,5
                                                                                                                                                   Hipertensión
                                                                                                                                                   Edemas en general
`);

  assert.deepEqual(fluids, [
    {
      name: "GLUCOSADO 5% (100 ml)",
      osmolarity: "278",
      glucose: "5",
      ph: "5",
      contraindications: ["Fenitoína", "Tenecteplase"],
    },
    {
      name: "SSF (0,9%) (100 ml)",
      osmolarity: "308",
      sodium: "154",
      chloride: "154",
      ph: "5,5",
      contraindications: ["Hipertensión", "Edemas en general"],
    },
  ]);
});

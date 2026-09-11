import assert from "node:assert/strict";
import test from "node:test";
import {
  buildProcedureShareHtml,
  buildProcedureShareUrl,
  PROCEDURE_SHARE_DISCLAIMER,
  type ShareableProcedure,
} from "../apps/mobile/src/procedure-share.ts";

const PROCEDURE: ShareableProcedure = {
  id: "301",
  title: "Parada cardiorrespiratoria",
  section: "SVA",
  slug: "301-parada-cardiorrespiratoria",
  content: "## Evaluación\nPrimer párrafo.\n\n- Uno\n- Dos\n",
};

test("buildProcedureShareUrl builds the canonical /manual/<slug> route", () => {
  assert.equal(
    buildProcedureShareUrl("https://manual-proced-spc.vercel.app", PROCEDURE),
    "https://manual-proced-spc.vercel.app/manual/301-parada-cardiorrespiratoria",
  );
});

test("buildProcedureShareUrl tolerates a trailing slash on the origin", () => {
  assert.equal(
    buildProcedureShareUrl("https://manual-proced-spc.vercel.app/", PROCEDURE),
    "https://manual-proced-spc.vercel.app/manual/301-parada-cardiorrespiratoria",
  );
  assert.equal(
    buildProcedureShareUrl("https://manual-proced-spc.vercel.app///", PROCEDURE),
    "https://manual-proced-spc.vercel.app/manual/301-parada-cardiorrespiratoria",
  );
});

test("buildProcedureShareHtml escapes HTML-significant characters in the title", () => {
  const procedure: ShareableProcedure = { ...PROCEDURE, title: "Vía <IV> & \"acceso\"" };
  const html = buildProcedureShareHtml(procedure, "https://manual-proced-spc.vercel.app");
  assert.ok(!html.includes("<IV>"), "raw <IV> must not appear unescaped");
  assert.ok(html.includes("Vía &lt;IV&gt; &amp; &quot;acceso&quot;"));
});

test("buildProcedureShareHtml escapes HTML-significant characters in the body", () => {
  const procedure: ShareableProcedure = {
    ...PROCEDURE,
    content: "Presión < 90 mmHg & FC > 120 lpm sin tratar.",
  };
  const html = buildProcedureShareHtml(procedure, "https://manual-proced-spc.vercel.app");
  assert.ok(!/[^&]<\s*90/.test(html), "a literal < must not survive unescaped");
  assert.ok(html.includes("Presión &lt; 90 mmHg &amp; FC &gt; 120 lpm sin tratar."));
});

test("buildProcedureShareHtml turns a markdown table into a real <table>", () => {
  const procedure: ShareableProcedure = {
    ...PROCEDURE,
    content: "## Dosis\n| Fármaco | Dosis |\n| --- | --- |\n| Adrenalina | 1 mg |\n",
  };
  const html = buildProcedureShareHtml(procedure, "https://manual-proced-spc.vercel.app");
  assert.ok(html.includes("<table>"));
  assert.ok(html.includes("<th>Fármaco</th>"));
  assert.ok(html.includes("<th>Dosis</th>"));
  assert.ok(html.includes("<td>Adrenalina</td>"));
  assert.ok(html.includes("<td>1 mg</td>"));
});

test("buildProcedureShareHtml renders headings, paragraphs and both list kinds", () => {
  const procedure: ShareableProcedure = {
    ...PROCEDURE,
    content: "## Evaluación\nUn párrafo suelto.\n\n- Primero\n- Segundo\n\n1. Uno\n2. Dos\n",
  };
  const html = buildProcedureShareHtml(procedure, "https://manual-proced-spc.vercel.app");
  assert.ok(html.includes("<h2>Evaluación</h2>"));
  assert.ok(html.includes("<p>Un párrafo suelto.</p>"));
  assert.ok(html.includes("<ul><li>Primero</li><li>Segundo</li></ul>"));
  assert.ok(html.includes("<ol><li>Uno</li><li>Dos</li></ol>"));
});

test("buildProcedureShareHtml carries the official source URL and the app's disclaimer", () => {
  const html = buildProcedureShareHtml(PROCEDURE, "https://manual-proced-spc.vercel.app");
  const url = buildProcedureShareUrl("https://manual-proced-spc.vercel.app", PROCEDURE);
  assert.ok(html.includes(url));
  assert.ok(html.includes(PROCEDURE_SHARE_DISCLAIMER));
});

test("buildProcedureShareHtml includes the procedure id and section", () => {
  const html = buildProcedureShareHtml(PROCEDURE, "https://manual-proced-spc.vercel.app");
  assert.ok(html.includes(PROCEDURE.id));
  assert.ok(html.includes(PROCEDURE.section));
});

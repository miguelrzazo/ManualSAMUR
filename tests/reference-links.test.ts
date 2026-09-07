import test from "node:test";
import assert from "node:assert/strict";
import { collectReferenceMentions, linkReferenceMentions } from "../lib/reference-links.ts";
import { assertImportedCodeCoverage, parseRadioCodePdfText } from "../lib/code-import.ts";

const drugs = [{ id: "adrenalina", name: "Adrenalina", synonyms: ["Epinefrina"] }];
const codes = [{ code: "16", name: "Código SCASEST", tab: "incidente" }];

test("links unambiguous drug synonyms and code mentions while preserving markdown constructs", () => {
  const source = "Administre epinefrina. Consulte [Adrenalina](/vademecum?farmaco=adrenalina), `Adrenalina` y ![Adrenalina](dose.png). Código 16.";
  const linked = linkReferenceMentions(source, drugs, codes);
  assert.ok(linked.includes("[epinefrina](/vademecum?farmaco=adrenalina)"));
  assert.ok(linked.includes("[Código 16](/codigos?tab=incidente&code=16)"));
  assert.ok(linked.includes("[Adrenalina](/vademecum?farmaco=adrenalina)"));
  assert.ok(linked.includes("`Adrenalina`"));
  assert.ok(linked.includes("![Adrenalina](dose.png)"));
});

test("collects generated and explicit drug links for reverse mentions", () => {
  assert.deepEqual(
    collectReferenceMentions("Adrenalina y [Epinefrina](/vademecum?farmaco=adrenalina)", drugs),
    { drugIds: ["adrenalina"], codeIds: [] },
  );
});

test("skips ambiguous aliases and fenced or repeated markdown content", () => {
  const ambiguous = [
    ...drugs,
    { id: "otro", name: "Otra medicina", synonyms: ["Epinefrina"] },
  ];
  const source = "Epinefrina. Adrenalina. ~~~\nAdrenalina\n~~~ [Adrenalina](/vademecum?farmaco=adrenalina)";
  const linked = linkReferenceMentions(source, ambiguous, []);
  assert.equal((linked.match(/\[Adrenalina\]\(\/vademecum\?farmaco=adrenalina\)/g) ?? []).length, 2);
  assert.doesNotMatch(linked, /\]\(\/vademecum\?farmaco=adrenalina\).*\[Adrenalina\]/);
  assert.ok(linked.includes("Epinefrina."));
  assert.ok(linked.includes("~~~\nAdrenalina\n~~~"));
});

test("parses official radio PDF columns and rejects implausible replacements", () => {
  const text = [
    "Clave Descripción                         │ Indicativos propios",
    "│ 0        Recurso operativo              │ Central              Central de Comunicaciones",
    "│ 1        Recurso en emergencia           │ Charly X             Médico Jefe",
    "│ 2        Salida hacia lugar de actuación │ Delta X              Enfermería",
    "│ 3        Llegada al lugar                │ Fénix 0              Procedimientos",
    "│ 4        Salida del lugar                │ Lima X               Voluntarios",
    "│ 5        Llegada al hospital             │ Romeo                Psicólogo",
    "│ 6        Unidad inoperativa              │ Oscar                Central",
    "│ 7        Unidad en su base               │ SAMUR 0              Dirección",
    "│ 8        Solicitud llamada                │ Sierra               Coordinador",
    "│ 9        Localización geográfica         │ Papa                 Psiquiatría",
    "│ 10       Integridad dotación             │ UPR                  Prevención",
  ].join("\n");
  const parsed = parseRadioCodePdfText(text);
  assert.equal(parsed.claves[0]?.code, "0");
  assert.equal(parsed.indicativos[0]?.code, "Central");
  assert.throws(() => assertImportedCodeCoverage(100, 10), /solo 10/);
});

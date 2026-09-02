import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

interface DrugRecord {
  id: string;
  name: string;
  indication?: string;
  dose?: string;
}

const drugs = JSON.parse(
  readFileSync(path.join(process.cwd(), "content/data/vademecum.json"), "utf8"),
) as DrugRecord[];

/**
 * Material sanitario, no farmacos: no tienen posologia y es correcto que su
 * campo `dose` este vacio.
 */
const MATERIAL = new Set([
  "Apósitos de gel de agua",
  "Tiras de Fluoresceína",
]);

/**
 * Huecos reales del wiki de origen: la ficha no publica dosis. Se listan de
 * forma explicita para que el test siga protegiendo al resto; si algun dia se
 * rellenan, este test obliga a quitarlos de aqui.
 */
const KNOWN_UPSTREAM_GAPS = new Set([
  "Cloruro Sódico 20%",
]);

const hasText = (value?: string) => Boolean(value && value.trim());

test("todo farmaco tiene dosis, salvo material y huecos conocidos", () => {
  const missing = drugs
    .filter((drug) => !hasText(drug.dose))
    .filter((drug) => !MATERIAL.has(drug.name) && !KNOWN_UPSTREAM_GAPS.has(drug.name))
    .map((drug) => drug.name);

  assert.deepEqual(
    missing,
    [],
    `Farmacos sin dosis. Si la dosis quedo atrapada en 'indication', muevela a 'dose'; `
    + `si el wiki no la publica, añadelo a KNOWN_UPSTREAM_GAPS: ${missing.join(", ")}`,
  );
});

test("los huecos declarados siguen existiendo (lista al dia)", () => {
  // Evita que la lista de excepciones se quede obsoleta y enmascare regresiones.
  for (const name of [...MATERIAL, ...KNOWN_UPSTREAM_GAPS]) {
    const drug = drugs.find((item) => item.name === name);
    assert.ok(drug, `'${name}' esta en la lista de excepciones pero ya no existe en el vademecum`);
    assert.ok(
      !hasText(drug.dose),
      `'${name}' ya tiene dosis: quitalo de la lista de excepciones`,
    );
  }
});

test("ninguna dosis se quedo dentro del campo indication", () => {
  // La dosis se reconoce por una cantidad real (numero + unidad). Si aparece en
  // `indication` mientras `dose` esta vacio, es el fallo de reparto que se corrigio.
  const DOSE_QTY = /\d+\s*[.,]?\d*\s*(mg|ml|mcg|µg|g|UI|U)\b/i;

  const trapped = drugs
    .filter((drug) => !hasText(drug.dose) && !MATERIAL.has(drug.name))
    .filter((drug) => DOSE_QTY.test(drug.indication ?? ""))
    .map((drug) => drug.name);

  assert.deepEqual(trapped, [], `Dosis atrapada en 'indication': ${trapped.join(", ")}`);
});

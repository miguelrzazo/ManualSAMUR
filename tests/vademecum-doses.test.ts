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

/**
 * Un principio activo, una ficha.
 *
 * Había dos del ácido acetilsalicílico —"Ácido Acetil salicílico" y "Ácido
 * Acetilsalicílico"— con posologías distintas: una la analgésica y otra la del
 * SCA. En la lista salían seguidas, y quien buscaba "AAS" tenía que elegir entre
 * dos fichas sin saber cuál miraba. Se fusionaron en `acido-acetilsalicilico`.
 *
 * El importador no vuelve a crearlas porque `resolveExistingDrugId` empareja por
 * nombre y sinónimos con un umbral de 0.55, y la ficha superviviente los tiene
 * todos; pero si alguna vez entra un duplicado, salta aquí y no en la app.
 */
test("ningun principio activo aparece dos veces en el vademecum", () => {
  const normalize = (value: string) =>
    value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

  const byName = new Map<string, string[]>();
  for (const drug of drugs) {
    const key = normalize(drug.name);
    byName.set(key, [...(byName.get(key) ?? []), drug.id]);
  }

  const duplicates = [...byName.values()].filter((ids) => ids.length > 1);
  assert.deepEqual(duplicates, [], "estas fichas comparten nombre normalizado");

  const ids = drugs.map((drug) => drug.id);
  assert.equal(new Set(ids).size, ids.length, "hay ids repetidos en vademecum.json");
});

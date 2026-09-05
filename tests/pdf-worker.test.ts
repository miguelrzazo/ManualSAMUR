import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const ROOT_DIR = process.cwd();
const requireFromRoot = createRequire(path.join(ROOT_DIR, "package.json"));

function reactPdfPdfjsDir(): string {
  const requireFromReactPdf = createRequire(requireFromRoot.resolve("react-pdf"));
  return path.dirname(requireFromReactPdf.resolve("pdfjs-dist/package.json"));
}

function versionOf(pdfjsDir: string): string {
  return JSON.parse(fs.readFileSync(path.join(pdfjsDir, "package.json"), "utf8")).version as string;
}

/**
 * pdf.js aborta la carga si la versión del worker no coincide exactamente con la
 * de la API. react-pdf trae su propio pdfjs-dist anidado, y cuando el de la raíz
 * se adelantó (5.7.284 frente a 5.4.296) todos los PDF en línea dejaron de
 * renderizarse en producción con «No se pudo renderizar el PDF en línea», sin que
 * fallara ni un test ni la build.
 *
 * Se comprueba el fichero ORIGEN, no public/pdf.worker.min.mjs, porque CI ejecuta
 * `npm test` antes que `npm run build` y ese fichero aún no existe.
 */
test("el worker que copia sync-public-docs es el del pdfjs-dist de react-pdf", () => {
  const pdfjsDir = reactPdfPdfjsDir();
  const workerSource = path.join(pdfjsDir, "build", "pdf.worker.min.mjs");

  assert.ok(fs.existsSync(workerSource), `No existe el worker en ${workerSource}`);
  assert.ok(
    fs.readFileSync(workerSource, "utf8").includes(versionOf(pdfjsDir)),
    "El worker de origen no declara la versión de su propio paquete.",
  );
});

test("si el worker ya está generado, su versión coincide con la de react-pdf", () => {
  const workerPath = path.join(ROOT_DIR, "public", "pdf.worker.min.mjs");
  if (!fs.existsSync(workerPath)) return; // Lo genera `npm run sync:docs-public`.

  const expected = versionOf(reactPdfPdfjsDir());
  assert.ok(
    fs.readFileSync(workerPath, "utf8").includes(expected),
    `public/pdf.worker.min.mjs no es la versión ${expected} que espera react-pdf. `
      + "Ejecuta `npm run sync:docs-public`.",
  );
});

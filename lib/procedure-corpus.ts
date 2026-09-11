import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

export interface ProcedureCorpusRecord {
  filePath: string;
  relativePath: string;
  sectionDirectory: string;
  filenameStem: string;
  id: string;
  title: string;
  slug: string;
  section: string;
  source: string;
  body: string;
}

export interface ProcedureCorpusViolation {
  file: string;
  reason: string;
}

/**
 * El estándar de identificador: tres dígitos de sección y, opcionalmente, un
 * ordinal de dos dígitos. Dos niveles, todo numérico. "219", "412_01", "700_03".
 *
 * Antes convivían cinco formas —"214d", "304_01a", "drp_01"— heredadas del
 * volcado original. Las letras se convirtieron en ordinales renumerando la serie
 * y los DRP pasaron al bloque 7xx, que estaba libre.
 */
const PROCEDURE_ID_RE = /^\d{3}(_\d{2})?$/;

/**
 * El corpus procede de un único origen: el wiki oficial en servpub.madrid.es.
 *
 * Hubo un segundo origen —samurpc.net, la web del manual retirada— del que se
 * importaron 7 fichas que el sync mensual no podía descubrir ni actualizar, y que
 * arrastraban las 26 rutas de imagen relativas rotas del corpus. Se dieron de baja
 * o se repuntaron al wiki; esta comprobación existe para que no vuelvan a entrar
 * por la puerta de atrás.
 */
const ALLOWED_SOURCE_HOST = "servpub.madrid.es";

/** `![alt](destino)` en el cuerpo markdown. */
const IMAGE_REF_RE = /!\[[^\]]*\]\(([^)]+)\)/g;

export function walkProcedureFiles(proceduresDir: string): string[] {
  if (!fs.existsSync(proceduresDir)) return [];

  const files: string[] = [];
  for (const entry of fs.readdirSync(proceduresDir, { withFileTypes: true })) {
    const entryPath = path.join(proceduresDir, entry.name);
    if (entry.isDirectory()) files.push(...walkProcedureFiles(entryPath));
    else if (entry.isFile() && entry.name.endsWith(".md")) files.push(entryPath);
  }

  return files.sort();
}

export function readProcedureCorpus(proceduresDir: string): ProcedureCorpusRecord[] {
  return walkProcedureFiles(proceduresDir).map((filePath) => {
    const filenameStem = path.basename(filePath, ".md");
    const { data, content } = matter(fs.readFileSync(filePath, "utf8"));

    return {
      filePath,
      relativePath: path.relative(proceduresDir, filePath),
      sectionDirectory: path.basename(path.dirname(filePath)),
      filenameStem,
      id: String(data.id ?? ""),
      title: String(data.title ?? ""),
      // This matches the runtime loader's fallback when legacy records omit slug.
      slug: String(data.slug ?? filenameStem),
      section: String(data.section ?? "General"),
      source: String(data.source ?? ""),
      body: content,
    };
  });
}

function duplicateValues(records: ProcedureCorpusRecord[], value: (record: ProcedureCorpusRecord) => string) {
  const filesByValue = new Map<string, string[]>();
  for (const record of records) {
    const key = value(record);
    const files = filesByValue.get(key) ?? [];
    files.push(record.relativePath);
    filesByValue.set(key, files);
  }

  return new Map([...filesByValue].filter(([, files]) => files.length > 1));
}

export function findProcedureCorpusViolations(records: ProcedureCorpusRecord[]): ProcedureCorpusViolation[] {
  const violations: ProcedureCorpusViolation[] = [];
  const duplicateIds = duplicateValues(records, (record) => record.id);
  const duplicateSlugs = duplicateValues(records, (record) => record.slug);

  for (const record of records) {
    if (!PROCEDURE_ID_RE.test(record.id)) {
      violations.push({ file: record.relativePath, reason: `id "${record.id}" is not a valid numeric procedure ID` });
    }

    if (record.filenameStem !== record.id) {
      violations.push({
        file: record.relativePath,
        reason: `filename "${record.filenameStem}.md" does not match id "${record.id}"`,
      });
    }

    const idFiles = duplicateIds.get(record.id);
    if (idFiles) {
      violations.push({
        file: record.relativePath,
        reason: `procedure id "${record.id}" is duplicated in: ${idFiles.join(", ")}`,
      });
    }

    const slugFiles = duplicateSlugs.get(record.slug);
    if (slugFiles) {
      violations.push({
        file: record.relativePath,
        reason: `canonical slug "${record.slug}" is duplicated in: ${slugFiles.join(", ")}`,
      });
    }

    violations.push(...findOriginViolations(record));
  }

  violations.push(...findDuplicateProcedureViolations(records));

  return violations;
}

/**
 * Dos fichas para la misma página del wiki.
 *
 * Es la forma que tenía el corpus de duplicarse sin que nadie lo viera: 218 y
 * 217_00 eran el mismo procedimiento —misma URL de origen, mismo texto—, y lo
 * mismo pasaba con 309_06 y 309_02c. Venían de haber importado de dos sitios y de
 * repuntar una ficha al wiki sin comprobar antes si ya la teníamos con otro id.
 *
 * La condición lleva las dos mitades a propósito. Solo la URL no vale: 101 y 102
 * comparten la de su sección y son fichas distintas. Solo el título tampoco:
 * "Valoración inicial del paciente politraumatizado" existe de verdad en SVA
 * (304_01) y en SVB (412_00), con contenido distinto y URLs distintas.
 */
function findDuplicateProcedureViolations(records: ProcedureCorpusRecord[]): ProcedureCorpusViolation[] {
  const byKey = new Map<string, ProcedureCorpusRecord[]>();
  for (const record of records) {
    if (!record.source || !record.title) continue;
    const key = `${record.source.trim()}\u0000${normalizeForComparison(record.title)}`;
    byKey.set(key, [...(byKey.get(key) ?? []), record]);
  }

  return [...byKey.values()]
    .filter((group) => group.length > 1)
    .flatMap((group) =>
      group.map((record) => ({
        file: record.relativePath,
        reason: `misma pagina del wiki y mismo titulo que: ${group.filter((other) => other !== record).map((other) => other.id).join(", ")}`,
      })),
    );
}

function normalizeForComparison(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * El origen tiene que ser el wiki, y las imágenes tienen que estar servidas por
 * nosotros (`/images/...`) o por el propio wiki. Una ruta relativa como
 * `../images/x.jpg` no resuelve a nada dentro de la app: es el resto de una
 * importación de la web antigua y se ve como texto roto en el lector.
 */
function findOriginViolations(record: ProcedureCorpusRecord): ProcedureCorpusViolation[] {
  const violations: ProcedureCorpusViolation[] = [];

  if (record.source && !record.source.includes(ALLOWED_SOURCE_HOST)) {
    violations.push({
      file: record.relativePath,
      reason: `source "${record.source.trim()}" no apunta a ${ALLOWED_SOURCE_HOST}`,
    });
  }

  for (const match of record.body.matchAll(IMAGE_REF_RE)) {
    const target = match[1].trim();
    const allowed = target.startsWith("/images/") || target.includes(ALLOWED_SOURCE_HOST);
    if (!allowed) {
      violations.push({
        file: record.relativePath,
        reason: `imagen "${target}" no es ni local (/images/...) ni de ${ALLOWED_SOURCE_HOST}`,
      });
    }
  }

  return violations;
}

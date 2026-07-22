import fs from "node:fs";
import path from "node:path";
import { getAllProcedures } from "../lib/content.ts";
import { readManualHistoryDataset, readManualUpdatesDataset } from "../lib/manual-sync.ts";
import type { ProcedureSearchDoc } from "../lib/search.ts";

/**
 * Emite los datasets que el cliente descarga bajo demanda:
 *
 *   public/search-index.json   — corpus de búsqueda
 *   public/manual-updates.json — eventos de novedades (con sus diffs)
 *   public/manual-history.json — historial completo de cambios
 *
 * Ambos existen por el mismo motivo. Viajaban dentro del payload RSC de cada página
 * (el índice de búsqueda desde el layout raíz, los 630 eventos con sus diffs desde
 * /manual), lo que inflaba el HTML a varios MB. Sacarlos a ficheros estáticos hace
 * que se descarguen solo cuando hacen falta —al abrir la búsqueda o el historial— y
 * que el navegador los cachee entre visitas.
 */

const OUT_DIR = path.join(process.cwd(), "public");

function writeJson(fileName: string, data: unknown): number {
  const target = path.join(OUT_DIR, fileName);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(data), "utf8");
  return fs.statSync(target).size;
}

function mb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

// ─── Índice de búsqueda ───────────────────────────────────────────────────────

const searchIndex: ProcedureSearchDoc[] = getAllProcedures().map((procedure) => ({
  id: procedure.id,
  title: procedure.title,
  slug: procedure.slug,
  section: procedure.section,
  synonyms: procedure.synonyms,
  tags: procedure.tags,
  backlinks: procedure.backlinks,
  searchText: procedure.searchText,
}));

if (!searchIndex.length) {
  console.error("[generate-client-data] No se encontró ningún procedimiento. Abortando.");
  process.exit(1);
}

const searchBytes = writeJson("search-index.json", searchIndex);
console.log(`[generate-client-data] ${searchIndex.length} procedimientos → public/search-index.json (${mb(searchBytes)})`);

// ─── Eventos de novedades ─────────────────────────────────────────────────────

// Los 630 eventos, con ~663 KB de diffs, se serializaban en el HTML de /manual.
// El diálogo los descarga al abrirse; la página solo lleva lo justo para la píldora.
const updates = readManualUpdatesDataset();
const updateBytes = writeJson("manual-updates.json", updates);
console.log(`[generate-client-data] ${updates.events.length} eventos → public/manual-updates.json (${mb(updateBytes)})`);

// ─── Historial de actualizaciones ─────────────────────────────────────────────

const history = readManualHistoryDataset();

// Se ordena en build para que el cliente no tenga que ordenar 500 entradas al abrir
// el diálogo. Más reciente primero.
const entries = [...history.entries].sort((a, b) => b.changedAt.localeCompare(a.changedAt));

const historyBytes = writeJson("manual-history.json", { generatedAt: history.generatedAt, entries });
console.log(`[generate-client-data] ${entries.length} entradas de historial → public/manual-history.json (${mb(historyBytes)})`);

if (!entries.length) {
  console.warn("[generate-client-data] Aviso: manual-history.json no tiene entradas; el diálogo de historial saldrá vacío.");
}

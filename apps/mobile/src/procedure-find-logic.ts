import type { ParsedProcedureDocument, ParsedProcedureSection } from "./procedure-document.ts";
import { readableMarkdownCell, readableMarkdownLine, splitMarkdownBlocks, type ProcedureSection } from "./procedure-logic.ts";
import { countMatches, snippetQueryTerms } from "./search-snippet-logic.ts";

/**
 * Buscar dentro de un procedimiento.
 *
 * Los procedimientos largos —601_01 pasa de las doscientas líneas— se leen con una
 * pregunta concreta en la cabeza, y el índice de contenidos sólo responde si la
 * respuesta está en un encabezado. La búsqueda global tampoco vale: encuentra *el*
 * procedimiento, no el párrafo.
 *
 * La coincidencia se calcula sobre el mismo texto que dibuja `MarkdownContent`
 * (`readableMarkdownLine` / `readableMarkdownCell`, ambos en `procedure-logic.ts`),
 * no sobre el markdown en crudo. Buscar sobre el crudo encontraría términos dentro
 * de una ruta de imagen o de un `[texto](destino)` y llevaría al lector a un sitio
 * donde no se ve la palabra.
 *
 * Las claves de bloque son literalmente las mismas que `MarkdownContent` usa como
 * `key` de React, porque son también las que el lector registra en su mapa de
 * desplazamientos: un `blockKey` que no coincidiera dejaría la coincidencia
 * contada pero inalcanzable.
 */
export interface ProcedureFindText {
  /** `${section.key}-${index}` para líneas, `${section.key}-table-${startIndex}` para tablas. */
  blockKey: string;
  sectionKey: string;
  /** El texto legible del bloque, para leerlo en voz alta al saltar a él. */
  text: string;
}

export type ProcedureFindMatch = ProcedureFindText;

/** El mismo mínimo de longitud que la búsqueda global: dos letras. */
export function isFindableQuery(query: string): boolean {
  return snippetQueryTerms(query).length > 0;
}

/** Build the searchable text once, from the blocks the native renderer will draw. */
export function buildProcedureFindText(sections: readonly ParsedProcedureSection[]): ProcedureFindText[] {
  const findText: ProcedureFindText[] = [];
  for (const section of sections) {
    if (section.heading) findText.push({ blockKey: section.key, sectionKey: section.key, text: section.heading.text });
    for (const block of section.blocks) {
      if (block.kind === "table") {
        const text = [...block.table.headers, ...block.table.rows.flat()].map(readableMarkdownCell).join(" ");
        if (text) findText.push({ blockKey: `${section.key}-table-${block.startIndex}`, sectionKey: section.key, text });
        continue;
      }
      if (block.kind === "image" || block.row.kind === "skip") continue;
      const text = readableMarkdownLine(block.line.trim());
      if (text) findText.push({ blockKey: `${section.key}-${block.index}`, sectionKey: section.key, text });
    }
  }
  return findText;
}

function findTextFromSections(sections: readonly ProcedureSection[]): ProcedureFindText[] {
  return buildProcedureFindText(sections.map((section) => ({ ...section, blocks: splitMarkdownBlocks(section.lines) })));
}

function isParsedProcedureDocument(source: ParsedProcedureDocument | readonly ProcedureSection[]): source is ParsedProcedureDocument {
  return !Array.isArray(source);
}

export function findProcedureMatches(source: ParsedProcedureDocument | readonly ProcedureSection[], query: string): ProcedureFindMatch[] {
  if (!isFindableQuery(query)) return [];
  const findText = isParsedProcedureDocument(source) ? source.findText : findTextFromSections(source);
  return findText.filter((entry: ProcedureFindText) => countMatches(entry.text, query) > 0);
}

/**
 * El índice siguiente/anterior, dando la vuelta por los extremos.
 *
 * Envolver es lo que hace la búsqueda de Safari y de cualquier lector: llegar al
 * último resultado y que el botón "siguiente" deje de responder se lee como que la
 * app se ha colgado.
 */
export function stepMatchIndex(current: number, total: number, direction: 1 | -1): number {
  if (total <= 0) return 0;
  return ((current + direction) % total + total) % total;
}

/** El contador de la barra: 1-based para leerlo, `0 de 0` cuando no hay nada. */
export function formatMatchCounter(current: number, total: number): string {
  if (total <= 0) return "0 de 0";
  return `${current + 1} de ${total}`;
}

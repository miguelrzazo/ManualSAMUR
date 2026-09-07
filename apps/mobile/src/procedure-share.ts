/**
 * Compartir un procedimiento: el enlace web canónico y el HTML que `expo-print`
 * convierte en PDF.
 *
 * Módulo puro a propósito — nada de React ni de react-native — para poder
 * probarlo bajo Node y para que App.tsx sea el único sitio que decide *cómo*
 * se ofrece el resultado (hoja de compartir del sistema, `expo-print`, un
 * `Toast` de error). Aquí solo se construyen cadenas de texto.
 *
 * La estructura del cuerpo (títulos, párrafos, listas, tablas) se reutiliza de
 * `procedure-logic.ts`, que ya es el parser de Markdown de la app — el lector
 * lo usa para dibujar la ficha en pantalla y el mapa de anexos para resolver
 * imágenes en línea. Escribir un segundo parser aquí solo para el PDF habría
 * significado dos lecturas distintas del mismo Markdown, y dos sitios donde
 * arreglar el mismo bug del corpus.
 */
import {
  splitMarkdownBlocks,
  splitProcedureSections,
  type MarkdownBlock,
  type MarkdownTable,
  type ProcedureSection,
} from "./procedure-logic.ts";

/** Lo mínimo del procedimiento que hace falta para compartirlo. */
export interface ShareableProcedure {
  id: string;
  title: string;
  section: string;
  slug: string;
  content: string;
}

/**
 * Mismo texto legal que ve quien abre la app por primera vez
 * (`FirstUseDisclosure` en App.tsx). Un PDF que sale de la app fuera de su
 * propia interfaz es precisamente el sitio donde ese aviso más falta hace, así
 * que se reutiliza la frase en lugar de redactar una nueva.
 */
export const PROCEDURE_SHARE_DISCLAIMER =
  "Manual de procedimientos SAMUR PC es una adaptación digital independiente y no oficial del ManualSAMUR. El contenido es de referencia: no sustituye protocolos, instrucciones ni criterio profesional.";

/**
 * El enlace web canónico de un procedimiento: `<origin>/manual/<slug>`, la
 * misma forma de ruta que `app/manual/[slug]/page.tsx` en la web. Se acepta el
 * origen como argumento (en vez de leerlo aquí) para que este módulo siga sin
 * depender de `expo-constants`; App.tsx lo lee de `Constants.expoConfig.extra.contentOrigin`
 * y lo pasa ya resuelto.
 */
export function buildProcedureShareUrl(origin: string, procedure: Pick<ShareableProcedure, "slug">): string {
  return `${origin.replace(/\/+$/, "")}/manual/${procedure.slug}`;
}

function escapeHtml(value: string): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Markdown en línea muy ligero, sobre texto ya escapado: negrita, cursiva y
 * enlaces `[texto](destino)`. Se escapa primero y se opera sobre el resultado,
 * así que ninguna entidad HTML del contenido original puede colarse como
 * marcado — un procedimiento con un `<` o un `&` sueltos en el cuerpo no puede
 * romper la tabla ni el resto de la página.
 */
function inlineHtml(line: string): string {
  return escapeHtml(line)
    .replace(/\[([^\]]+)\]\(([^)]*)\)/g, (_match, label: string, href: string) => `<a href="${href}">${label}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>");
}

function inlineHtmlCell(cell: string): string {
  return String(cell ?? "")
    .split("\n")
    .map((line) => inlineHtml(line))
    .join("<br />");
}

function stripListMarker(line: string): string {
  return line.trim().replace(/^(?:[-*•]|\d+[.)])\s+/, "");
}

function renderTableHtml(table: MarkdownTable): string {
  const headerRow = `<tr>${table.headers.map((header) => `<th>${inlineHtmlCell(header)}</th>`).join("")}</tr>`;
  const bodyRows = table.rows
    .map((row) => `<tr>${row.map((cell) => `<td>${inlineHtmlCell(cell)}</td>`).join("")}</tr>`)
    .join("");
  return `<table><thead>${headerRow}</thead><tbody>${bodyRows}</tbody></table>`;
}

type ListKind = "bullet" | "ordered";

/** Agrupa bloques consecutivos del mismo tipo de lista en un único `<ul>`/`<ol>`. */
function renderBlocksHtml(blocks: readonly MarkdownBlock[]): string {
  const parts: string[] = [];
  let openList: { kind: ListKind; items: string[] } | undefined;

  const flushList = () => {
    if (!openList) return;
    const tag = openList.kind === "bullet" ? "ul" : "ol";
    parts.push(`<${tag}>${openList.items.map((item) => `<li>${item}</li>`).join("")}</${tag}>`);
    openList = undefined;
  };

  for (const block of blocks) {
    if (block.kind === "table") {
      flushList();
      parts.push(renderTableHtml(block.table));
      continue;
    }
    if (block.kind === "image") {
      // Las rutas de las figuras son locales al paquete offline de la app
      // (`/images/procedures/...`) y no resuelven contra el origen web, así
      // que el PDF se queda con el texto del procedimiento y omite la imagen
      // en vez de dejar un hueco roto.
      flushList();
      continue;
    }
    if (block.row.kind === "skip") {
      flushList();
      continue;
    }
    const text = inlineHtml(stripListMarker(block.line));
    if (!text) {
      flushList();
      continue;
    }
    if (block.row.kind === "bullet") {
      if (openList?.kind !== "bullet") { flushList(); openList = { kind: "bullet", items: [] }; }
      openList.items.push(text);
      continue;
    }
    if (block.row.kind === "ordered") {
      if (openList?.kind !== "ordered") { flushList(); openList = { kind: "ordered", items: [] }; }
      openList.items.push(text);
      continue;
    }
    flushList();
    parts.push(`<p>${text}</p>`);
  }
  flushList();
  return parts.join("\n");
}

function renderSectionHtml(section: ProcedureSection): string {
  const heading = section.heading ? `<h${section.heading.level}>${escapeHtml(section.heading.text)}</h${section.heading.level}>` : "";
  return `${heading}\n${renderBlocksHtml(splitMarkdownBlocks(section.lines))}`;
}

/**
 * Hoja de estilos del PDF: mismo lenguaje visual que el `@media print` de
 * `app/globals.css` en la web — texto negro sobre blanco, sin cabecera ni pie
 * de la app, tablas que no se parten entre páginas — pero autocontenida, sin
 * clases de Tailwind que aquí no existen.
 */
const PRINT_STYLE = `
  * { box-sizing: border-box; }
  body { margin: 32px; color: #000; background: #fff; font-family: -apple-system, Helvetica, Arial, sans-serif; font-size: 11pt; line-height: 1.6; }
  h1 { font-size: 18pt; margin: 0 0 4px; }
  h2 { font-size: 14pt; margin-top: 20px; page-break-after: avoid; }
  h3 { font-size: 12pt; margin-top: 16px; page-break-after: avoid; }
  p, li { font-size: 11pt; }
  .meta { color: #333; font-size: 10pt; margin: 0 0 16px; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; page-break-inside: avoid; }
  th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #f2f2f2; }
  a { color: #000; text-decoration: underline; }
  footer { margin-top: 32px; border-top: 1px solid #ccc; padding-top: 12px; font-size: 9pt; color: #333; }
  footer p { font-size: 9pt; margin: 4px 0; }
`;

/**
 * HTML de página completa, listo para `Print.printToFileAsync({ html })`.
 * Lleva su propio `<head>`/`<style>` porque el motor de impresión de
 * `expo-print` renderiza el documento aislado, sin las hojas de estilo de la
 * app.
 */
export function buildProcedureShareHtml(procedure: ShareableProcedure, origin: string): string {
  const url = buildProcedureShareUrl(origin, procedure);
  const sections = splitProcedureSections(procedure.content);
  const bodyHtml = sections.map(renderSectionHtml).join("\n");
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(procedure.title)}</title>
<style>${PRINT_STYLE}</style>
</head>
<body>
<h1>${escapeHtml(procedure.title)}</h1>
<p class="meta">${escapeHtml(procedure.section)} · ${escapeHtml(procedure.id)}</p>
${bodyHtml}
<footer>
<p>Fuente: ${escapeHtml(url)}</p>
<p>${escapeHtml(PROCEDURE_SHARE_DISCLAIMER)}</p>
</footer>
</body>
</html>`;
}

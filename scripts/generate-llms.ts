#!/usr/bin/env node
/**
 * generate-llms.ts — Genera /public/llms.txt y /public/llms-full.txt
 *                    y copia los .md individuales a /public/procedures/
 *
 * Formato estándar llmstxt.org para acceso AI-friendly al contenido.
 *
 * Usage:
 *   node --experimental-strip-types scripts/generate-llms.ts
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { compileProcedureCorpus, loadProcedureSources } from "../lib/procedure-compiler.ts";
import { canonicalProcedureMarkdown, resolveCanonicalSiteUrl } from "../lib/markdown-export.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

const PUBLIC_DIR = path.join(__dirname, "../public");

const SECTIONS_ORDER = [
  "Administrativos",
  "Comunicaciones",
  "Operativos",
  "DRP",
  "Intervinientes",
  "SVA",
  "SVB",
  "Psicológicos",
  "Técnicas",
  "General",
];

export interface ProcedureMeta {
  id: string;
  title: string;
  section: string;
  slug: string;
  updated: string;
  source?: string;
  tags?: string[];
  synonyms?: string[];
  related?: string[];
  attachments?: unknown[];
  content: string;
  filePath: string;
}

function loadProcedures(): ProcedureMeta[] {
  const sources = loadProcedureSources(ROOT_DIR);
  const compiled = compileProcedureCorpus(ROOT_DIR, sources);
  const sourcesById = new Map(sources.map((source) => [source.id, source]));

  return compiled.map((procedure) => {
    const source = sourcesById.get(procedure.id);
    if (!source) throw new Error(`Compiled procedure ${procedure.id} has no source record`);
    return {
      id: source.id,
      title: source.title,
      section: source.section,
      slug: source.slug,
      updated: source.updated,
      source: source.source,
      tags: source.tags,
      synonyms: source.synonyms,
      related: source.related,
      attachments: source.attachments,
      content: procedure.content,
      filePath: source.filePath,
    };
  });
}

function sortProcedures(procedures: ProcedureMeta[]): ProcedureMeta[] {
  return [...procedures].sort((a, b) => {
    const sectionDiff = SECTIONS_ORDER.indexOf(a.section) - SECTIONS_ORDER.indexOf(b.section);
    if (sectionDiff !== 0) return sectionDiff;
    return a.id.localeCompare(b.id, "es", { numeric: true });
  });
}

export function generateLlmsTxt(procedures: ProcedureMeta[], updatedDate = latestUpdatedDate(procedures)): string {
  const baseUrl = resolveCanonicalSiteUrl();
  const grouped = new Map<string, ProcedureMeta[]>();
  for (const proc of procedures) {
    const list = grouped.get(proc.section) ?? [];
    list.push(proc);
    grouped.set(proc.section, list);
  }

  const lines: string[] = [
    "# SAMUR Manual",
    "",
    "> Adaptación digital no oficial del Manual de Procedimientos de SAMUR-Protección Civil de Madrid.",
    "> Contenido clínico © SAMUR-PC / Ayuntamiento de Madrid.",
    "",
    `Última actualización: ${updatedDate}`,
    `Total procedimientos: ${procedures.length}`,
    "",
    "## Recursos principales",
    "",
    `- Procedimientos: ${baseUrl}/manual`,
    `- Vademécum de fármacos: ${baseUrl}/vademecum`,
    `- Códigos radio: ${baseUrl}/codigos`,
    `- Mapa de hospitales y bases: ${baseUrl}/mapa`,
    `- Contenido completo para LLMs: ${baseUrl}/llms-full.txt`,
    `- Procedimientos individuales (Markdown): ${baseUrl}/procedures/{id}.md (ej: ${baseUrl}/procedures/101.md)`,
    "",
  ];

  for (const section of SECTIONS_ORDER) {
    const procs = grouped.get(section);
    if (!procs?.length) continue;

    lines.push(`## ${section} (${procs.length} procedimientos)`);
    lines.push("");
    for (const proc of procs) {
      lines.push(`- [${proc.id}] ${proc.title}: ${baseUrl}/manual/${proc.slug}`);
    }
    lines.push("");
  }

  lines.push("## Notas para LLMs");
  lines.push("");
  lines.push("- Este manual cubre procedimientos de emergencias prehospitalarias (SAMUR-Protección Civil, Madrid)");
  lines.push("- Los procedimientos incluyen SVA (Soporte Vital Avanzado), SVB (Soporte Vital Básico),");
  lines.push("  técnicas de intervención, procedimientos operativos, comunicaciones y psicología de emergencias");
  lines.push("- El contenido NO es un sustituto del criterio clínico del profesional");
  lines.push("- Para contenido completo con texto de cada procedimiento, ver /llms-full.txt");
  lines.push("- Para acceso a un procedimiento concreto, usar /procedures/{id}.md");
  lines.push("");

  return lines.join("\n");
}

/** Fecha del procedimiento más reciente del corpus. Estable entre builds. */
function latestUpdatedDate(procedures: ProcedureMeta[]): string {
  const dates = procedures.map((proc) => proc.updated).filter((value): value is string => Boolean(value));
  return dates.length ? dates.reduce((a, b) => (a > b ? a : b)) : "desconocida";
}

export function generateLlmsFullTxt(procedures: ProcedureMeta[], updatedDate = latestUpdatedDate(procedures)): string {
  const baseUrl = resolveCanonicalSiteUrl();
  const header = [
    "# SAMUR Manual — Contenido Completo",
    "",
    "> Adaptación digital no oficial del Manual de Procedimientos de SAMUR-Protección Civil de Madrid.",
    "> Contenido clínico © SAMUR-PC / Ayuntamiento de Madrid.",
    "",
    // Fecha del contenido, no de la build. Un `new Date()` aquí cambiaba este
    // fichero versionado en cada `npm run build`, así que llms-full.txt salía
    // modificado en todos los PR sin que hubiera cambiado nada, y la guarda de
    // deriva de ci.yml no podría pasar nunca. Además es la fecha que de verdad
    // le sirve a quien consume el corpus.
    `Actualizado: ${updatedDate}`,
    `Total procedimientos: ${procedures.length}`,
    "",
    "---",
    "",
  ].join("\n");

  const sections = procedures.map((proc) => {
    const lines = [
      `# [${proc.id}] ${proc.title}`,
      "",
      `Sección: ${proc.section}`,
      `URL: ${baseUrl}/manual/${proc.slug}`,
      `Markdown: ${baseUrl}/procedures/${proc.id}.md`,
    ];
    if (proc.updated) lines.push(`Actualizado: ${proc.updated}`);
    lines.push("", proc.content.trim(), "", "---", "");
    return lines.join("\n");
  });

  return header + sections.join("\n");
}

export function copyProceduresMd(procedures: ProcedureMeta[], destDir = path.join(PUBLIC_DIR, "procedures")): void {
  if (procedures.length === 0) throw new Error("Refusing to replace the public corpus with an empty dataset");
  const expected = new Set(procedures.map((proc) => `${proc.id}.md`));
  if (expected.size !== procedures.length || procedures.some((proc) => !/^[a-zA-Z0-9_-]+$/.test(proc.id))) {
    throw new Error("Invalid or duplicate procedure IDs in public export");
  }
  fs.mkdirSync(destDir, { recursive: true });
  for (const proc of procedures) {
    fs.writeFileSync(path.join(destDir, `${proc.id}.md`), canonicalProcedureMarkdown(proc), "utf8");
  }
  for (const entry of fs.readdirSync(destDir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".md") && !expected.has(entry.name)) {
      fs.unlinkSync(path.join(destDir, entry.name));
    }
  }
}

function main() {
  console.log("Cargando procedimientos...");
  const procedures = sortProcedures(loadProcedures());
  console.log(`  ${procedures.length} procedimientos encontrados`);

  const updatedDate = latestUpdatedDate(procedures);
  const llmsTxt = generateLlmsTxt(procedures, updatedDate);
  const llmsFullTxt = generateLlmsFullTxt(procedures, updatedDate);

  fs.writeFileSync(path.join(PUBLIC_DIR, "llms.txt"), llmsTxt, "utf8");
  console.log("  → public/llms.txt generado");

  fs.writeFileSync(path.join(PUBLIC_DIR, "llms-full.txt"), llmsFullTxt, "utf8");
  console.log("  → public/llms-full.txt generado");

  copyProceduresMd(procedures);
  console.log(`  → public/procedures/ — ${procedures.length} archivos .md copiados`);

  console.log("Listo.");
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) main();

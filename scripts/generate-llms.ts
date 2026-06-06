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
import matter from "gray-matter";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROCEDURES_DIR = path.join(__dirname, "../content/procedures");
const PUBLIC_DIR = path.join(__dirname, "../public");
const BASE_URL = "https://manualsamur.es";

const SECTIONS_ORDER = [
  "Administrativos",
  "Comunicaciones",
  "Operativos",
  "SVA",
  "SVB",
  "Psicológicos",
  "Técnicas",
  "General",
];

interface ProcedureMeta {
  id: string;
  title: string;
  section: string;
  slug: string;
  updated: string;
  content: string;
  filePath: string;
}

function walkMarkdownFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walkMarkdownFiles(entryPath));
    else if (entry.isFile() && entry.name.endsWith(".md")) files.push(entryPath);
  }
  return files;
}

function loadProcedures(): ProcedureMeta[] {
  const files = walkMarkdownFiles(PROCEDURES_DIR);
  return files.map((filePath) => {
    const raw = fs.readFileSync(filePath, "utf8");
    const { data, content } = matter(raw);
    const filename = path.basename(filePath, ".md");
    return {
      id: String(data.id ?? filename),
      title: String(data.title ?? filename),
      section: String(data.section ?? "General"),
      slug: String(data.slug ?? filename),
      updated: String(data.updated ?? ""),
      content,
      filePath,
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

function generateLlmsTxt(procedures: ProcedureMeta[]): string {
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
    `Última actualización: ${new Date().toISOString().split("T")[0]}`,
    `Total procedimientos: ${procedures.length}`,
    "",
    "## Recursos principales",
    "",
    `- Procedimientos: ${BASE_URL}/manual`,
    `- Vademécum de fármacos: ${BASE_URL}/vademecum`,
    `- Códigos radio: ${BASE_URL}/codigos`,
    `- Mapa de hospitales y bases: ${BASE_URL}/mapa`,
    `- Contenido completo para LLMs: ${BASE_URL}/llms-full.txt`,
    `- Procedimientos individuales (Markdown): ${BASE_URL}/procedures/{id}.md (ej: ${BASE_URL}/procedures/101.md)`,
    "",
  ];

  for (const section of SECTIONS_ORDER) {
    const procs = grouped.get(section);
    if (!procs?.length) continue;

    lines.push(`## ${section} (${procs.length} procedimientos)`);
    lines.push("");
    for (const proc of procs) {
      lines.push(`- [${proc.id}] ${proc.title}: ${BASE_URL}/manual/${proc.slug}`);
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

function generateLlmsFullTxt(procedures: ProcedureMeta[]): string {
  const header = [
    "# SAMUR Manual — Contenido Completo",
    "",
    "> Adaptación digital no oficial del Manual de Procedimientos de SAMUR-Protección Civil de Madrid.",
    "> Contenido clínico © SAMUR-PC / Ayuntamiento de Madrid.",
    "",
    `Generado: ${new Date().toISOString()}`,
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
      `URL: ${BASE_URL}/manual/${proc.slug}`,
      `Markdown: ${BASE_URL}/procedures/${proc.id}.md`,
    ];
    if (proc.updated) lines.push(`Actualizado: ${proc.updated}`);
    lines.push("", proc.content.trim(), "", "---", "");
    return lines.join("\n");
  });

  return header + sections.join("\n");
}

function copyProceduresMd(procedures: ProcedureMeta[]): void {
  const destDir = path.join(PUBLIC_DIR, "procedures");
  fs.mkdirSync(destDir, { recursive: true });
  for (const proc of procedures) {
    fs.copyFileSync(proc.filePath, path.join(destDir, `${proc.id}.md`));
  }
}

function main() {
  console.log("Cargando procedimientos...");
  const procedures = sortProcedures(loadProcedures());
  console.log(`  ${procedures.length} procedimientos encontrados`);

  const llmsTxt = generateLlmsTxt(procedures);
  const llmsFullTxt = generateLlmsFullTxt(procedures);

  fs.writeFileSync(path.join(PUBLIC_DIR, "llms.txt"), llmsTxt, "utf8");
  console.log("  → public/llms.txt generado");

  fs.writeFileSync(path.join(PUBLIC_DIR, "llms-full.txt"), llmsFullTxt, "utf8");
  console.log("  → public/llms-full.txt generado");

  copyProceduresMd(procedures);
  console.log(`  → public/procedures/ — ${procedures.length} archivos .md copiados`);

  console.log("Listo.");
}

main();

#!/usr/bin/env node
/**
 * extract-pdf-text.ts — Clasifica y extrae texto de los PDFs en public/docs/procedures/
 *
 * Para cada PDF:
 *   - Intenta extraer texto con pdftotext (poppler)
 *   - Clasifica: "text" (extraíble) vs "image" (escaneado/diagrama)
 *   - Para PDFs de texto: guarda el contenido en un sidecar .pdf.md
 *   - Actualiza el frontmatter del .md correspondiente con kind: "text-pdf" o "image-pdf"
 *
 * Usage:
 *   node --experimental-strip-types scripts/extract-pdf-text.ts
 *   node --experimental-strip-types scripts/extract-pdf-text.ts --dry-run
 *   node --experimental-strip-types scripts/extract-pdf-text.ts --report
 *   node --experimental-strip-types scripts/extract-pdf-text.ts --pdf public/docs/procedures/301/301_algoritmo_SVA.pdf
 */

import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import matter from "gray-matter";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, "..");
const DOCS_DIRS = [
  path.join(ROOT_DIR, "public/docs/procedures"),
  path.join(ROOT_DIR, "docs/procedures"),
];
const PROCEDURES_DIR = path.join(ROOT_DIR, "content/procedures");

const TEXT_THRESHOLD = 300; // chars — below this, treat as image PDF

interface PdfResult {
  pdfPath: string;
  procedureId: string;
  filename: string;
  kind: "text" | "image" | "error";
  charCount: number;
  extractedText?: string;
  error?: string;
}

// ─── PDF discovery ────────────────────────────────────────────────────────────

function findAllPdfs(): string[] {
  const results = new Set<string>();

  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(".pdf")) results.add(p);
    }
  }

  for (const docsDir of DOCS_DIRS) {
    if (fs.existsSync(docsDir)) walk(docsDir);
  }

  return [...results];
}

// ─── pdftotext extraction ──────────────────────────────────────────────────────

function extractTextFromPdf(pdfPath: string): { text: string; error?: string } {
  try {
    // -q: quiet, -enc UTF-8: output encoding, "-": output to stdout
    const text = execSync(`pdftotext -q -enc UTF-8 "${pdfPath}" -`, {
      encoding: "utf8",
      timeout: 15000,
      maxBuffer: 10 * 1024 * 1024,
    });
    return { text: (text ?? "").trim() };
  } catch (err) {
    return { text: "", error: err instanceof Error ? err.message : String(err) };
  }
}

// ─── Procedure .md lookup ─────────────────────────────────────────────────────

function findProcedureFile(procedureId: string): string | null {
  function walk(dir: string): string | null {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const found = walk(p);
        if (found) return found;
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        const raw = fs.readFileSync(p, "utf8");
        const { data } = matter(raw);
        if (data.id === procedureId) return p;
      }
    }
    return null;
  }

  if (!fs.existsSync(PROCEDURES_DIR)) return null;
  return walk(PROCEDURES_DIR);
}

// ─── Process a single PDF ─────────────────────────────────────────────────────

function processPdf(pdfPath: string): PdfResult {
  const docsRoot = DOCS_DIRS.find((root) => pdfPath.startsWith(root)) ?? DOCS_DIRS[0];
  const relative = path.relative(docsRoot, pdfPath);
  const procedureId = relative.split(path.sep)[0];
  const filename = path.basename(pdfPath);

  const { text, error } = extractTextFromPdf(pdfPath);

  if (error && !text) {
    return { pdfPath, procedureId, filename, kind: "error", charCount: 0, error };
  }

  const charCount = text.length;
  const kind: "text" | "image" = charCount >= TEXT_THRESHOLD ? "text" : "image";

  return {
    pdfPath,
    procedureId,
    filename,
    kind,
    charCount,
    extractedText: kind === "text" ? text : undefined,
  };
}

// ─── Save sidecar .pdf.md ─────────────────────────────────────────────────────

function saveSidecar(result: PdfResult, dryRun: boolean): boolean {
  if (result.kind !== "text" || !result.extractedText) return false;

  const sidecarPath = result.pdfPath.replace(/\.pdf$/i, ".pdf.md");
  const content = [
    `# ${result.filename.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ")}`,
    "",
    `> Contenido extraído de \`${result.filename}\` mediante pdftotext.`,
    `> Procedimiento: ${result.procedureId}`,
    "",
    result.extractedText,
  ].join("\n");

  if (!dryRun) {
    fs.writeFileSync(sidecarPath, content, "utf8");
  }
  return true;
}

// ─── Report ───────────────────────────────────────────────────────────────────

function printReport(results: PdfResult[]) {
  const textPdfs = results.filter((r) => r.kind === "text");
  const imagePdfs = results.filter((r) => r.kind === "image");
  const errorPdfs = results.filter((r) => r.kind === "error");

  console.log(`\n${"═".repeat(60)}`);
  console.log(`PDFs procesados: ${results.length}`);
  console.log(`  📄 Texto extraíble:  ${textPdfs.length}`);
  console.log(`  🖼  Imagen/diagrama:  ${imagePdfs.length}`);
  console.log(`  ✗  Error:            ${errorPdfs.length}`);

  if (textPdfs.length > 0) {
    console.log(`\n── PDFs con texto extraíble ──`);
    for (const r of textPdfs) {
      console.log(`  [TEXT ${String(r.charCount).padStart(6)} chars] ${r.procedureId}/${r.filename}`);
    }
  }

  if (imagePdfs.length > 0) {
    console.log(`\n── PDFs de imagen/diagrama (sin texto) ──`);
    for (const r of imagePdfs) {
      console.log(`  [IMG  ${String(r.charCount).padStart(6)} chars] ${r.procedureId}/${r.filename}`);
    }
  }

  if (errorPdfs.length > 0) {
    console.log(`\n── Errores ──`);
    for (const r of errorPdfs) {
      console.log(`  [ERR] ${r.procedureId}/${r.filename}: ${r.error}`);
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const reportOnly = args.includes("--report");
  const singlePdf = args.find((_, i) => args[i - 1] === "--pdf");

  if (dryRun) console.log("DRY RUN — no se escribirá ningún archivo");

  let pdfPaths: string[];
  if (singlePdf) {
    const resolved = path.isAbsolute(singlePdf) ? singlePdf : path.join(ROOT_DIR, singlePdf);
    pdfPaths = [resolved];
  } else {
    pdfPaths = findAllPdfs();
  }

  console.log(`Procesando ${pdfPaths.length} PDFs...`);

  const results: PdfResult[] = [];

  for (const pdfPath of pdfPaths) {
    const result = processPdf(pdfPath);
    results.push(result);

    const icon = result.kind === "text" ? "📄" : result.kind === "image" ? "🖼 " : "✗ ";
    const chars = `${result.charCount}c`.padStart(8);
    process.stdout.write(`  ${icon} ${chars}  ${result.procedureId}/${result.filename}\n`);

    if (!reportOnly && result.kind === "text") {
      const saved = saveSidecar(result, dryRun);
      if (saved && !dryRun) {
        process.stdout.write(`       → sidecar guardado\n`);
      }
    }
  }

  printReport(results);

  if (!reportOnly && !dryRun) {
    const jsonPath = path.join(ROOT_DIR, "content/data/pdf-classification.json");
    const report = {
      generatedAt: new Date().toISOString(),
      total: results.length,
      text: results.filter((r) => r.kind === "text").length,
      image: results.filter((r) => r.kind === "image").length,
      error: results.filter((r) => r.kind === "error").length,
      pdfs: results.map((r) => ({
        path: path.relative(ROOT_DIR, r.pdfPath),
        procedureId: r.procedureId,
        filename: r.filename,
        kind: r.kind,
        charCount: r.charCount,
      })),
    };
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), "utf8");
    console.log(`\nClasificación guardada en content/data/pdf-classification.json`);
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});

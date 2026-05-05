#!/usr/bin/env node

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  extractVademecumAttachmentLinks,
  mergeImportedDrugs,
  parseCommercialRowsFromText,
  parseFluidsFromText,
  parsePerfusionsFromText,
  parseWikiDrugsFromHtml,
  type CommercialRowInput,
  type DrugRecord,
  type FluidRowInput,
  type PerfusionRowInput,
} from "../lib/vademecum-sync.ts";
import { normalizeForSearch } from "../lib/vademecum-utils.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const VADEMECUM_URL = "https://servpub.madrid.es/manualsamur/bin/view/Menu/Cabecera%20principal/Vadem%C3%A9cum/WebHome";
const DATA_DIR = path.join(__dirname, "../content/data");
const DOCS_DIR = path.join(__dirname, "../docs");

interface PerfusionRecord {
  id: string;
  drug: string;
  drugId?: string;
  category: string;
  indication: string;
  recipe: string;
  recipeAlt?: string;
  rate: string;
  preparation: string;
  notes: string;
}

interface FluidRecord {
  id: string;
  name: string;
  presentation: string;
  type: string;
  osmolarity: string;
  sodium: string;
  chloride: string;
  glucose: string;
  calcium: string;
  potassium: string;
  lactate: string;
  ph: string;
  contraindications: string[];
}

interface CommercialRecord {
  drugId: string;
  activeIngredient: string;
  presentation: string;
  brandNames: string[];
}

function readJsonFile<T>(filename: string): T {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, filename), "utf8")) as T;
}

function writeJsonFile(filename: string, value: unknown) {
  fs.writeFileSync(path.join(DATA_DIR, filename), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function fetchText(url: string) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "ManualSAMUR-vademecum-sync/1.0 (personal use)",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching ${url}`);
  }

  return response.text();
}

async function downloadFile(url: string, destinationPath: string) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "ManualSAMUR-vademecum-sync/1.0 (personal use)",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} downloading ${url}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(destinationPath, buffer);
}

function pdfToText(pdfPath: string) {
  return execFileSync("pdftotext", ["-layout", pdfPath, "-"], {
    encoding: "utf8",
  });
}

function scoreNameSimilarity(left: string, right: string) {
  const normalizedLeft = normalizeForSearch(left);
  const normalizedRight = normalizeForSearch(right);

  if (normalizedLeft === normalizedRight) return 1;
  if (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft)) return 0.9;

  const leftWords = new Set(normalizedLeft.split(" ").filter(Boolean));
  const rightWords = new Set(normalizedRight.split(" ").filter(Boolean));
  const intersection = [...leftWords].filter((word) => rightWords.has(word)).length;
  const union = new Set([...leftWords, ...rightWords]).size;
  return union === 0 ? 0 : intersection / union;
}

function slugify(value: string) {
  return normalizeForSearch(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function resolveDrugIdByName(name: string, drugs: DrugRecord[], minimumScore = 0.55) {
  let bestMatch: { id: string; score: number } | null = null;

  for (const drug of drugs) {
    for (const candidate of [drug.name, ...drug.synonyms]) {
      const score = scoreNameSimilarity(name, candidate);
      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { id: drug.id, score };
      }
    }
  }

  return bestMatch && bestMatch.score >= minimumScore ? bestMatch.id : null;
}

function resolvePerfusionMatch(perfusion: PerfusionRowInput, existingPerfusions: PerfusionRecord[]) {
  let bestMatch: { id: string; score: number } | null = null;

  for (const existingPerfusion of existingPerfusions) {
    const score = scoreNameSimilarity(perfusion.drug, existingPerfusion.drug);
    if (!bestMatch || score > bestMatch.score) {
      bestMatch = { id: existingPerfusion.id, score };
    }
  }

  return bestMatch && bestMatch.score >= 0.55 ? bestMatch.id : null;
}

function mergeCommercialRows(
  importedRows: CommercialRowInput[],
  drugs: DrugRecord[],
): CommercialRecord[] {
  const isValidBrandName = (brandName: string) =>
    brandName.length > 0 &&
    !/madrid\.es\/samur/i.test(brandName) &&
    !/^nombre comercial$/i.test(brandName);

  const grouped = new Map<string, { activeIngredient: string; presentations: Set<string>; brandNames: Set<string> }>();

  for (const row of importedRows) {
    const drugId = resolveDrugIdByName(row.activeIngredient, drugs, 0.85);
    if (!drugId) continue;

    const current = grouped.get(drugId) ?? {
      activeIngredient: row.activeIngredient,
      presentations: new Set<string>(),
      brandNames: new Set<string>(),
    };

    if (row.presentation) {
      current.presentations.add(row.presentation);
    }
    for (const brandName of row.brandNames.filter((value) => isValidBrandName(value.trim()))) {
      current.brandNames.add(brandName);
    }

    grouped.set(drugId, current);
  }

  return [...grouped.entries()]
    .map(([drugId, row]) => ({
      drugId,
      activeIngredient: row.activeIngredient,
      presentation: [...row.presentations].join(" · "),
      brandNames: [...row.brandNames],
    }))
    .sort((left, right) =>
      left.activeIngredient.localeCompare(right.activeIngredient, "es", { sensitivity: "base" }),
    );
}

function isCleanPerfusionImport(perfusion: PerfusionRowInput) {
  return (
    perfusion.drug.toUpperCase() !== "FÁRMACO" &&
    perfusion.dilution.toUpperCase() !== "DILUCIÓN" &&
    perfusion.infusionRate.toUpperCase() !== "PERFUSIÓN" &&
    !/\n[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+/.test(perfusion.dose) &&
    !/\n[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+/.test(perfusion.dilution)
  );
}

function mergePerfusions(
  importedRows: PerfusionRowInput[],
  existingPerfusions: PerfusionRecord[],
  drugs: DrugRecord[],
): PerfusionRecord[] {
  const mergedById = new Map(existingPerfusions.map((perfusion) => [perfusion.id, perfusion]));

  for (const importedPerfusion of importedRows) {
    const matchedPerfusionId = resolvePerfusionMatch(importedPerfusion, existingPerfusions);
    if (matchedPerfusionId || !isCleanPerfusionImport(importedPerfusion)) {
      continue;
    }

    const drugId = resolveDrugIdByName(importedPerfusion.drug, drugs) ?? undefined;
    const drugCategory = drugId ? drugs.find((drug) => drug.id === drugId)?.category : undefined;
    const recordId = `${drugId ?? slugify(importedPerfusion.drug)}-perf`;

    mergedById.set(recordId, {
      id: recordId,
      drug: importedPerfusion.drug,
      drugId,
      category: drugCategory ?? "Pendiente de clasificar",
      indication: `Dosis anexo: ${importedPerfusion.dose}`,
      recipe: importedPerfusion.dilution,
      recipeAlt: undefined,
      rate: importedPerfusion.infusionRate,
      preparation: `Presentación del anexo: ${importedPerfusion.presentation}`,
      notes: `Dosis anexo: ${importedPerfusion.dose}`,
    });
  }

  return [...mergedById.values()].sort((left, right) =>
    left.drug.localeCompare(right.drug, "es", { sensitivity: "base" }),
  );
}

function mergeFluids(
  importedRows: FluidRowInput[],
  existingFluids: FluidRecord[],
): FluidRecord[] {
  if (existingFluids.length > 0) {
    return [...existingFluids].sort((left, right) =>
      left.name.localeCompare(right.name, "es", { sensitivity: "base" }),
    );
  }

  return importedRows
    .map((fluid) => ({
      id: slugify(fluid.name),
      name: fluid.name,
      presentation: "",
      type: "Pendiente de revisar",
      osmolarity: fluid.osmolarity,
      sodium: fluid.sodium ?? "",
      chloride: fluid.chloride ?? "",
      glucose: fluid.glucose ?? "",
      calcium: "",
      potassium: "",
      lactate: "",
      ph: fluid.ph ?? "",
      contraindications: fluid.contraindications,
    }))
    .sort((left, right) => left.name.localeCompare(right.name, "es", { sensitivity: "base" }));
}

async function main() {
  const existingDrugs = readJsonFile<DrugRecord[]>("vademecum.json");
  const existingPerfusions = readJsonFile<PerfusionRecord[]>("perfusiones.json");
  const existingFluids = readJsonFile<FluidRecord[]>("fluidos.json");

  console.log("Fetching vademecum wiki page...");
  const html = await fetchText(VADEMECUM_URL);
  const attachments = extractVademecumAttachmentLinks(html);

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "manualsamur-vademecum-"));
  try {
    const fluidsPdfPath = path.join(DOCS_DIR, "Fluidos.pdf");
    const perfusionsPdfPath = path.join(DOCS_DIR, "ListaPerfusiones.pdf");
    const commercialPdfPath = path.join(DOCS_DIR, "vademecum_identificacion.pdf");

    console.log("Downloading annex PDFs...");
    await downloadFile(attachments.fluidsPdf, fluidsPdfPath);
    await downloadFile(attachments.perfusionsPdf, perfusionsPdfPath);
    await downloadFile(attachments.commercialNamesPdf, commercialPdfPath);

    const localFluidsPdfPath = path.join(tempDir, "Fluidos.pdf");
    const localPerfusionsPdfPath = path.join(tempDir, "ListaPerfusiones.pdf");
    const localCommercialPdfPath = path.join(tempDir, "vademecum_identificacion.pdf");
    fs.copyFileSync(fluidsPdfPath, localFluidsPdfPath);
    fs.copyFileSync(perfusionsPdfPath, localPerfusionsPdfPath);
    fs.copyFileSync(commercialPdfPath, localCommercialPdfPath);

    console.log("Parsing wiki and annex content...");
    const importedDrugs = parseWikiDrugsFromHtml(html);
    const importedPerfusions = parsePerfusionsFromText(pdfToText(localPerfusionsPdfPath));
    const importedFluids = parseFluidsFromText(pdfToText(localFluidsPdfPath));
    const importedCommercials = parseCommercialRowsFromText(pdfToText(localCommercialPdfPath));

    const mergedDrugs = mergeImportedDrugs(existingDrugs, importedDrugs);
    const mergedPerfusions = mergePerfusions(importedPerfusions, existingPerfusions, mergedDrugs);
    const mergedFluids = mergeFluids(importedFluids, existingFluids);
    const mergedCommercials = mergeCommercialRows(importedCommercials, mergedDrugs);

    console.log("Writing JSON datasets...");
    writeJsonFile("vademecum.json", mergedDrugs);
    writeJsonFile("perfusiones.json", mergedPerfusions);
    writeJsonFile("fluidos.json", mergedFluids);
    writeJsonFile("vademecum-comerciales.json", mergedCommercials);

    console.log(
      `Done: ${mergedDrugs.length} fármacos, ${mergedPerfusions.length} perfusiones, ${mergedFluids.length} fluidos, ${mergedCommercials.length} relaciones comerciales.`,
    );
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

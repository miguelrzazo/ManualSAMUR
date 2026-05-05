import * as cheerio from "cheerio";
import { normalizeForSearch } from "./vademecum-utils.ts";

const WIKI_BASE = "https://servpub.madrid.es";

export interface DrugRecord {
  id: string;
  name: string;
  synonyms: string[];
  category: string;
  subcategory: string;
  presentation: string;
  funcion?: string;
  indication: string;
  dose: string;
  route: string[];
  contraindications: string;
  efectos_secundarios?: string;
  precauciones?: string;
  interacciones?: string;
  incompatibilidades?: string;
  notes?: string;
}

export interface WikiDrugEntry {
  sourceAnchor: string;
  initialLetter: string;
  name: string;
  presentation: string;
  funcion?: string;
  indication: string;
  dose: string;
  contraindications: string;
  efectos_secundarios?: string;
  precauciones?: string;
  interacciones?: string;
  incompatibilidades?: string;
  notes?: string;
}

export interface CommercialRowInput {
  activeIngredient: string;
  presentation: string;
  brandNames: string[];
}

export interface PerfusionRowInput {
  drug: string;
  presentation: string;
  dose: string;
  dilution: string;
  infusionRate: string;
}

export interface FluidRowInput {
  name: string;
  osmolarity: string;
  sodium?: string;
  chloride?: string;
  glucose?: string;
  ph?: string;
  contraindications: string[];
}

export function extractVademecumAttachmentLinks(html: string) {
  const $ = cheerio.load(html);
  const links = {
    fluidsPdf: "",
    perfusionsPdf: "",
    commercialNamesPdf: "",
  };

  $("a[href]").each((_, element) => {
    const href = $(element).attr("href") ?? "";
    if (href.includes("vademecum_Fluidos.pdf")) {
      links.fluidsPdf = href.startsWith("http") ? href : `${WIKI_BASE}${href}`;
    }
    if (href.includes("vademecum_ListaPerfusiones.pdf")) {
      links.perfusionsPdf = href.startsWith("http") ? href : `${WIKI_BASE}${href}`;
    }
    if (href.includes("vademecum_identificacion.pdf")) {
      links.commercialNamesPdf = href.startsWith("http") ? href : `${WIKI_BASE}${href}`;
    }
  });

  return links;
}

const WIKI_LABELS = [
  "Función",
  "Acciones",
  "Indicaciones",
  "Dosis",
  "Contraindicaciones",
  "Precauciones",
  "Advertencias y precauciones especiales de uso",
  "Interacciones",
  "Efectos secundarios",
  "Incompatibilidades",
  "Presentación",
];

function squeezeWhitespace(value: string) {
  return value.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function getTagName(element: cheerio.Element) {
  return element?.type === "tag" ? element.tagName?.toLowerCase?.() ?? null : null;
}

function getNodeText($: ReturnType<typeof cheerio.load>, element: cheerio.Element) {
  const tagName = getTagName(element);
  if (tagName === "ul" || tagName === "ol") {
    return $(element)
      .find("li")
      .map((_index, li) => `- ${squeezeWhitespace($(li).text())}`)
      .get()
      .filter(Boolean)
      .join("\n");
  }

  const clone = $(element).clone();
  clone.find("br").replaceWith("\n");
  return squeezeWhitespace(clone.text());
}

function splitLabeledSegments(text: string) {
  const escaped = WIKI_LABELS.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const regex = new RegExp(`(${escaped.join("|")})\\s*:`, "g");
  const matches = [...text.matchAll(regex)];

  if (matches.length === 0) return [] as Array<{ label: string; value: string }>;

  return matches.map((match, index) => {
    const start = match.index ?? 0;
    const nextStart = matches[index + 1]?.index ?? text.length;
    const label = match[1];
    const value = text
      .slice(start + match[0].length, nextStart)
      .trim()
      .replace(/\n+/g, "\n");
    return { label, value };
  });
}

function appendField(currentValue: string, nextValue: string) {
  if (!nextValue) return currentValue;
  if (!currentValue) return nextValue;
  return `${currentValue}\n${nextValue}`;
}

function pushDrug(
  drugs: WikiDrugEntry[],
  currentDrug: (Partial<WikiDrugEntry> & { noteSections?: string[] }) | null,
) {
  if (!currentDrug?.name || !currentDrug.sourceAnchor) return;
  drugs.push({
    sourceAnchor: currentDrug.sourceAnchor,
    initialLetter: currentDrug.initialLetter ?? "#",
    name: currentDrug.name,
    presentation: currentDrug.presentation ?? "",
    funcion: currentDrug.funcion || undefined,
    indication: currentDrug.indication ?? "",
    dose: currentDrug.dose ?? "",
    contraindications: currentDrug.contraindications ?? "",
    efectos_secundarios: currentDrug.efectos_secundarios || undefined,
    precauciones: currentDrug.precauciones || undefined,
    interacciones: currentDrug.interacciones || undefined,
    incompatibilidades: currentDrug.incompatibilidades || undefined,
    notes: currentDrug.noteSections?.filter(Boolean).join("\n") || undefined,
  });
}

export function parseWikiDrugsFromHtml(html: string): WikiDrugEntry[] {
  const $ = cheerio.load(html);
  const container =
    $(".wiki-content").first().length > 0
      ? $(".wiki-content").first()
      : $("#xwikicontent").first().length > 0
        ? $("#xwikicontent").first()
        : $("body").first();
  const drugs: WikiDrugEntry[] = [];
  let currentLetter = "#";
  let currentDrug: (Partial<WikiDrugEntry> & { noteSections?: string[] }) | null = null;
  let lastField: "dose" | "indication" | "contraindications" | "notes" | null = null;

  const elements = (container.length ? container.children().toArray() : $.root().children().toArray()) as cheerio.Element[];
  for (const element of elements) {
    const tagName = getTagName(element);
    const text = getNodeText($, element);
    if (!text) continue;

    if (tagName === "h1" && text.length === 1) {
      pushDrug(drugs, currentDrug);
      currentDrug = null;
      currentLetter = text.toUpperCase();
      lastField = null;
      continue;
    }

    if (tagName === "p" && $(element).attr("id") && $(element).find("ins strong, strong").length > 0 && !text.includes(":")) {
      pushDrug(drugs, currentDrug);
      currentDrug = {
        sourceAnchor: $(element).attr("id") ?? "",
        initialLetter: currentLetter,
        name: text,
        noteSections: [],
      };
      lastField = null;
      continue;
    }

    if (!currentDrug || /^Inicio Vademécum$/i.test(text)) continue;

    const segments = splitLabeledSegments(text);
    if (segments.length > 0) {
      for (const segment of segments) {
        if (!segment.value) continue;
        switch (segment.label) {
          case "Función":
          case "Acciones":
            currentDrug.funcion = appendField(currentDrug.funcion ?? "", segment.value);
            lastField = null;
            break;
          case "Indicaciones":
            currentDrug.indication = appendField(currentDrug.indication ?? "", segment.value);
            lastField = "indication";
            break;
          case "Dosis":
            currentDrug.dose = appendField(currentDrug.dose ?? "", segment.value);
            lastField = "dose";
            break;
          case "Contraindicaciones":
            currentDrug.contraindications = appendField(currentDrug.contraindications ?? "", segment.value);
            lastField = "contraindications";
            break;
          case "Efectos secundarios":
            currentDrug.efectos_secundarios = appendField(currentDrug.efectos_secundarios ?? "", segment.value);
            lastField = null;
            break;
          case "Precauciones":
          case "Advertencias y precauciones especiales de uso":
            currentDrug.precauciones = appendField(currentDrug.precauciones ?? "", segment.value);
            lastField = null;
            break;
          case "Interacciones":
            currentDrug.interacciones = appendField(currentDrug.interacciones ?? "", segment.value);
            lastField = null;
            break;
          case "Incompatibilidades":
            currentDrug.incompatibilidades = appendField(currentDrug.incompatibilidades ?? "", segment.value);
            lastField = null;
            break;
          case "Presentación":
            currentDrug.presentation = appendField(currentDrug.presentation ?? "", segment.value);
            lastField = null;
            break;
          default:
            currentDrug.noteSections?.push(`${segment.label}: ${segment.value}`);
            lastField = "notes";
            break;
        }
      }
      continue;
    }

    if (lastField === "dose") {
      currentDrug.dose = appendField(currentDrug.dose ?? "", text);
      continue;
    }
    if (lastField === "indication") {
      currentDrug.indication = appendField(currentDrug.indication ?? "", text);
      continue;
    }
    if (lastField === "contraindications") {
      currentDrug.contraindications = appendField(currentDrug.contraindications ?? "", text);
      continue;
    }
    if (lastField === "notes") {
      currentDrug.noteSections?.push(text);
    }
  }

  pushDrug(drugs, currentDrug);
  return drugs;
}

function slugifyDrugId(value: string) {
  return normalizeForSearch(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function scoreNameSimilarity(left: string, right: string) {
  const normLeft = normalizeForSearch(left);
  const normRight = normalizeForSearch(right);
  if (normLeft === normRight) return 1;
  if (normLeft.includes(normRight) || normRight.includes(normLeft)) return 0.9;

  const leftWords = new Set(normLeft.split(" ").filter(Boolean));
  const rightWords = new Set(normRight.split(" ").filter(Boolean));
  const intersection = [...leftWords].filter((word) => rightWords.has(word)).length;
  const union = new Set([...leftWords, ...rightWords]).size;
  return union === 0 ? 0 : intersection / union;
}

function resolveExistingDrugId(importedDrug: WikiDrugEntry, existingDrugs: DrugRecord[]) {
  let bestMatch: { id: string; score: number } | null = null;

  for (const existingDrug of existingDrugs) {
    const candidates = [existingDrug.name, ...existingDrug.synonyms];
    for (const candidate of candidates) {
      const score = scoreNameSimilarity(importedDrug.name, candidate);
      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { id: existingDrug.id, score };
      }
    }
  }

  return bestMatch && bestMatch.score >= 0.55 ? bestMatch.id : null;
}

export function mergeImportedDrugs(
  existingDrugs: DrugRecord[],
  importedDrugs: WikiDrugEntry[],
): DrugRecord[] {
  const existingById = new Map(existingDrugs.map((drug) => [drug.id, drug]));
  const mergedById = new Map<string, DrugRecord>();

  for (const importedDrug of importedDrugs) {
    const resolvedId = resolveExistingDrugId(importedDrug, existingDrugs) ?? slugifyDrugId(importedDrug.name);
    const existingDrug = existingById.get(resolvedId);

    mergedById.set(resolvedId, {
      id: resolvedId,
      name: importedDrug.name,
      synonyms: existingDrug?.synonyms ?? [],
      category: existingDrug?.category ?? "Pendiente de clasificar",
      subcategory: existingDrug?.subcategory ?? "Revisar manualmente",
      presentation: importedDrug.presentation || existingDrug?.presentation || "",
      funcion: importedDrug.funcion || existingDrug?.funcion,
      indication: importedDrug.indication || existingDrug?.indication || "",
      dose: importedDrug.dose || existingDrug?.dose || "",
      route: existingDrug?.route ?? [],
      contraindications: importedDrug.contraindications || existingDrug?.contraindications || "",
      efectos_secundarios: importedDrug.efectos_secundarios || existingDrug?.efectos_secundarios,
      precauciones: importedDrug.precauciones || existingDrug?.precauciones,
      interacciones: importedDrug.interacciones || existingDrug?.interacciones,
      incompatibilidades: importedDrug.incompatibilidades || existingDrug?.incompatibilidades,
      notes: importedDrug.notes || existingDrug?.notes,
    });
  }

  for (const existingDrug of existingDrugs) {
    if (!mergedById.has(existingDrug.id)) {
      mergedById.set(existingDrug.id, existingDrug);
    }
  }

  return [...mergedById.values()].sort((left, right) =>
    left.name.localeCompare(right.name, "es", { sensitivity: "base" }),
  );
}

export function parseCommercialRowsFromText(text: string): CommercialRowInput[] {
  const rows: CommercialRowInput[] = [];
  let currentRow: CommercialRowInput | null = null;
  let pendingBrandNames: string[] = [];
  let preferCurrentPendingBrands = false;

  const flushCurrentRow = () => {
    if (!currentRow) return;
    if (currentRow.brandNames.length === 0 && pendingBrandNames.length > 0) {
      currentRow.brandNames.push(...pendingBrandNames);
      pendingBrandNames = [];
    }
    rows.push(currentRow);
    currentRow = null;
    preferCurrentPendingBrands = false;
  };

  const getIngredientToken = (ingredient: string) =>
    normalizeForSearch(ingredient)
      .split(" ")
      .find((word) => word.length >= 4) ?? normalizeForSearch(ingredient);

  const brandBelongsToCurrentIngredient = (brandName: string, ingredient: string) => {
    const ingredientToken = getIngredientToken(ingredient);
    return ingredientToken.length > 0 && normalizeForSearch(brandName).includes(ingredientToken);
  };

  for (const rawLine of text.split("\n")) {
    const line = rawLine.replace(/\f/g, "");
    if (!line.trim()) continue;

    if (/^(Identificación|Nombre Comercial|Principio Activo|Presentación|Manual de Procedimientos)/i.test(line.trim())) {
      continue;
    }

    const isIndented = /^\s+/.test(rawLine);
    const parts = line.trim().split(/\s{2,}/).filter(Boolean);

    if (!isIndented && parts.length >= 2) {
      flushCurrentRow();
      const prefetchedBrandNames = [...pendingBrandNames];
      currentRow = {
        activeIngredient: parts[0],
        presentation: parts[1],
        brandNames: [],
      };
      if (prefetchedBrandNames.length > 0) {
        currentRow.brandNames.push(...prefetchedBrandNames);
        pendingBrandNames = [];
      }
      if (parts.length >= 3) {
        currentRow.brandNames.push(parts.slice(2).join(" "));
      }
      preferCurrentPendingBrands = prefetchedBrandNames.length > 0 || parts.length < 3;
      continue;
    }

    if (isIndented && parts.length >= 2 && currentRow) {
      const activeIngredient: string = currentRow.activeIngredient;
      flushCurrentRow();
      currentRow = {
        activeIngredient,
        presentation: parts[0],
        brandNames: [parts.slice(1).join(" ")],
      };
      preferCurrentPendingBrands = true;
      continue;
    }

    if (isIndented && parts.length === 1) {
      if (
        currentRow &&
        (preferCurrentPendingBrands || brandBelongsToCurrentIngredient(parts[0], currentRow.activeIngredient))
      ) {
        currentRow.brandNames.push(parts[0]);
      } else {
        pendingBrandNames.push(parts[0]);
      }
    }
  }

  flushCurrentRow();
  return rows;
}

export function parsePerfusionsFromText(text: string): PerfusionRowInput[] {
  const rows: PerfusionRowInput[] = [];
  let currentRow: PerfusionRowInput | null = null;

  for (const rawLine of text.split("\n")) {
    const line = rawLine.replace(/\f/g, "");
    if (!line.trim()) continue;

    const trimmedLeft = line.trimStart();
    const match = trimmedLeft.match(/^(\S.*?)\s{2,}(\S.*?)\s{2,}(\S.*?)\s{2,}(\S.*?)\s{2,}(.+?)\s*$/);
    if (match) {
      currentRow = {
        drug: match[1].trim(),
        presentation: match[2].trim(),
        dose: match[3].trim(),
        dilution: match[4].trim(),
        infusionRate: match[5].trim(),
      };
      rows.push(currentRow);
      continue;
    }

    if (currentRow) {
      currentRow.infusionRate = appendField(currentRow.infusionRate, line.trim());
    }
  }

  return rows;
}

export function parseFluidsFromText(text: string): FluidRowInput[] {
  const rows: FluidRowInput[] = [];
  let currentRow: FluidRowInput | null = null;

  for (const rawLine of text.split("\n")) {
    const line = rawLine.replace(/\f/g, "");
    if (!line.trim()) continue;

    const trimmedLeft = line.trimStart();
    const match = trimmedLeft.match(/^([A-Za-zÁÉÍÓÚÑáéíóúñ0-9%(),.\-\/ ]+?)\s{2,}(\d+)(.*)$/);
    if (match) {
      const numericValues = [...match[3].matchAll(/\b\d+(?:,\d+)?\b/g)].map((value) => value[0]);
      const ph = numericValues.at(-1);
      const middleValues = ph ? numericValues.slice(0, -1) : numericValues;
      const fluidRow: FluidRowInput = {
        name: match[1].trim(),
        osmolarity: match[2].trim(),
        contraindications: [],
      };

      if (middleValues.length >= 2) {
        fluidRow.sodium = middleValues[0];
        fluidRow.chloride = middleValues[1];
      } else if (middleValues.length === 1) {
        fluidRow.glucose = middleValues[0];
      }

      if (ph) {
        fluidRow.ph = ph;
      }

      currentRow = {
        ...fluidRow,
      };
      rows.push(currentRow);
      continue;
    }

    if (currentRow) {
      currentRow.contraindications.push(line.trim());
    }
  }

  return rows;
}

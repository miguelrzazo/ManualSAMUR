import fs from "node:fs";
import path from "node:path";
import * as cheerio from "cheerio";

const WIKI_BASE = "https://servpub.madrid.es";
const MAIN_DATA_DIR = "content/data";
const ABBREVIATIONS_DATA_PATH = path.join(MAIN_DATA_DIR, "abreviaturas.json");
const COLLABORATORS_DATA_PATH = path.join(MAIN_DATA_DIR, "colaboradores.json");
const MAIN_LINKS_DATA_PATH = path.join(MAIN_DATA_DIR, "main-links.json");

export interface AbbreviationEntry {
  abbreviation: string;
  meaning: string;
}

export interface AbbreviationSection {
  letter: string;
  entries: AbbreviationEntry[];
}

export interface CollaboratorsData {
  sourceUrl: string;
  updatedAt: string;
  list: string[];
  blocks: {
    coordination: string[];
    technicalReview: string[];
    designAndProgramming: string[];
  };
}

export interface MainLinksData {
  sourceUrl: string;
  updatedAt: string;
  avisoImportanteUrl: string;
  samurEmail: string;
  officialWebUrl: string;
  abbreviationsUrl: string;
  collaboratorsUrl: string;
}

const DEFAULT_COLLABORATORS_DATA: CollaboratorsData = {
  sourceUrl: "",
  updatedAt: "",
  list: [],
  blocks: {
    coordination: [],
    technicalReview: [],
    designAndProgramming: [],
  },
};

const DEFAULT_MAIN_LINKS_DATA: MainLinksData = {
  sourceUrl: "",
  updatedAt: "",
  avisoImportanteUrl: "",
  samurEmail: "samur@madrid.es",
  officialWebUrl: "https://www.madrid.es/samur",
  abbreviationsUrl: "",
  collaboratorsUrl: "",
};

function cleanText(value: string): string {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toAbsoluteUrl(href: string | undefined): string {
  if (!href) return "";
  if (/^https?:\/\//i.test(href)) return href;
  if (href.startsWith("/")) return `${WIKI_BASE}${href}`;
  return href;
}

function extractUpdatedAt(text: string): string {
  const tagged = text.match(/ultima modificaci[oó]n[^\d]*(\d{2}\/\d{2}\/\d{4})/i);
  if (tagged?.[1]) return tagged[1];

  const fallback = text.match(/\b(\d{2}\/\d{2}\/\d{4})\b/);
  return fallback?.[1] ?? "";
}

function toLeadKey(value: string): "coordination" | "technicalReview" | "designAndProgramming" | null {
  const normalized = cleanText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();

  if (normalized.includes("DIRECCION") && normalized.includes("COORDINACION")) return "coordination";
  if (normalized.includes("REVISION") && normalized.includes("TECNICA")) return "technicalReview";
  if (normalized.includes("DISENO") && normalized.includes("PROGRAMACION")) return "designAndProgramming";
  return null;
}

export function parseAbbreviationsFromHtml(html: string): AbbreviationSection[] {
  const $ = cheerio.load(html);
  const root = $("#xwikicontent").first();
  if (!root.length) return [];

  const sections: AbbreviationSection[] = [];

  root.children("h1").each((_idx, heading) => {
    const letter = cleanText($(heading).text()).toUpperCase();
    if (!/^[A-Z]$/.test(letter)) return;

    const entries: AbbreviationEntry[] = [];
    let cursor = $(heading).next();

    while (cursor.length) {
      const node = cursor.get(0);
      const tagName = node && node.type === "tag" ? node.tagName : "";
      if (tagName === "h1") break;

      if (tagName === "table") {
        cursor.find("tr").each((_rowIndex, row) => {
          const cells = $(row).find("td");
          const abbreviation = cleanText(cells.eq(0).text());
          const meaning = cleanText(cells.eq(1).text());
          if (abbreviation && meaning) {
            entries.push({ abbreviation, meaning });
          }
        });
      }
      cursor = cursor.next();
    }

    if (entries.length > 0) {
      sections.push({ letter, entries });
    }
  });

  return sections;
}

export function parseCollaboratorsFromHtml(html: string, sourceUrl = ""): CollaboratorsData {
  const $ = cheerio.load(html);
  const root = $("#xwikicontent").first();
  if (!root.length) {
    return { ...DEFAULT_COLLABORATORS_DATA, sourceUrl };
  }

  const updatedAt = extractUpdatedAt(cleanText($("body").text()));

  const listLead = root.find("p.lead").filter((_idx, element) =>
    cleanText($(element).text()).toUpperCase().includes("LISTADO DE COLABORADORES"),
  ).first();

  const allNames = new Set<string>();
  const listTable = listLead.nextAll("table").first();
  listTable.find("td").each((_idx, cell) => {
    const name = cleanText($(cell).text());
    if (name) allNames.add(name);
  });

  const blocks = {
    coordination: [] as string[],
    technicalReview: [] as string[],
    designAndProgramming: [] as string[],
  };

  root.find("p.lead").each((_idx, element) => {
    const blockKey = toLeadKey($(element).text());
    if (!blockKey) return;

    const members: string[] = [];
    const list = $(element).nextAll("ul").first();
    list.find("li").each((_liIdx, li) => {
      const member = cleanText($(li).text());
      if (member) members.push(member);
    });

    blocks[blockKey] = members;
  });

  return {
    sourceUrl,
    updatedAt,
    list: [...allNames],
    blocks,
  };
}

export function parseMainLinksFromHtml(html: string, sourceUrl = ""): MainLinksData {
  const $ = cheerio.load(html);
  const root = $("#xwikicontent").first();

  const avisoImportanteUrl = toAbsoluteUrl($("a[href*='AvisoImportante.pdf']").first().attr("href"));
  const samurEmailHref = $("a[href^='mailto:']").filter((_idx, el) =>
    ($(el).attr("href") ?? "").toLowerCase().includes("samur@madrid.es"),
  ).first().attr("href");
  const officialWebUrl = toAbsoluteUrl($("a[href*='madrid.es/samur']").first().attr("href"));
  const abbreviationsUrl = toAbsoluteUrl($("a[href*='/Abreviaturas/']").first().attr("href"));
  const collaboratorsUrl = toAbsoluteUrl($("a[href*='/Colaboradores/']").first().attr("href"));

  return {
    sourceUrl,
    updatedAt: extractUpdatedAt(cleanText($("body").text())),
    avisoImportanteUrl,
    samurEmail: samurEmailHref?.replace(/^mailto:/i, "") || DEFAULT_MAIN_LINKS_DATA.samurEmail,
    officialWebUrl: officialWebUrl || DEFAULT_MAIN_LINKS_DATA.officialWebUrl,
    abbreviationsUrl,
    collaboratorsUrl,
  };
}

function readJson<T>(filePath: string, fallback: T, cwd = process.cwd()): T {
  const absolutePath = path.join(cwd, filePath);
  if (!fs.existsSync(absolutePath)) return fallback;
  try {
    const parsed = JSON.parse(fs.readFileSync(absolutePath, "utf8"));
    return parsed as T;
  } catch {
    return fallback;
  }
}

export function readAbbreviationsData(cwd = process.cwd()): AbbreviationSection[] {
  return readJson<AbbreviationSection[]>(ABBREVIATIONS_DATA_PATH, [], cwd);
}

export function readCollaboratorsData(cwd = process.cwd()): CollaboratorsData {
  return readJson<CollaboratorsData>(COLLABORATORS_DATA_PATH, DEFAULT_COLLABORATORS_DATA, cwd);
}

export function readMainLinksData(cwd = process.cwd()): MainLinksData {
  return readJson<MainLinksData>(MAIN_LINKS_DATA_PATH, DEFAULT_MAIN_LINKS_DATA, cwd);
}

export const MAIN_CONTENT_PATHS = {
  abbreviations: ABBREVIATIONS_DATA_PATH,
  collaborators: COLLABORATORS_DATA_PATH,
  mainLinks: MAIN_LINKS_DATA_PATH,
};

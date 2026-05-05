#!/usr/bin/env npx tsx
/**
 * scrape-wiki.ts — Scraper for servpub.madrid.es XWiki → content/procedures/*.md
 *
 * Usage:
 *   npx tsx scripts/scrape-wiki.ts                    — scrape all procedures
 *   npx tsx scripts/scrape-wiki.ts --new-only         — skip procedures that already have a .md file
 *   npx tsx scripts/scrape-wiki.ts --id "PARADA CARDIORRESPIRATORIA"   — single procedure by wiki title
 *   npx tsx scripts/scrape-wiki.ts --list             — list all discovered procedure URLs
 *   npx tsx scripts/scrape-wiki.ts --section SVA      — only scrape SVA section
 *
 * Fetches raw XWiki 2.0 markup via ?xpage=plain&raw=1, converts to Markdown,
 * and creates/updates content/procedures/*.md files.
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WIKI_BASE = "https://servpub.madrid.es/manualsamur";
const REST_BASE = `${WIKI_BASE}/rest/wikis/xwiki`;
const PROCEDURES_DIR = path.join(__dirname, "../content/procedures");
const DELAY_MS = 1000;

const HEADERS = {
  "Accept": "application/xml, text/xml",
  "User-Agent": "ManualSAMUR-scraper/3.0 (educational, personal use)",
};

// ─── Section mapping ──────────────────────────────────────────────────────────

function getSection(url: string): string {
  const u = decodeURIComponent(url);
  if (/Procedimientos SVA|SVA/i.test(u)) return "SVA";
  if (/Procedimientos SVB|SVB/i.test(u)) return "SVB";
  if (/Técnicas/i.test(u)) return "Técnicas";
  if (/Procedimientos Operativos/i.test(u)) return "Operativos";
  if (/Procedimientos Administrativos/i.test(u)) return "Administrativos";
  if (/Central de Comunicaciones|Comunicaciones/i.test(u)) return "Comunicaciones";
  if (/Intervinientes|Psicol/i.test(u)) return "Psicológicos";
  return "General";
}

// ─── ID/slug generation ───────────────────────────────────────────────────────

function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60)
    .replace(/-$/, "");
}

function sectionToSubfolder(section: string): string {
  return section
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function walkProceduresDir(dir: string): string[] {
  const files: string[] = [];
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walkProceduresDir(p));
    else if (entry.isFile() && entry.name.endsWith(".md")) files.push(p);
  }
  return files;
}

/** Load all existing procedure titles → id map for matching */
function loadExistingProcedures(): Map<string, string> {
  const map = new Map<string, string>();
  if (!fs.existsSync(PROCEDURES_DIR)) return map;
  for (const filePath of walkProceduresDir(PROCEDURES_DIR)) {
    const content = fs.readFileSync(filePath, "utf8");
    const titleMatch = content.match(/^title:\s*["']?(.+?)["']?\s*$/m);
    const idMatch = content.match(/^id:\s*["']?(.+?)["']?\s*$/m);
    if (titleMatch && idMatch) {
      const normalizedTitle = titleMatch[1].toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
      map.set(normalizedTitle, idMatch[1]);
    }
  }
  return map;
}

function wordSet(s: string): Set<string> {
  return new Set(
    s.split(/\s+/).filter((w) => w.length > 2 && !/^(de|la|el|los|las|un|una|del|por|en|con|al|y|o|e|u|a)$/.test(w))
  );
}

function jaccardWords(a: string, b: string): number {
  const setA = wordSet(a);
  const setB = wordSet(b);
  const intersection = new Set([...setA].filter((w) => setB.has(w)));
  const union = new Set([...setA, ...setB]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

function findLocalId(wikiTitle: string, existingMap: Map<string, string>): string | null {
  const normalized = wikiTitle.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

  // Exact match
  if (existingMap.has(normalized)) return existingMap.get(normalized)!;

  // Fuzzy: contains match
  for (const [existingTitle, id] of existingMap) {
    if (normalized.includes(existingTitle) || existingTitle.includes(normalized)) return id;
  }

  // Word-level Jaccard similarity ≥ 0.65
  let bestScore = 0;
  let bestId: string | null = null;
  for (const [existingTitle, id] of existingMap) {
    const score = jaccardWords(normalized, existingTitle);
    if (score > bestScore && score >= 0.65) {
      bestScore = score;
      bestId = id;
    }
  }
  return bestId;
}

// ─── XWiki REST API ───────────────────────────────────────────────────────────

interface ProcedureSpace {
  title: string;
  url: string;       // xwikiAbsoluteUrl for the space
  section: string;
  depth: number;
}

async function getAllProcedureSpaces(): Promise<ProcedureSpace[]> {
  const res = await fetch(`${REST_BASE}/spaces`, { headers: HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching spaces`);
  const xml = await res.text();

  // Extract all xwikiAbsoluteUrl entries with their context
  const spaceRegex = /<space>[\s\S]*?<name>([^<]+)<\/name>[\s\S]*?<xwikiAbsoluteUrl>([^<]+)<\/xwikiAbsoluteUrl>[\s\S]*?<\/space>/g;
  const spaces: ProcedureSpace[] = [];
  let match: RegExpExecArray | null;

  while ((match = spaceRegex.exec(xml)) !== null) {
    const [, name, absUrl] = match;
    const url = absUrl.trim();

    // Parse path depth (segments after /bin/view/)
    const pathMatch = url.match(/\/bin\/view\/(.+?)(?:\/?$)/);
    if (!pathMatch) continue;

    const pathParts = decodeURIComponent(pathMatch[1])
      .split("/")
      .filter((p) => p && p !== "WebHome");
    const depth = pathParts.length;

    // Skip shallow paths (categories, navigation, system pages)
    if (depth < 2) continue;

    // Skip system/nav spaces
    if (/^(xwiki|main|blog|menu|authservice|panels|exportar|etiquetas|cabecera|mapa|colaboradores|calendario|prueba|tipos de asistencia)$/i.test(name)) continue;
    if (/^webhome$|^otros$/i.test(name)) continue;

    // Skip known category-level containers (not actual procedure pages)
    if (/^(Procedimientos SVA|Procedimientos SVB|Procedimientos Administrativos|Procedimientos Operativos|Procedimientos asistenciales|Urgencias cardiovasculares|Urgencias digestivas|Urgencias endocrino-metab|Urgencias nefrourol|Urgencias neurol|Urgencias pediátr|Urgencias por agentes|Urgencias respiratorias|Urgencias traumatol|Urgencias obst|Urgencias psiqui|Intoxicaciones$|Traumatismos$|Técnicas$|Cardiacos$|Obstetricia$|Vasculares$|Trauma$|Sondajes$|Intervinientes$|Actuaciones Conjuntas|Con |Recomendaciones específicas$|Vía aérea y respiración|Vía Intraósea)/.test(name)) continue;

    // Only include spaces that look like procedure/technique pages (not category/organization pages)
    const section = getSection(url);
    if (section === "General" && depth < 3) continue;

    spaces.push({ title: name, url, section, depth });
  }

  // Deduplicate by URL
  const seen = new Set<string>();
  return spaces.filter((s) => {
    if (seen.has(s.url)) return false;
    seen.add(s.url);
    return true;
  });
}

// ─── Content fetching + XWiki markup conversion ───────────────────────────────

function htmlEntitiesDecode(s: string): string {
  return s
    .replace(/&#123;/g, "{")
    .replace(/&#125;/g, "}")
    .replace(/&#60;/g, "<")
    .replace(/&#62;/g, ">")
    .replace(/&#38;/g, "&")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function extractRawFromHtml(html: string): string {
  // The ?xpage=plain page wraps content in <pre>...</pre>
  const match = html.match(/<pre[^>]*>([\s\S]+?)<\/pre>/);
  if (match) return htmlEntitiesDecode(match[1]);
  // Fallback: just decode the whole thing
  return htmlEntitiesDecode(html);
}

/** Convert drug anchorId (CamelCase) to display name */
function anchorIdToDrugName(anchorId: string): string {
  // Known mappings
  const known: Record<string, string> = {
    "Adrenalina": "Adrenalina",
    "Amiodarona": "Amiodarona",
    "Lidocaina": "Lidocaína",
    "SulfatodeMagnesio": "Sulfato de Magnesio",
    "BicarbonatoSodico": "Bicarbonato Sódico",
    "Cloruropotasico": "Cloruro Potásico",
    "GluconatoCalcico": "Gluconato Cálcico",
    "Atropina": "Atropina",
    "Midazolam": "Midazolam",
    "Morfina": "Morfina",
    "Ketamina": "Ketamina",
    "Fentanilo": "Fentanilo",
    "Propofol": "Propofol",
    "Salbutamol": "Salbutamol",
    "Dexametasona": "Dexametasona",
    "Metilprednisolona": "Metilprednisolona",
    "Naloxona": "Naloxona",
    "Flumazenilo": "Flumazenilo",
    "Labetalol": "Labetalol",
    "Nitroglicerina": "Nitroglicerina",
    "Furosemida": "Furosemida",
    "Aspirina": "Ácido Acetilsalicílico",
    "Heparina": "Heparina",
    "Glucosa": "Glucosa",
    "Glucagon": "Glucagón",
    "TransexamicoAcido": "Ácido Tranexámico",
    "AcidoTransexamico": "Ácido Tranexámico",
  };
  if (known[anchorId]) return known[anchorId];
  // CamelCase split
  return anchorId.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");
}

/** Convert XWiki 2.0 markup to Markdown */
function xwikiToMarkdown(raw: string): string {
  const lines = raw.split("\n");
  const out: string[] = [];
  let inHtmlBlock = false;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // HTML block macros — skip content
    if (/\{\{html/i.test(line)) { inHtmlBlock = true; }
    if (inHtmlBlock) {
      if (/\{\{\/html\}\}/i.test(line)) inHtmlBlock = false;
      continue;
    }

    // Skip other macros ({{toc/}}, {{/macroname}}, etc.)
    if (/^\{\{[^}]+\}\}[\s\S]*?\{\{\/[^}]+\}\}/.test(line) ||
        /^\{\{(?!popoverV)[^/][^}]*(\/\}\}|$)/.test(line)) {
      line = line.replace(/\{\{(?!popoverV)[^}]+\/?\}\}/g, "");
      if (!line.trim()) continue;
    }

    // Layout hints (% class="..." %) — skip
    if (/^\s*\(%[^)]*%\)\s*$/.test(line)) continue;

    // Group delimiters ((( and ))) — skip
    if (/^\s*\(\(\(\s*$/.test(line) || /^\s*\)\)\)\s*$/.test(line)) continue;

    // Skip wikigeneratedid paragraphs
    if (/class="wikigeneratedid"/.test(line)) continue;

    // Headings: == h2 ==, === h3 ===, etc.
    line = line.replace(/^======\s*\*?\*?(.+?)\*?\*?\s*======\s*$/, "##### $1");
    line = line.replace(/^=====\s*\*?\*?(.+?)\*?\*?\s*=====\s*$/, "##### $1");
    line = line.replace(/^====\s*\*?\*?(.+?)\*?\*?\s*====\s*$/, "#### $1");
    line = line.replace(/^===\s*\*?\*?(.+?)\*?\*?\s*===\s*$/, "### $1");
    line = line.replace(/^==\s*\*?\*?(.+?)\*?\*?\s*==\s*$/, "## $1");
    line = line.replace(/^=\s*\*?\*?(.+?)\*?\*?\s*=\s*$/, "# $1");

    // Bullet lists: leading * → -, ** → two spaces + -, etc.
    const bulletMatch = line.match(/^(\*+)\s+([\s\S]*)/);
    if (bulletMatch) {
      const level = bulletMatch[1].length;
      const content = bulletMatch[2];
      const indent = "  ".repeat(level - 1);
      line = `${indent}* ${content}`;
    }

    // Numbered lists: 1. or 1) pattern — leave as is
    // XWiki numbered: "1." at start is same as markdown

    // Indented continuation lines ": text"
    if (/^\s*:\s+/.test(line)) {
      line = line.replace(/^\s*:\s+/, "  ");
    }

    // Italic //text// → *text*
    line = line.replace(/\/\/([^/\n]+?)\/\//g, "*$1*");

    // Underline __text__ → *text* (no MD underline)
    line = line.replace(/__([^_\n]+?)__/g, "*$1*");

    // Subscript ,,text,, → strip
    line = line.replace(/,,([^,\n]*?),,/g, "$1");

    // Superscript ^^text^^ → strip
    line = line.replace(/\^\^([^\^\n]*?)\^\^/g, "$1");

    // {{popoverV}} drug macros → <DrugLink>
    line = line.replace(
      /\{\{popoverV[^}]*?(?:anchorId|link)="([^"]+)"[^}]*?\}\}\{\{\/popoverV\}\}/g,
      (_, anchorId) => `<DrugLink name="${anchorIdToDrugName(anchorId)}" />`
    );
    // Unclosed popoverV (split across lines — unlikely but handle)
    line = line.replace(/\{\{popoverV[^}]*?anchorId="([^"]+)"[^}]*?\}\}/g, (_, anchorId) =>
      `<DrugLink name="${anchorIdToDrugName(anchorId)}" />`
    );
    line = line.replace(/\{\{\/popoverV\}\}/g, "");

    // Internal wiki links [[label>>doc:Path.WebHome]] → plain text (we can't resolve without all slugs)
    line = line.replace(/\[\[([^\]|>>]+?)>>doc:([^\]]+?)\]\]/g, (_, label) => label.trim());

    // External links [[label>>url:href]] → [label](href)
    line = line.replace(/\[\[([^\]]+?)>>url:([^\]]+?)\]\]/g, "[$1]($2)");

    // External links [[label>>href]] where href starts with http
    line = line.replace(/\[\[([^\]]+?)>>(https?:[^\]]+?)\]\]/g, "[$1]($2)");

    // Plain links [[text]] → text
    line = line.replace(/\[\[([^\]]+?)\]\]/g, "$1");

    // Remove remaining {{ }} macros
    line = line.replace(/\{\{[^}]+\}\}/g, "");

    // Bold strip the **...** pattern that is already valid in markdown — keep as is

    // Horizontal rule ----
    if (/^----+\s*$/.test(line)) {
      out.push("---");
      continue;
    }

    out.push(line);
  }

  // Join and clean up
  let result = out.join("\n");

  // Collapse 3+ blank lines into 2
  result = result.replace(/\n{3,}/g, "\n\n");
  return result.trim();
}

async function fetchProcedureContent(url: string): Promise<{ rawMarkup: string; title: string; modified: string } | null> {
  const plainUrl = url.endsWith("/") ? `${url}?xpage=plain&raw=1` : `${url}/?xpage=plain&raw=1`;

  try {
    const res = await fetch(plainUrl, {
      headers: {
        "User-Agent": "ManualSAMUR-scraper/3.0 (educational, personal use)",
        "Accept": "text/html,text/plain",
      },
    });

    if (!res.ok) return null;

    const html = await res.text();

    // Check for maintenance page
    if (html.includes("En mantenimiento") || html.includes("Contenido no disponible")) {
      return null;
    }

    const rawMarkup = extractRawFromHtml(html);

    // Extract title from the page
    const titleMatch = html.match(/<title>([^<]+)<\/title>/);
    const rawTitle = titleMatch ? titleMatch[1].replace(/\s*-\s*SAMUR.*$/, "").trim() : "";

    // Extract modification date from XWiki page info
    const modifiedMatch = rawMarkup.match(/Última modificación el (\d+\/\d+\/\d+)/);
    const modified = modifiedMatch ?
      (() => {
        const [d, m, y] = modifiedMatch[1].split("/");
        return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
      })() :
      new Date().toISOString().split("T")[0];

    return { rawMarkup, title: rawTitle, modified };
  } catch (err) {
    console.error(`  [FETCH ERROR] ${url}:`, err);
    return null;
  }
}

// ─── Frontmatter helpers ──────────────────────────────────────────────────────

function buildFrontmatter(id: string, title: string, section: string, slug: string, updated: string, source: string): string {
  return [
    "---",
    `id: "${id}"`,
    `title: "${title.replace(/"/g, "'")}"`,
    `section: "${section}"`,
    `slug: "${slug}"`,
    `tags: []`,
    `synonyms: []`,
    `related: []`,
    `updated: "${updated}"`,
    `source: "${source}"`,
    "---",
    "",
  ].join("\n");
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const newOnly = args.includes("--new-only");
  const listOnly = args.includes("--list");
  const sectionFilter = args.find((_, i) => args[i - 1] === "--section");
  const singleTitle = args.find((_, i) => args[i - 1] === "--id");

  fs.mkdirSync(PROCEDURES_DIR, { recursive: true });

  console.log("Discovering procedure spaces...");
  let spaces = await getAllProcedureSpaces();
  console.log(`Found ${spaces.length} procedure spaces`);

  if (sectionFilter) {
    spaces = spaces.filter((s) => s.section.toLowerCase() === sectionFilter.toLowerCase());
    console.log(`Filtered to section "${sectionFilter}": ${spaces.length} spaces`);
  }

  if (singleTitle) {
    spaces = spaces.filter((s) => s.title.toLowerCase() === singleTitle.toLowerCase());
    if (spaces.length === 0) {
      console.error(`No space found with title "${singleTitle}". Use --list to see all.`);
      process.exit(1);
    }
  }

  if (listOnly) {
    console.log(`\n${"─".repeat(80)}`);
    for (const s of spaces) {
      console.log(`  [${s.section.padEnd(15)}] ${s.title}`);
      console.log(`    ${s.url}`);
    }
    console.log(`\nTotal: ${spaces.length} spaces`);
    return;
  }

  const existingMap = loadExistingProcedures();
  const existingFiles = new Set(walkProceduresDir(PROCEDURES_DIR).map((f) => path.basename(f, ".md")));

  let created = 0, updated = 0, skipped = 0, failed = 0;

  for (const space of spaces) {
    await sleep(DELAY_MS);

    const localId = findLocalId(space.title, existingMap);
    const targetId = localId ?? slugify(space.title);
    const subfolder = sectionToSubfolder(space.section);
    const procedureDir = path.join(PROCEDURES_DIR, subfolder);
    const targetFile = path.join(procedureDir, `${targetId}.md`);

    if (newOnly && existingFiles.has(targetId)) {
      skipped++;
      continue;
    }

    process.stdout.write(`  [${space.section}] ${space.title}... `);

    const result = await fetchProcedureContent(space.url);

    if (!result) {
      console.log("SKIP (no content)");
      failed++;
      continue;
    }

    const { rawMarkup, title: wikiTitle, modified } = result;

    // Use wiki page title if we have one, otherwise use space title
    const displayTitle = wikiTitle || space.title;
    const slug = `${targetId}-${slugify(displayTitle)}`.slice(0, 80);

    // Convert to markdown
    const markdown = xwikiToMarkdown(rawMarkup);

    // Skip if content is too short (probably empty/redirect/category page)
    if (markdown.length < 350) {
      console.log("SKIP (empty content)");
      skipped++;
      continue;
    }

    const frontmatter = buildFrontmatter(
      targetId,
      displayTitle,
      space.section,
      slug,
      modified,
      space.url
    );

    const fileContent = frontmatter + markdown + "\n";
    const isNew = !fs.existsSync(targetFile);

    fs.mkdirSync(procedureDir, { recursive: true });
    fs.writeFileSync(targetFile, fileContent, "utf8");

    if (isNew) {
      console.log(`CREATED (${markdown.length} chars)`);
      created++;
    } else {
      console.log(`UPDATED (${markdown.length} chars)`);
      updated++;
    }
  }

  console.log(`\n${"═".repeat(60)}`);
  console.log(`Done. Created: ${created} | Updated: ${updated} | Skipped: ${skipped} | Failed: ${failed}`);
  console.log(`Total local procedures: ${walkProceduresDir(PROCEDURES_DIR).length}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});

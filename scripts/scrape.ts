#!/usr/bin/env npx ts-node
/**
 * Scraper: samurpc.net → content/procedures/*.md
 *
 * Usage:
 *   npx ts-node scripts/scrape.ts                    — scrape known IDs
 *   npx ts-node scripts/scrape.ts --discover         — crawl site index first
 *   npx ts-node scripts/scrape.ts --new-only         — skip existing .md files
 *   npx ts-node scripts/scrape.ts --id 301           — single procedure
 *   npx ts-node scripts/scrape.ts --discover --new-only --images
 *
 * Flags:
 *   --discover   Auto-detect IDs from samurpc.net navigation
 *   --new-only   Skip procedures that already have a .md file
 *   --images     Download images referenced in procedures
 *   --id <ID>    Scrape a single procedure by ID
 *
 * Respects a 1.2s delay between requests.
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import * as cheerio from "cheerio";
import TurndownService from "turndown";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = "https://www.samurpc.net";
const DELAY_MS = 1200;
const OUTPUT_DIR = path.join(__dirname, "../content/procedures");
const IMAGES_DIR = path.join(__dirname, "../public/images/procedures");

// Known procedure IDs — used as fallback when --discover is not passed
const KNOWN_IDS = [
  "103", "104", "105",
  "121", "122", "123", "124",
  "125_01", "125_02", "125_03", "125_04", "125_05", "125_06", "125_07", "125_08",
  "201", "203", "204", "205",
  "209", "211", "213", "215", "216", "216a", "216b", "216c", "216d",
  "217_01", "217_02", "217_03", "217_04", "217_05", "217_06", "217_07", "217_08",
  "233", "2100",
  "301", "302", "303", "304", "305", "306", "307", "308", "309",
  "310", "311", "312", "313", "314", "315", "316",
  "401", "402", "403", "404", "405", "406", "407", "408", "409",
  "501",
  "607",
  "601_01", "601_02", "601_03", "601_04",
  "602_01", "602_02", "602_03", "602_04", "602_05", "602_06", "602_07",
  "602_08", "602_09", "602_10", "602_11", "602_12",
  "603_01", "603_02", "603_03", "603_04", "603_05", "603_06", "603_07",
  "604_01", "604_02", "604_03", "604_04", "604_05", "604_06", "604_07",
  "604_08", "604_09", "604_10",
  "605_01", "605_02", "605_03", "605_04",
  "606_01", "606_02", "606_03", "606_04", "606_05", "606_06", "606_07",
  "608_01", "608_02",
  "609_01", "609_02",
];

function getSection(id: string): string {
  if (id.startsWith("125")) return "Comunicaciones";
  if (id.startsWith("12")) return "Comunicaciones";
  if (id.startsWith("1")) return "Administrativos";
  if (id.startsWith("2")) return "Operativos";
  if (id.startsWith("3")) return "SVA";
  if (id.startsWith("4")) return "SVB";
  if (id.startsWith("5")) return "Psicológicos";
  if (id.startsWith("6")) return "Técnicas";
  return "General";
}

function slugify(id: string, title: string): string {
  const cleanTitle = title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 50);
  return `${id}-${cleanTitle}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractRelated($: any): string[] {
  const related: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  $("a[href]").each((_: any, el: any) => {
    const href = $(el).attr("href") || "";
    const match =
      href.match(/(?:data\/)?([0-9][^./]+)\.htm/) ||
      href.match(/([0-9T][^./]*_[0-9]+)\.htm/);
    if (match) related.push(match[1]);
  });
  return [...new Set(related)];
}

async function fetchWithDecode(url: string): Promise<{ html: string; ok: boolean; status: number }> {
  const res = await fetch(url, {
    headers: { "User-Agent": "ManualSAMUR-scraper/2.0 (educational, personal use)" },
  });
  if (!res.ok) return { html: "", ok: false, status: res.status };

  const contentType = res.headers.get("content-type") ?? "";
  const charsetMatch = contentType.match(/charset=([^\s;]+)/i);
  let charset = charsetMatch ? charsetMatch[1] : "windows-1252";
  const buf = await res.arrayBuffer();
  const raw = Buffer.from(buf).toString("binary");
  const metaCharset = raw.match(/charset=["\']?([a-zA-Z0-9-]+)/i)?.[1];
  if (metaCharset) charset = metaCharset;
  const html = new TextDecoder(charset, { fatal: false }).decode(buf);
  return { html, ok: true, status: res.status };
}

/** Crawl the site's navigation to discover all procedure IDs */
async function discoverIds(): Promise<string[]> {
  console.log("  Discovering procedure IDs from site navigation...");
  const discovered = new Set<string>();
  const idPattern = /(?:data\/)?([0-9][a-zA-Z0-9_]*)\.htm/g;

  const pagesToCheck = [
    `${BASE_URL}/`,
    `${BASE_URL}/manual.htm`,
    `${BASE_URL}/procedimientos.htm`,
    `${BASE_URL}/index.htm`,
  ];

  for (const pageUrl of pagesToCheck) {
    try {
      const { html, ok } = await fetchWithDecode(pageUrl);
      if (!ok) continue;
      const $ = cheerio.load(html);
      $("a[href]").each((_: unknown, el: unknown) => {
        const href = $(el as Parameters<typeof $>[0]).attr("href") || "";
        let match: RegExpExecArray | null;
        const re = /(?:data\/)?([0-9][a-zA-Z0-9_]*)\.htm/g;
        while ((match = re.exec(href)) !== null) {
          discovered.add(match[1]);
        }
      });
      // Also scan all text for patterns
      const bodyHtml = $("body").html() || "";
      let m: RegExpExecArray | null;
      while ((m = idPattern.exec(bodyHtml)) !== null) {
        discovered.add(m[1]);
      }
    } catch {
      // page not found, skip
    }
    await sleep(DELAY_MS);
  }

  const found = [...discovered].sort();
  console.log(`  Found ${found.length} IDs via discovery: ${found.slice(0, 10).join(", ")}...`);
  return found;
}

async function downloadImage(imageUrl: string, destDir: string): Promise<string | null> {
  try {
    const res = await fetch(imageUrl, {
      headers: { "User-Agent": "ManualSAMUR-scraper/2.0 (educational, personal use)" },
    });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const filename = path.basename(new URL(imageUrl).pathname);
    const destPath = path.join(destDir, filename);
    fs.writeFileSync(destPath, Buffer.from(buf));
    return filename;
  } catch {
    return null;
  }
}

async function fetchProcedure(id: string, downloadImages: boolean): Promise<void> {
  const url = `${BASE_URL}/data/${id}.htm`;
  try {
    const { html, ok, status } = await fetchWithDecode(url);
    if (!ok) {
      console.log(`  [SKIP] ${id} → HTTP ${status}`);
      return;
    }

    const $ = cheerio.load(html);

    const pageTitle = $("title").text();
    if (pageTitle.includes("404") || $("body").text().includes("ARCHIVO NO ENCONTRADO")) {
      console.log(`  [404]  ${id}`);
      return;
    }

    const title =
      $("h1").first().text().trim() ||
      $("title").text().trim().replace(" - SAMUR", "").trim() ||
      `Procedimiento ${id}`;

    $("nav, header, footer, script, style, .menu, #menu, .navegacion, #navegacion").remove();

    const related = extractRelated($);

    // Handle images before converting
    const imageMap: Record<string, string> = {};
    if (downloadImages) {
      const imgDir = path.join(IMAGES_DIR, id);
      fs.mkdirSync(imgDir, { recursive: true });

      const imgPromises: Promise<void>[] = [];
      $("img[src]").each((_: unknown, el: unknown) => {
        const src = $(el as Parameters<typeof $>[0]).attr("src") || "";
        if (!src || src.includes("print.gif") || src.includes("trans.gif") || src.includes("logo")) return;
        const absoluteSrc = src.startsWith("http") ? src : new URL(src, url).href;
        imgPromises.push(
          downloadImage(absoluteSrc, imgDir).then((filename) => {
            if (filename) {
              imageMap[src] = `/images/procedures/${id}/${filename}`;
              $(el as Parameters<typeof $>[0]).attr("src", `/images/procedures/${id}/${filename}`);
            }
          })
        );
      });
      await Promise.all(imgPromises);
    } else {
      // Strip decorative/legacy images; keep content images
      $("img[src*='print.gif'], img[src*='trans.gif'], img[src*='logo']").remove();
    }

    const td = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });
    // Keep images in output
    td.keep(["img"]);

    const mainContent = $("body").html() || "";
    let markdown = td.turndown(mainContent);

    // Clean up
    markdown = markdown
      .replace(/\n{3,}/g, "\n\n")
      // Remove empty links like [](...)
      .replace(/\[]\([^)]*\)/g, "")
      // Remove color span artifacts from turndown
      .replace(/\\([*_`#])/g, "$1")
      .trim();

    const section = getSection(id);
    const slug = slugify(id, title);

    const frontmatter = [
      "---",
      `id: "${id}"`,
      `title: "${title.replace(/"/g, "'")}"`,
      `section: "${section}"`,
      `slug: "${slug}"`,
      `tags: []`,
      `synonyms: []`,
      `related: ${JSON.stringify(related.filter((r) => r !== id))}`,
      `updated: "${new Date().toISOString().split("T")[0]}"`,
      `source: "${url}"`,
      "---",
      "",
    ].join("\n");

    const outputPath = path.join(OUTPUT_DIR, `${id}.md`);
    fs.writeFileSync(outputPath, frontmatter + markdown, "utf8");
    console.log(`  [OK]   ${id} → ${title.slice(0, 60)}`);
  } catch (err) {
    console.error(`  [ERR]  ${id}:`, err);
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getExistingIds(): Set<string> {
  if (!fs.existsSync(OUTPUT_DIR)) return new Set();
  return new Set(
    fs.readdirSync(OUTPUT_DIR)
      .filter((f) => f.endsWith(".md"))
      .map((f) => f.replace(".md", ""))
  );
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const args = process.argv.slice(2);
  const discover = args.includes("--discover");
  const newOnly = args.includes("--new-only");
  const downloadImages = args.includes("--images");
  const singleId =
    args.find((a) => a.startsWith("--id="))?.split("=")[1] ||
    (args[0] === "--id" ? args[1] : null);

  let ids: string[];

  if (singleId) {
    ids = [singleId];
  } else if (discover) {
    const discoveredIds = await discoverIds();
    // Merge with known IDs, deduplicate
    ids = [...new Set([...KNOWN_IDS, ...discoveredIds])].sort();
  } else {
    ids = KNOWN_IDS;
  }

  if (newOnly) {
    const existing = getExistingIds();
    const before = ids.length;
    ids = ids.filter((id) => !existing.has(id));
    console.log(`  Skipping ${before - ids.length} existing procedures (--new-only)`);
  }

  console.log(`\nScraping ${ids.length} procedures from ${BASE_URL}...`);
  if (downloadImages) console.log("  Image download: enabled");

  for (const id of ids) {
    await fetchProcedure(id, downloadImages);
    await sleep(DELAY_MS);
  }

  console.log("\nDone.");
}

main().catch(console.error);

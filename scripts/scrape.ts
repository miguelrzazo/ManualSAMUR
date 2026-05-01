#!/usr/bin/env npx ts-node
/**
 * Scraper: samurpc.net → content/procedures/*.md
 *
 * Usage:
 *   npx ts-node scripts/scrape.ts
 *   npx ts-node scripts/scrape.ts --id 301   (single procedure)
 *
 * Respeta robots.txt: delay de 1s entre requests.
 * Convierte HTML → Markdown con frontmatter YAML.
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

// Known procedure IDs from site exploration
const PROCEDURE_IDS = [
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
  // Técnicas (discovered 2026-05-01)
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

// Section mapping by ID prefix
function getSection(id: string): string {
  if (id.startsWith("125")) return "Comunicaciones";
  if (id.startsWith("12")) return "Comunicaciones";
  if (id.startsWith("1")) return "Administrativos";
  if (id.startsWith("2")) return "Operativos";
  if (id.startsWith("3")) return "SVA";
  if (id.startsWith("4")) return "SVB";
  if (id.startsWith("5")) return "Psicológicos";
  if (id.startsWith("6")) return "Técnicas";
  if (id.startsWith("T") || id.startsWith("t")) return "Técnicas";
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
    // Match both "data/123.htm" and relative "123.htm" patterns
    const match = href.match(/(?:data\/)?([0-9][^./]+)\.htm/) || href.match(/([0-9T][^./]*_[0-9]+)\.htm/);
    if (match) related.push(match[1]);
  });
  return [...new Set(related)];
}

async function fetchProcedure(id: string): Promise<void> {
  const url = `${BASE_URL}/data/${id}.htm`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "ManualSAMUR-scraper/1.0 (educational, personal use)" },
    });
    if (!res.ok) {
      console.log(`  [SKIP] ${id} → HTTP ${res.status}`);
      return;
    }

    // Detect charset — samurpc.net uses windows-1252 / iso-8859-1
    const contentType = res.headers.get("content-type") ?? "";
    const charsetMatch = contentType.match(/charset=([^\s;]+)/i);
    let charset = charsetMatch ? charsetMatch[1] : "windows-1252";
    const buf = await res.arrayBuffer();
    // Also check meta charset in raw bytes
    const raw = Buffer.from(buf).toString("binary");
    const metaCharset = raw.match(/charset=["\']?([a-zA-Z0-9-]+)/i)?.[1];
    if (metaCharset) charset = metaCharset;
    const html = new TextDecoder(charset, { fatal: false }).decode(buf);

    const $ = cheerio.load(html);

    // Skip 404 pages
    const pageTitle = $("title").text();
    if (pageTitle.includes("404") || $("body").text().includes("ARCHIVO NO ENCONTRADO")) {
      console.log(`  [404]  ${id}`);
      return;
    }

    // Extract title
    const title =
      $("h1").first().text().trim() ||
      $("title").text().trim().replace(" - SAMUR", "").trim() ||
      `Procedimiento ${id}`;

    // Remove nav/header/footer noise
    $("nav, header, footer, script, style, .menu, #menu").remove();

    // Extract related IDs from links
    const related = extractRelated($);

    // Convert main content to Markdown
    const td = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });
    const mainContent = $("body").html() || "";
    let markdown = td.turndown(mainContent);

    // Clean up excessive blank lines
    markdown = markdown.replace(/\n{3,}/g, "\n\n").trim();

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

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const args = process.argv.slice(2);
  const singleId = args.find((a) => a.startsWith("--id="))?.split("=")[1] ||
    (args[0] === "--id" ? args[1] : null);

  const ids = singleId ? [singleId] : PROCEDURE_IDS;

  console.log(`Scraping ${ids.length} procedures from ${BASE_URL}...`);

  for (const id of ids) {
    await fetchProcedure(id);
    await sleep(DELAY_MS);
  }

  console.log("\nDone.");
}

main().catch(console.error);

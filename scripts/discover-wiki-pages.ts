#!/usr/bin/env node
/**
 * discover-wiki-pages.ts — Descubre páginas del wiki SAMUR no presentes localmente
 *
 * Combina tres fuentes de discovery:
 *   1. XWiki REST /spaces (actual scraper ya hace esto)
 *   2. XWiki REST /pages para listar documentos planos dentro de cada espacio
 *   3. AllDocs HTML crawl (con filtros menos agresivos que el sync)
 *
 * Compara contra content/procedures/ y reporta páginas en el wiki que no tenemos.
 *
 * Usage:
 *   node --experimental-strip-types scripts/discover-wiki-pages.ts
 *   node --experimental-strip-types scripts/discover-wiki-pages.ts --scrape   — scraping de las páginas faltantes
 *   node --experimental-strip-types scripts/discover-wiki-pages.ts --output report.json
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import matter from "gray-matter";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, "..");
const WIKI_BASE = "https://servpub.madrid.es/manualsamur";
const REST_BASE = `${WIKI_BASE}/rest/wikis/xwiki`;
const PROCEDURES_DIR = path.join(ROOT_DIR, "content/procedures");
const DELAY_MS = 700;

const HEADERS = {
  "Accept": "application/xml, text/xml, text/html",
  "User-Agent": "ManualSAMUR-discovery/1.0 (educational, personal use)",
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface WikiPage {
  title: string;
  url: string;
  section: string;
  source: "spaces-api" | "pages-api" | "alldocs";
}

interface DiscoveryResult {
  wikiPages: WikiPage[];
  localIds: Set<string>;
  localTitles: Map<string, string>;
  missing: WikiPage[];
}

// ─── Section detection ────────────────────────────────────────────────────────

function getSection(url: string): string {
  const u = decodeURIComponent(url);
  if (/Procedimientos SVA|\/SVA\//i.test(u)) return "SVA";
  if (/Procedimientos SVB|\/SVB\//i.test(u)) return "SVB";
  if (/T[eé]cnicas/i.test(u)) return "Técnicas";
  if (/Procedimientos Operativos/i.test(u)) return "Operativos";
  if (/Procedimientos Administrativos/i.test(u)) return "Administrativos";
  if (/Central de Comunicaciones|Comunicaciones/i.test(u)) return "Comunicaciones";
  if (/Intervinientes|Psicol/i.test(u)) return "Psicológicos";
  return "General";
}

// ─── Local content index ──────────────────────────────────────────────────────

function loadLocalIndex(): { ids: Set<string>; titles: Map<string, string>; slugs: Set<string> } {
  const ids = new Set<string>();
  const titles = new Map<string, string>();
  const slugs = new Set<string>();

  function walk(dir: string) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.isFile() && entry.name.endsWith(".md")) {
        const raw = fs.readFileSync(p, "utf8");
        const { data } = matter(raw);
        const id = String(data.id ?? entry.name.replace(".md", ""));
        const title = String(data.title ?? "").toLowerCase().trim();
        const slug = String(data.slug ?? "").toLowerCase().trim();
        ids.add(id);
        if (title) titles.set(title, id);
        if (slug) slugs.add(slug);
      }
    }
  }

  walk(PROCEDURES_DIR);
  return { ids, titles, slugs };
}

function normalizeTitle(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9\s]+/g, " ").replace(/\s+/g, " ").trim();
}

// ─── XWiki REST: spaces API ───────────────────────────────────────────────────

async function discoverViaSpacesApi(): Promise<WikiPage[]> {
  try {
    const res = await fetch(`${REST_BASE}/spaces`, { headers: HEADERS });
    if (!res.ok) return [];
    const xml = await res.text();

    const pages: WikiPage[] = [];
    const spaceRegex = /<space>[\s\S]*?<name>([^<]+)<\/name>[\s\S]*?<xwikiAbsoluteUrl>([^<]+)<\/xwikiAbsoluteUrl>[\s\S]*?<\/space>/g;
    let m: RegExpExecArray | null;

    while ((m = spaceRegex.exec(xml)) !== null) {
      const title = m[1].trim();
      const url = m[2].trim().replace(/\/WebHome\/?$/, "");

      const pathMatch = url.match(/\/bin\/view\/(.+?)(?:\/?$)/);
      if (!pathMatch) continue;

      const parts = decodeURIComponent(pathMatch[1]).split("/").filter((p) => p && p !== "WebHome");
      const depth = parts.length;

      if (depth < 2) continue;
      if (/^(xwiki|main|blog|menu|authservice|panels|exportar|etiquetas|cabecera|cabeceraetiquetas|mapa|colaboradores|calendario|prueba|tipos de asistencia|abreviaturas|vademécum|vademecum|webhome|otros)$/i.test(title)) continue;
      if (/^(Procedimientos SVA|Procedimientos SVB|Procedimientos Administrativos|Procedimientos Operativos|Procedimientos asistenciales)$/i.test(title)) continue;

      const section = getSection(url);
      if (section === "General" && depth < 3) continue;

      pages.push({ title, url, section, source: "spaces-api" });
    }

    return pages;
  } catch {
    return [];
  }
}

// ─── XWiki REST: pages within each space ─────────────────────────────────────

async function discoverViaSpacesPagesApi(): Promise<WikiPage[]> {
  const pages: WikiPage[] = [];

  // Get the list of top-level relevant spaces
  const relevantSpaceNames = [
    "Procedimientos SVA", "SVA",
    "Procedimientos SVB", "SVB",
    "T%C3%A9cnicas", "T%E9cnicas",
    "Procedimientos Operativos",
    "Procedimientos Administrativos",
    "Central de Comunicaciones",
    "Intervinientes",
  ];

  for (const spaceName of relevantSpaceNames) {
    await sleep(DELAY_MS / 2);
    try {
      const encoded = encodeURIComponent(spaceName);
      const res = await fetch(`${REST_BASE}/spaces/${encoded}/pages`, { headers: HEADERS });
      if (!res.ok) continue;

      const xml = await res.text();
      // Extract page summaries
      const pageRegex = /<pageSummary>[\s\S]*?<name>([^<]+)<\/name>[\s\S]*?<xwikiAbsoluteUrl>([^<]+)<\/xwikiAbsoluteUrl>[\s\S]*?<\/pageSummary>/g;
      let m: RegExpExecArray | null;

      while ((m = pageRegex.exec(xml)) !== null) {
        const title = m[1].trim();
        const url = m[2].trim().replace(/\/WebHome\/?$/, "");

        if (/^WebHome$/i.test(title)) continue;
        if (/^(xwiki|main|blog|menu|webhome)$/i.test(title)) continue;

        const section = getSection(url);
        pages.push({ title, url, section, source: "pages-api" });
      }
    } catch {
      // Space not accessible with this name, skip
    }
  }

  return pages;
}

// ─── AllDocs HTML crawl ───────────────────────────────────────────────────────

async function discoverViaAllDocs(): Promise<WikiPage[]> {
  const pages: WikiPage[] = [];

  try {
    const res = await fetch(`${WIKI_BASE}/bin/view/Main/AllDocs`, {
      headers: { ...HEADERS, Accept: "text/html" },
    });
    if (!res.ok) return [];

    const html = await res.text();
    const linkRegex = /href="([^"]+\/bin\/view\/[^"]+)"/g;
    const seen = new Set<string>();
    let m: RegExpExecArray | null;

    while ((m = linkRegex.exec(html)) !== null) {
      let href = m[1];
      // Make absolute
      if (href.startsWith("/")) href = `https://servpub.madrid.es${href}`;
      const cleanUrl = href.split("?")[0].replace(/\/WebHome\/?$/, "");

      if (seen.has(cleanUrl)) continue;
      seen.add(cleanUrl);

      const pathMatch = cleanUrl.match(/\/bin\/view\/(.+?)(?:\/?$)/);
      if (!pathMatch) continue;

      const parts = decodeURIComponent(pathMatch[1]).split("/").filter((p) => p && p !== "WebHome");
      if (parts.length < 2) continue;

      const name = parts.at(-1) ?? "";
      // More permissive than the sync script — allow potential annexes
      if (/^(xwiki|main|blog|menu|panels|mapa|abreviaturas|vademécum|vademecum|colaboradores|etiquetas|webhome|otros|calendario|authservice|exportar|cabecera|cabeceraetiquetas)$/i.test(name)) continue;
      // Keep category-level pages this time (previously filtered)

      const section = getSection(cleanUrl);
      // Allow depth-2 General pages (previously filtered at < 3)
      if (section === "General" && parts.length < 2) continue;

      // Extract title from href anchor text (approximate)
      const titleMatch = html.match(new RegExp(`href="${href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*>([^<]+)<`, ""));
      const title = titleMatch ? titleMatch[1].trim() : name;

      pages.push({ title, url: cleanUrl, section, source: "alldocs" });
    }
  } catch {
    // AllDocs not accessible
  }

  return pages;
}

// ─── Match wiki page against local ───────────────────────────────────────────

function isAlreadyLocal(page: WikiPage, localTitles: Map<string, string>, localSlugs: Set<string>): boolean {
  const normalized = normalizeTitle(page.title);

  if (localTitles.has(normalized)) return true;

  // Partial title match
  for (const [localTitle] of localTitles) {
    if (normalized.includes(localTitle) || localTitle.includes(normalized)) return true;
    // Word Jaccard ≥ 0.6
    const wordsA = new Set(normalized.split(/\s+/).filter((w) => w.length > 2));
    const wordsB = new Set(localTitle.split(/\s+/).filter((w) => w.length > 2));
    const inter = [...wordsA].filter((w) => wordsB.has(w)).length;
    const union = new Set([...wordsA, ...wordsB]).size;
    if (union > 0 && inter / union >= 0.6) return true;
  }

  return false;
}

// ─── Fetch content size to decide if page is worth scraping ──────────────────

async function estimateContentSize(url: string): Promise<number> {
  try {
    const plainUrl = `${url}/?xpage=plain&raw=1`;
    const res = await fetch(plainUrl, { headers: { ...HEADERS, Accept: "text/html,text/plain" }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return 0;
    const text = await res.text();
    const match = text.match(/<pre[^>]*>([\s\S]+?)<\/pre>/);
    return (match?.[1] ?? "").length;
  } catch {
    return 0;
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const outputFile = args.find((_, i) => args[i - 1] === "--output");
  const doScrape = args.includes("--scrape");

  console.log("Cargando índice local...");
  const { ids, titles: localTitles, slugs } = loadLocalIndex();
  console.log(`  ${ids.size} procedimientos locales indexados`);

  console.log("\nDescubriendo páginas en el wiki...");

  const [spacesPages, pagesApiPages, allDocsPages] = await Promise.all([
    discoverViaSpacesApi().then((p) => { console.log(`  Spaces API: ${p.length} páginas`); return p; }),
    discoverViaSpacesPagesApi().then((p) => { console.log(`  Pages API: ${p.length} páginas`); return p; }),
    discoverViaAllDocs().then((p) => { console.log(`  AllDocs: ${p.length} páginas`); return p; }),
  ]);

  // Merge all sources, deduplicate by URL
  const allPages = new Map<string, WikiPage>();
  for (const pages of [spacesPages, pagesApiPages, allDocsPages]) {
    for (const page of pages) {
      if (!allPages.has(page.url)) allPages.set(page.url, page);
    }
  }

  console.log(`\nTotal único en wiki: ${allPages.size} páginas`);

  // Find missing pages
  const missing: WikiPage[] = [];
  for (const page of allPages.values()) {
    if (!isAlreadyLocal(page, localTitles, slugs)) {
      missing.push(page);
    }
  }

  // Sort missing by section
  const sectionOrder = ["SVA", "SVB", "Operativos", "Técnicas", "Comunicaciones", "Psicológicos", "Administrativos", "General"];
  missing.sort((a, b) => {
    const si = sectionOrder.indexOf(a.section) - sectionOrder.indexOf(b.section);
    return si !== 0 ? si : a.title.localeCompare(b.title, "es");
  });

  // Print report
  console.log(`\n${"═".repeat(60)}`);
  console.log(`Páginas en wiki sin equivalente local: ${missing.length}`);
  console.log(`Páginas ya presentes localmente: ${allPages.size - missing.length}`);
  console.log();

  const bySection = new Map<string, WikiPage[]>();
  for (const page of missing) {
    const list = bySection.get(page.section) ?? [];
    list.push(page);
    bySection.set(page.section, list);
  }

  for (const section of sectionOrder) {
    const list = bySection.get(section);
    if (!list?.length) continue;
    console.log(`── ${section} (${list.length} faltantes) ──`);
    for (const page of list) {
      console.log(`  [${page.source.padEnd(10)}] ${page.title}`);
      console.log(`    ${page.url}`);
    }
    console.log();
  }

  if (outputFile) {
    const report = {
      generatedAt: new Date().toISOString(),
      localProcedures: ids.size,
      wikiPagesDiscovered: allPages.size,
      missingLocally: missing.length,
      missing: missing.map((p) => ({ title: p.title, url: p.url, section: p.section, source: p.source })),
    };
    fs.writeFileSync(outputFile, JSON.stringify(report, null, 2), "utf8");
    console.log(`Reporte escrito en ${outputFile}`);
  }

  // Optional: probe content size of missing pages to prioritize
  if (!doScrape && missing.length > 0) {
    console.log(`\nEjecuta con --scrape para descargar las páginas faltantes.`);
    console.log(`O usa --output report.json para guardar el listado.`);
  }

  // If --scrape: use sync-manualsamur to scrape each missing page
  if (doScrape) {
    console.log(`\nScraping ${missing.length} páginas faltantes...`);

    const { execFileSync } = await import("child_process");
    let scraped = 0;
    let skipped = 0;

    for (const page of missing) {
      await sleep(DELAY_MS);
      process.stdout.write(`  [${page.section}] ${page.title}... `);

      // Check content size first
      const size = await estimateContentSize(page.url);
      if (size < 100) {
        console.log(`SKIP (contenido vacío, ${size} chars)`);
        skipped++;
        continue;
      }

      console.log(`${size} chars → enviando a scrape-wiki`);
      try {
        execFileSync(process.execPath, [
          "--experimental-strip-types",
          "scripts/scrape-wiki.ts",
          "--id", page.title,
        ], { cwd: ROOT_DIR, stdio: "inherit", timeout: 30000 });
        scraped++;
      } catch {
        console.log(`  ERROR`);
      }
    }

    console.log(`\nScraping completado. Scrapeados: ${scraped} | Saltados: ${skipped}`);
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});

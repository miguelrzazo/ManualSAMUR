#!/usr/bin/env npx tsx
/**
 * wiki-diff.ts — Diff local procedures against the Madrid XWiki source
 *
 * Usage:
 *   npx tsx scripts/wiki-diff.ts                     — diff all procedures
 *   npx tsx scripts/wiki-diff.ts --id 301            — diff a single procedure
 *   npx tsx scripts/wiki-diff.ts --list              — list all pages found in wiki
 *   npx tsx scripts/wiki-diff.ts --missing           — show only missing local procedures
 *   npx tsx scripts/wiki-diff.ts --changed           — show only changed procedures
 *   npx tsx scripts/wiki-diff.ts --output report.json — write JSON report to file
 *
 * The script probes https://servpub.madrid.es/manualsamur/rest/ to discover
 * the wiki structure, then fetches each procedure page and diffs it against
 * the corresponding local .md file in content/procedures/.
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import TurndownService from "turndown";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = "https://servpub.madrid.es/manualsamur";
const REST_BASE = `${BASE_URL}/rest`;
const DELAY_MS = 800;
const PROCEDURES_DIR = path.join(__dirname, "../content/procedures");

const HEADERS = {
  "Accept": "application/json",
  "User-Agent": "ManualSAMUR-wiki-diff/1.0 (educational, personal use)",
};

type DiffStatus = "ok" | "changed" | "missing" | "new" | "error";

interface PageDiff {
  wikiPage: string;
  wikiSpace: string;
  localId: string | null;
  localFile: string | null;
  status: DiffStatus;
  wikiTitle?: string;
  wikiUpdated?: string;
  similarity?: number;
  addedLines?: number;
  removedLines?: number;
  error?: string;
}

// ─── API helpers ─────────────────────────────────────────────────────────────

async function apiGet(path: string): Promise<unknown> {
  const url = `${REST_BASE}${path}`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("json")) return res.json();
  return res.text();
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Wiki discovery ───────────────────────────────────────────────────────────

interface WikiSpace {
  name: string;
  id: string;
  url: string;
}

async function discoverWikiName(): Promise<string> {
  try {
    const data = await apiGet("/wikis") as { wikis?: Array<{ name: string }> };
    const wikis = data?.wikis ?? [];
    if (wikis.length > 0) return wikis[0].name;
  } catch {
    // try common wiki names
  }
  return "xwiki";
}

async function listSpaces(wikiName: string): Promise<WikiSpace[]> {
  const data = await apiGet(`/wikis/${wikiName}/spaces`) as {
    spaces?: Array<{ name: string; id: string; links?: Array<{ href: string }> }>;
  };
  return (data?.spaces ?? []).map((s) => ({
    name: s.name,
    id: s.id,
    url: s.links?.[0]?.href ?? "",
  }));
}

interface WikiPage {
  name: string;
  title: string;
  space: string;
  modified?: string;
  links?: Array<{ href: string; rel?: string }>;
}

async function listPagesInSpace(wikiName: string, spaceName: string): Promise<WikiPage[]> {
  const encoded = encodeURIComponent(spaceName);
  const data = await apiGet(`/wikis/${wikiName}/spaces/${encoded}/pages`) as {
    pageSummaries?: WikiPage[];
  };
  return data?.pageSummaries ?? [];
}

async function fetchPageContent(wikiName: string, spaceName: string, pageName: string): Promise<{
  title: string;
  content: string;
  modified?: string;
} | null> {
  const encodedSpace = encodeURIComponent(spaceName);
  const encodedPage = encodeURIComponent(pageName);
  try {
    const data = await apiGet(`/wikis/${wikiName}/spaces/${encodedSpace}/pages/${encodedPage}`) as {
      title?: string;
      content?: string;
      modified?: string;
    };
    if (!data?.content) return null;
    return {
      title: data.title ?? pageName,
      content: data.content,
      modified: data.modified,
    };
  } catch {
    return null;
  }
}

// ─── Content comparison ───────────────────────────────────────────────────────

const td = new TurndownService({ headingStyle: "atx", bulletListMarker: "-" });

function wikiMarkupToPlainText(markup: string): string {
  // XWiki syntax → strip common markup patterns
  return markup
    .replace(/\{\{[^}]+\}\}/g, "")           // {{macros}}
    .replace(/=+ [^=]+ =+/g, "")             // headings
    .replace(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g, "$1") // [[links]]
    .replace(/\*\*([^*]+)\*\*/g, "$1")        // **bold**
    .replace(/__([^_]+)__/g, "$1")            // __italic__
    .replace(/<[^>]+>/g, " ")                 // HTML tags
    .replace(/\s{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function htmlToPlainText(html: string): string {
  return td.turndown(html)
    .replace(/[*_`#]/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function localMarkdownToPlainText(markdown: string): string {
  // Strip frontmatter
  const withoutFrontmatter = markdown.replace(/^---[\s\S]+?---\n/, "");
  // Strip MDX components
  const withoutMdx = withoutFrontmatter
    .replace(/<[A-Z][^>]*>([\s\S]*?)<\/[A-Z][^>]*>/g, "$1")  // block MDX tags
    .replace(/<[A-Z][^/]*\/>/g, "")                            // self-closing MDX
    .replace(/\{`[\s\S]*?`\}/g, "")                            // template literals in props
    .replace(/^#+\s+/gm, "")                                   // headings
    .replace(/\*\*([^*]+)\*\*/g, "$1")                         // bold
    .replace(/\*([^*]+)\*/g, "$1")                             // italic
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")                   // links
    .replace(/^\|.+/gm, "")                                    // table rows
    .replace(/^[-*]\s+/gm, "")                                 // list bullets
    .replace(/\s{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return withoutMdx;
}

function computeSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/));
  const wordsB = new Set(b.toLowerCase().split(/\s+/));
  const intersection = new Set([...wordsA].filter((w) => wordsB.has(w)));
  const union = new Set([...wordsA, ...wordsB]);
  return union.size === 0 ? 1 : intersection.size / union.size;
}

function linesDiff(a: string, b: string): { added: number; removed: number } {
  const linesA = new Set(a.split("\n").map((l) => l.trim()).filter(Boolean));
  const linesB = new Set(b.split("\n").map((l) => l.trim()).filter(Boolean));
  const added = [...linesB].filter((l) => !linesA.has(l)).length;
  const removed = [...linesA].filter((l) => !linesB.has(l)).length;
  return { added, removed };
}

// ─── Page → local ID mapping ──────────────────────────────────────────────────

function guessLocalId(pageName: string, title: string): string | null {
  // "Procedimiento301" → "301"
  const fromName = pageName.match(/[Pp]rocedimiento[\s_-]?(\d+[a-z]?(?:[_-]\d+)?)/)?.[1];
  if (fromName) return fromName.replace("-", "_");

  // "301" or "301_01" directly
  const numeric = pageName.match(/^(\d+[a-z]?(?:[_-]\d+)?)$/)?.[1];
  if (numeric) return numeric.replace("-", "_");

  // From title: look for leading number pattern
  const fromTitle = title.match(/^(\d+[a-z]?(?:[._]\d+)?)\s/)?.[1];
  if (fromTitle) return fromTitle.replace(".", "_");

  return null;
}

function getLocalFile(id: string): string | null {
  const candidates = [
    path.join(PROCEDURES_DIR, `${id}.md`),
    path.join(PROCEDURES_DIR, `${id.replace("_", "_0")}.md`),
  ];
  return candidates.find((f) => fs.existsSync(f)) ?? null;
}

// ─── Main logic ───────────────────────────────────────────────────────────────

async function diffPage(
  wikiName: string,
  space: string,
  page: WikiPage,
): Promise<PageDiff> {
  const localId = guessLocalId(page.name, page.title);
  const localFile = localId ? getLocalFile(localId) : null;

  let wikiContent: { title: string; content: string; modified?: string } | null = null;
  try {
    wikiContent = await fetchPageContent(wikiName, space, page.name);
  } catch (err) {
    return {
      wikiPage: page.name,
      wikiSpace: space,
      localId,
      localFile,
      status: "error",
      error: String(err),
    };
  }

  if (!wikiContent) {
    return { wikiPage: page.name, wikiSpace: space, localId, localFile, status: "error", error: "Empty response" };
  }

  if (!localFile || !localId) {
    return {
      wikiPage: page.name,
      wikiSpace: space,
      localId,
      localFile: null,
      status: "new",
      wikiTitle: wikiContent.title,
      wikiUpdated: wikiContent.modified,
    };
  }

  const localMarkdown = fs.readFileSync(localFile, "utf8");

  // Detect content type (XWiki markup vs HTML)
  const isHtml = wikiContent.content.trimStart().startsWith("<");
  const wikiPlain = isHtml
    ? htmlToPlainText(wikiContent.content)
    : wikiMarkupToPlainText(wikiContent.content);

  const localPlain = localMarkdownToPlainText(localMarkdown);

  const similarity = computeSimilarity(wikiPlain, localPlain);
  const { added, removed } = linesDiff(localPlain, wikiPlain);

  return {
    wikiPage: page.name,
    wikiSpace: space,
    localId,
    localFile: path.relative(process.cwd(), localFile),
    status: similarity > 0.85 ? "ok" : "changed",
    wikiTitle: wikiContent.title,
    wikiUpdated: wikiContent.modified,
    similarity: Math.round(similarity * 100) / 100,
    addedLines: added,
    removedLines: removed,
  };
}

function printReport(diffs: PageDiff[], outputFile?: string) {
  const summary = {
    total: diffs.length,
    ok: diffs.filter((d) => d.status === "ok").length,
    changed: diffs.filter((d) => d.status === "changed").length,
    missing: diffs.filter((d) => d.status === "missing").length,
    new: diffs.filter((d) => d.status === "new").length,
    error: diffs.filter((d) => d.status === "error").length,
  };

  console.log("\n═══ Wiki Diff Report ═══");
  console.log(`Total pages in wiki: ${summary.total}`);
  console.log(`  ✓ OK:       ${summary.ok}`);
  console.log(`  ✎ Changed:  ${summary.changed}`);
  console.log(`  + New:      ${summary.new} (in wiki, not local)`);
  console.log(`  - Missing:  ${summary.missing} (local, not in wiki)`);
  console.log(`  ✗ Error:    ${summary.error}`);

  if (summary.new > 0) {
    console.log("\n── New procedures (in wiki, not locally) ──");
    diffs.filter((d) => d.status === "new").forEach((d) => {
      console.log(`  [NEW]  ${d.wikiSpace}/${d.wikiPage} — "${d.wikiTitle ?? "?"}"`);
    });
  }

  if (summary.changed > 0) {
    console.log("\n── Changed procedures (wiki differs from local) ──");
    diffs.filter((d) => d.status === "changed").forEach((d) => {
      console.log(
        `  [CHG]  ${d.localId} (${d.localFile ?? "?"}) — similarity: ${d.similarity} · +${d.addedLines}/-${d.removedLines} lines`
      );
    });
  }

  if (summary.error > 0) {
    console.log("\n── Errors ──");
    diffs.filter((d) => d.status === "error").forEach((d) => {
      console.log(`  [ERR]  ${d.wikiSpace}/${d.wikiPage}: ${d.error}`);
    });
  }

  if (outputFile) {
    const report = { generatedAt: new Date().toISOString(), summary, diffs };
    fs.writeFileSync(outputFile, JSON.stringify(report, null, 2), "utf8");
    console.log(`\nReport written to ${outputFile}`);
  }
}

// ─── Entry point ─────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const singleId = args.find((a) => a === "--id") ? args[args.indexOf("--id") + 1] : null;
  const listOnly = args.includes("--list");
  const missingOnly = args.includes("--missing");
  const changedOnly = args.includes("--changed");
  const outputFileIdx = args.indexOf("--output");
  const outputFile = outputFileIdx !== -1 ? args[outputFileIdx + 1] : undefined;

  console.log(`Connecting to ${BASE_URL}...`);

  // Discover wiki name
  let wikiName: string;
  try {
    wikiName = await discoverWikiName();
    console.log(`Wiki name: ${wikiName}`);
  } catch (err) {
    console.error("Failed to reach wiki REST API:", err);
    console.error(`Make sure ${REST_BASE}/ is accessible.`);
    process.exit(1);
  }

  // List spaces
  let spaces: WikiSpace[] = [];
  try {
    spaces = await listSpaces(wikiName);
    console.log(`Found ${spaces.length} spaces: ${spaces.map((s) => s.name).join(", ")}`);
  } catch (err) {
    console.error("Failed to list spaces:", err);
    process.exit(1);
  }

  // Filter to relevant spaces (procedures)
  const relevantSpaces = spaces.filter((s) =>
    /procedimiento|asistencial|técnica|operativo|svb|sva/i.test(s.name)
  );
  if (relevantSpaces.length === 0) {
    console.warn("No procedure spaces found — using all spaces.");
    relevantSpaces.push(...spaces);
  }
  console.log(`Relevant spaces: ${relevantSpaces.map((s) => s.name).join(", ")}`);

  // Collect all pages
  const allPages: Array<WikiPage & { space: string }> = [];
  for (const space of relevantSpaces) {
    await sleep(DELAY_MS);
    try {
      const pages = await listPagesInSpace(wikiName, space.name);
      allPages.push(...pages.map((p) => ({ ...p, space: space.name })));
      console.log(`  ${space.name}: ${pages.length} pages`);
    } catch (err) {
      console.warn(`  Failed to list ${space.name}:`, err);
    }
  }

  if (listOnly) {
    console.log(`\n${"─".repeat(60)}`);
    allPages.forEach((p) =>
      console.log(`  ${p.space}/${p.name}  "${p.title ?? ""}"`)
    );
    console.log(`\nTotal: ${allPages.length} pages`);
    return;
  }

  // Filter to single ID if requested
  const pagesToDiff = singleId
    ? allPages.filter((p) => {
        const localId = guessLocalId(p.name, p.title ?? "");
        return localId === singleId || p.name.includes(singleId);
      })
    : allPages;

  if (singleId && pagesToDiff.length === 0) {
    console.warn(`No wiki page found matching id "${singleId}". Try --list to see all pages.`);
    return;
  }

  // Compute diffs
  console.log(`\nDiffing ${pagesToDiff.length} pages...`);
  const diffs: PageDiff[] = [];

  for (const page of pagesToDiff) {
    await sleep(DELAY_MS);
    process.stdout.write(`  ${page.space}/${page.name}... `);
    const diff = await diffPage(wikiName, page.space, page);
    diffs.push(diff);
    console.log(diff.status === "ok" ? "✓" : diff.status === "changed" ? "≠" : diff.status === "new" ? "+" : "!");
  }

  // Also find local procedures not in wiki
  const wikiLocalIds = new Set(diffs.map((d) => d.localId).filter(Boolean));
  const localFiles = fs.readdirSync(PROCEDURES_DIR).filter((f) => f.endsWith(".md"));
  for (const file of localFiles) {
    const id = file.replace(".md", "");
    if (!wikiLocalIds.has(id)) {
      diffs.push({
        wikiPage: "",
        wikiSpace: "",
        localId: id,
        localFile: path.join("content/procedures", file),
        status: "missing",
      });
    }
  }

  // Filter output
  let filtered = diffs;
  if (missingOnly) filtered = diffs.filter((d) => d.status === "missing");
  if (changedOnly) filtered = diffs.filter((d) => d.status === "changed");

  printReport(filtered, outputFile);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

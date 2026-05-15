#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import * as cheerio from "cheerio";
import TurndownService from "turndown";
// @ts-expect-error CJS default export
import gfmPkg from "turndown-plugin-gfm";
const { gfm } = gfmPkg as { gfm: unknown };
import {
  appendSyncRun,
  applyNewThisWeek,
  approvePendingChanges,
  buildTickerFromEvents,
  classifyProcedureChange,
  classifyProcedureUpdateKind,
  extractAttachmentLinks,
  getSectionFromXWikiUrl,
  parseProcedureSpacesXml,
  readManualSyncMetadata,
  readManualUpdatesDataset,
  resolveStableProcedureIdForSource,
  rewriteAttachmentLinks,
  stableContentHash,
  summarizeChanges,
  withPendingChanges,
  writeManualUpdatesDataset,
  type ManualAttachment,
  type AttachmentDownloadFailure,
  type ManualSyncRun,
  type ProcedureSnapshot,
  type ProcedureSpace,
  type SyncChange,
  type SyncDomain,
  type SyncDomainSummary,
  type ManualUpdateEvent,
} from "../lib/manual-sync.ts";
import {
  buildProcedureTitleIndex,
  parseOfficialPdfUpdateText,
  toOfficialPdfEvents,
} from "../lib/manual-updates.ts";
import {
  MAIN_CONTENT_PATHS,
  parseAbbreviationsFromHtml,
  parseCollaboratorsFromHtml,
  parseMainLinksFromHtml,
} from "../lib/main-content.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, "..");
const WIKI_BASE = "https://servpub.madrid.es/manualsamur";
const REST_BASE = `${WIKI_BASE}/rest/wikis/xwiki`;
const PROCEDURES_DIR = path.join(ROOT_DIR, "content/procedures");
const METADATA_PATH = path.join(ROOT_DIR, "content/data/manual-sync.json");
const DELAY_MS = 650;
const MAIN_PAGE_URL = `${WIKI_BASE}/bin/view/Main/`;
const MAIN_ABBREVIATIONS_URL = `${WIKI_BASE}/bin/view/Menu/Cabecera%20principal/Abreviaturas/WebHome`;
const MAIN_COLLABORATORS_URL = `${WIKI_BASE}/bin/view/Menu/Cabecera%20principal/Colaboradores/WebHome`;

// Pages that are not discovered automatically (e.g. nested under generic namespaces)
const EXTRA_PROCEDURE_URLS: Array<{ url: string; title: string }> = [
  {
    url: `${WIKI_BASE}/bin/view/Procedimientos%20asistenciales/Activaci%C3%B3n%20y%20actuaci%C3%B3n%20del%20psic%C3%B3logo%20de%20Guardia`,
    title: "Activación y actuación del psicólogo de Guardia",
  },
];

const HEADERS = {
  "User-Agent": "ManualSAMUR-sync/2.0 (personal use; contact: local developer)",
};

interface SyncOptions {
  command: "detect" | "apply" | "ingest-official-pdf";
  dryRun: boolean;
  domains: Set<SyncDomain>;
  ids: Set<string>;
  officialPdfUrl?: string;
  officialPdfFile?: string;
}

interface DomainResult {
  summary: SyncDomainSummary;
  changes: SyncChange[];
  errors: string[];
}

function parseArgs(argv: string[]): SyncOptions {
  const firstArg = argv[0] && !argv[0].startsWith("--") ? argv[0] : "detect";
  const command = firstArg === "apply" || firstArg === "ingest-official-pdf" ? firstArg : "detect";
  const args = firstArg === argv[0] ? argv.slice(1) : argv;
  const dryRun = args.includes("--dry-run") || command === "detect";

  const idsFlag = args.find((arg) => arg.startsWith("--ids="));
  const idsValue = idsFlag ? idsFlag.replace("--ids=", "") : "";
  const ids = new Set(idsValue.split(",").map((item) => item.trim()).filter(Boolean));

  const officialPdfUrl = args.find((arg) => arg.startsWith("--url="))?.replace("--url=", "");
  const officialPdfFile = args.find((arg) => arg.startsWith("--file="))?.replace("--file=", "");

  const requested = new Set<SyncDomain>();
  if (args.includes("--all") || args.length === 0 || args.every((arg) => arg === "--dry-run")) {
    requested.add("procedures");
    requested.add("vademecum");
    requested.add("codigos");
    requested.add("main");
  }
  if (args.includes("--procedures")) requested.add("procedures");
  if (args.includes("--vademecum")) requested.add("vademecum");
  if (args.includes("--codigos")) requested.add("codigos");
  if (args.includes("--main")) requested.add("main");

  return {
    command,
    dryRun,
    domains: requested,
    ids,
    officialPdfUrl,
    officialPdfFile,
  };
}

async function fetchText(url: string, accept = "text/html,text/plain", timeoutMs = 20000) {
  const response = await fetch(url, {
    headers: { ...HEADERS, Accept: accept },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} fetching ${url}`);
  return response.text();
}

async function fetchBuffer(url: string) {
  const response = await fetch(url, {
    headers: HEADERS,
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} downloading ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
}

function normalizeTitle(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function walkProceduresDir(): string[] {
  const files: string[] = [];
  if (!fs.existsSync(PROCEDURES_DIR)) return files;
  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.isFile() && entry.name.endsWith(".md")) files.push(p);
    }
  }
  walk(PROCEDURES_DIR);
  return files;
}

function sectionToSubfolder(section: string): string {
  return section
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function loadExistingTitleMap() {
  const map = new Map<string, string>();
  for (const filePath of walkProceduresDir()) {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = matter(raw);
    const title = typeof parsed.data.title === "string" ? parsed.data.title : "";
    const id = typeof parsed.data.id === "string" ? parsed.data.id : path.basename(filePath, ".md");
    if (title && id) map.set(normalizeTitle(title), id);
  }
  return map;
}

function resolveProcedureId(space: ProcedureSpace, existingTitleMap: Map<string, string>) {
  return resolveStableProcedureIdForSource(space.title, space.url) ?? existingTitleMap.get(normalizeTitle(space.title)) ?? slugify(space.title);
}

function findProcedureFilePath(id: string): string | null {
  const flat = path.join(PROCEDURES_DIR, `${id}.md`);
  if (fs.existsSync(flat)) return flat;
  for (const filePath of walkProceduresDir()) {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = matter(raw);
    if (parsed.data.id === id) return filePath;
  }
  return null;
}

function readExistingProcedureSnapshot(id: string): ProcedureSnapshot | null {
  const filePath = findProcedureFilePath(id);
  if (!filePath) return null;

  const parsed = matter(fs.readFileSync(filePath, "utf8"));
  const data = parsed.data;

  return {
    id: typeof data.id === "string" ? data.id : id,
    title: typeof data.title === "string" ? data.title : id,
    source: typeof data.source === "string" ? data.source : "",
    sourceUpdated: typeof data.sourceUpdated === "string" ? data.sourceUpdated : typeof data.updated === "string" ? data.updated : "",
    contentHash: typeof data.contentHash === "string" ? data.contentHash : stableContentHash(parsed.content),
    attachments: Array.isArray(data.attachments) ? data.attachments as ManualAttachment[] : [],
  };
}

function readExistingProcedureMeta(id: string): { filePath: string; content: string; data: Record<string, unknown> } | null {
  const filePath = findProcedureFilePath(id);
  if (!filePath) return null;
  const parsed = matter(fs.readFileSync(filePath, "utf8"));
  return {
    filePath,
    content: parsed.content,
    data: parsed.data as Record<string, unknown>,
  };
}

function writeProcedureMetadataOnly(
  existing: { filePath: string; content: string; data: Record<string, unknown> },
  snapshot: ProcedureSnapshot,
) {
  const frontmatter = {
    ...existing.data,
    updated: snapshot.sourceUpdated,
    sourceUpdated: snapshot.sourceUpdated,
    source: snapshot.source,
    contentHash: snapshot.contentHash,
    attachments: snapshot.attachments,
  };
  const output = matter.stringify(`${existing.content.trim()}\n`, frontmatter);
  fs.writeFileSync(existing.filePath, output, "utf8");
}

function extractRawFromPlainPage(html: string) {
  const match = html.match(/<pre[^>]*>([\s\S]+?)<\/pre>/);
  return decodeHtml(match?.[1] ?? html);
}

function decodeHtml(value: string) {
  return value
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

function extractSourceUpdated(rawMarkup: string) {
  const match = rawMarkup.match(/Última modificación el\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/i);
  if (!match) return new Date().toISOString().slice(0, 10);
  const [, day, month, year] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function xwikiToMarkdown(raw: string) {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/\{\{html[\s\S]*?\{\{\/html\}\}/gi, "")
    .replace(/\(%[\s\S]*?%\)/g, "")
    .replace(/^\s*\(%[^)]*%\)\s*$/gm, "")
    .replace(/^\s*\(\(\(\s*$/gm, "")
    .replace(/^\s*\)\)\)\s*$/gm, "")
    .replace(/^======\s*(.+?)\s*======\s*$/gm, "##### $1")
    .replace(/^=====\s*(.+?)\s*=====\s*$/gm, "##### $1")
    .replace(/^====\s*(.+?)\s*====\s*$/gm, "#### $1")
    .replace(/^===\s*(.+?)\s*===\s*$/gm, "### $1")
    .replace(/^==\s*(.+?)\s*==\s*$/gm, "## $1")
    .replace(/^=\s*(.+?)\s*=\s*$/gm, "# $1")
    .replace(/^(\*+)\s+(.+)$/gm, (_match, stars: string, text: string) => `${"  ".repeat(stars.length - 1)}* ${text}`)
    .replace(/\/\/([^/\n]+?)\/\//g, "*$1*")
    .replace(/__([^_\n]+?)__/g, "*$1*")
    .replace(/,,([^,\n]*?),,/g, "$1")
    .replace(/\^\^([^\^\n]*?)\^\^/g, "$1")
    .replace(/\{\{popoverV[^}]*?(?:anchorId|link)="([^"]+)"[^}]*?\}\}\{\{\/popoverV\}\}/g, (_match, drugName: string) => `<DrugLink name="${drugName}" />`)
    .replace(/\[\[([^\]]+?)>>url:([^\]]+?)\]\]/g, "[$1]($2)")
    .replace(/\[\[([^\]]+?)>>(https?:[^\]]+?)\]\]/g, "[$1]($2)")
    .replace(/\[\[([^\]]+?)>>doc:[^\]]+?\]\]/g, "$1")
    .replace(/\[\[([^\]]+?)\]\]/g, "$1")
    .replace(/\{\{[^}]+\}\}/g, "")
    .replace(/<(?!\/?DrugLink\b)/g, "&lt;")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function htmlToMarkdown(html: string): string {
  const td = new TurndownService({ headingStyle: "atx", bulletListMarker: "-", hr: "---" }) as TurndownService & { use: (plugin: unknown) => void };
  td.use(gfm);
  td.addRule("keepDrugLink", {
    filter: (node: Node) => (node as Element).nodeName === "SPAN" && (node as Element).className?.includes?.("popover"),
    replacement: (_content: string, node: Node) => {
      const el = node as Element;
      const name = el.getAttribute?.("data-drug") ?? el.textContent ?? _content;
      return `<DrugLink name="${name}" />`;
    },
  });
  return td.turndown(html).trim();
}

async function fetchHtmlMarkdown(url: string): Promise<{ markdown: string; sourceUpdated: string } | null> {
  try {
    const res = await fetch(url, { headers: { ...HEADERS, Accept: "text/html" }, signal: AbortSignal.timeout(20000) });
    if (!res.ok) return null;
    const rawHtml = await res.text();

    const modMatch = rawHtml.match(/ltima modificaci[oó]n el\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/i);
    const sourceUpdated = modMatch
      ? `${modMatch[3]}-${modMatch[2].padStart(2, "0")}-${modMatch[1].padStart(2, "0")}`
      : new Date().toISOString().slice(0, 10);

    const $ = cheerio.load(rawHtml);
    $("nav, header, #document-menu, .navigationaction, .breadcrumb, #xwikiright, .xwikifooter, footer, script, style, .button, #xwikitopmenu, #xwikitopnav").remove();
    const contentEl = $(".wikicontent, #xwikicontent").first();
    if (!contentEl.length) return null;

    const markdown = htmlToMarkdown(contentEl.html() ?? "");
    return { markdown, sourceUpdated };
  } catch {
    return null;
  }
}

function validateProcedure(title: string, markdown: string, attachments: ManualAttachment[]) {
  if (!title.trim()) return ["missing title"];
  if (markdown.length < 50 && attachments.length === 0) return ["content too short, no attachments"];
  return [];
}

function buildProcedureFile(snapshot: ProcedureSnapshot, section: string, slug: string, markdown: string) {
  const frontmatter = {
    id: snapshot.id,
    title: snapshot.title,
    section,
    slug,
    tags: [],
    synonyms: [],
    related: [],
    updated: snapshot.sourceUpdated,
    sourceUpdated: snapshot.sourceUpdated,
    source: snapshot.source,
    contentHash: snapshot.contentHash,
    attachments: snapshot.attachments,
    editorialStatus: "source",
    editorialLockedAt: "",
    lastApprovedOfficialUpdateAt: "",
  };

  return matter.stringify(`${markdown.trim()}\n`, frontmatter);
}

async function discoverProcedureSpaces() {
  const spacesXml = await fetchText(`${REST_BASE}/spaces`, "application/xml,text/xml", 30000);
  const fromSpaces = parseProcedureSpacesXml(spacesXml);
  const extraFromAllDocs = await discoverFromAllDocs();

  const seen = new Set(fromSpaces.map((s) => s.url));
  const merged = [...fromSpaces];
  for (const s of extraFromAllDocs) {
    if (!seen.has(s.url)) {
      seen.add(s.url);
      merged.push(s);
    }
  }
  // Always include explicitly listed pages not auto-discovered
  for (const extra of EXTRA_PROCEDURE_URLS) {
    if (!seen.has(extra.url)) {
      seen.add(extra.url);
      merged.push({
        title: extra.title,
        url: extra.url,
        section: getSectionFromXWikiUrl(extra.url),
        depth: 2,
      });
    }
  }
  return merged;
}

async function discoverFromAllDocs(): Promise<ProcedureSpace[]> {
  try {
    const html = await fetchText(`${WIKI_BASE}/bin/view/Main/AllDocs`);
    const $ = cheerio.load(html);
    const spaces: ProcedureSpace[] = [];
    const seen = new Set<string>();

    $("a[href*='/bin/view/']").each((_i, el) => {
      const href = $(el).attr("href") ?? "";
      const match = href.match(/\/bin\/view\/(.+?)(?:\/WebHome)?(?:\?.*)?$/);
      if (!match) return;
      const rawPath = decodeURIComponent(match[1]);
      const parts = rawPath.split("/").filter((p) => p && p !== "WebHome");
      if (parts.length < 2) return;

      const name = parts.at(-1) ?? "";
      if (/^(xwiki|main|blog|menu|panels|mapa|abreviaturas|vademécum|vademecum|colaboradores|etiquetas|webhome|otros|calendario|authservice|exportar|cabeceraetiquetas)$/i.test(name)) return;
      if (/^Procedimientos (SVA|SVB|Administrativos|Operativos|asistenciales)$/i.test(name)) return;

      const absUrl = `${WIKI_BASE}${href.split("?")[0].replace(/\/WebHome$/, "")}`;
      if (seen.has(absUrl)) return;
      seen.add(absUrl);

      const section = getSectionFromXWikiUrl(absUrl);
      if (section === "General" && parts.length < 3) return;

      spaces.push({ title: name, url: absUrl, section, depth: parts.length });
    });

    return spaces;
  } catch {
    return [];
  }
}

async function downloadAttachments(attachments: ManualAttachment[], dryRun: boolean): Promise<AttachmentDownloadFailure[]> {
  if (dryRun) return [];

  const failures: AttachmentDownloadFailure[] = [];
  for (const attachment of attachments) {
    const relativeLocalPath = attachment.localPath.replace(/^\/+/, "");
    const destination = (attachment.localPath.startsWith("/images/") || attachment.localPath.startsWith("/docs/"))
      ? path.join(ROOT_DIR, "public", relativeLocalPath)
      : path.join(ROOT_DIR, relativeLocalPath);
    const legacyDocsDestination = relativeLocalPath.startsWith("docs/procedures/")
      ? path.join(ROOT_DIR, relativeLocalPath)
      : null;

    try {
      const payload = await fetchBuffer(attachment.sourceUrl);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, payload);
      if (legacyDocsDestination) {
        fs.mkdirSync(path.dirname(legacyDocsDestination), { recursive: true });
        fs.writeFileSync(legacyDocsDestination, payload);
      }
    } catch (error) {
      failures.push({
        sourceUrl: attachment.sourceUrl,
        localPath: attachment.localPath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return failures;
}

async function syncProcedures(dryRun: boolean, allowedProcedureIds?: Set<string>): Promise<DomainResult> {
  fs.mkdirSync(PROCEDURES_DIR, { recursive: true });

  const spaces = await discoverProcedureSpaces();
  const existingTitleMap = loadExistingTitleMap();
  const changes: SyncChange[] = [];
  const errors: string[] = [];
  let failed = 0;
  let skipped = 0;

  for (const space of spaces) {
    await sleep(DELAY_MS);

    try {
      const id = resolveProcedureId(space, existingTitleMap);
      if (allowedProcedureIds && !allowedProcedureIds.has(id)) {
        skipped++;
        continue;
      }

      const plainHtml = await fetchText(`${space.url.replace(/\/?$/, "/")}?xpage=plain&raw=1`);
      const rawMarkup = extractRawFromPlainPage(plainHtml);
      let sourceUpdated = extractSourceUpdated(rawMarkup);
      const markdownWithRemoteAttachments = xwikiToMarkdown(rawMarkup);
      const attachments = extractAttachmentLinks(rawMarkup + "\n" + markdownWithRemoteAttachments, space.url, id);
      let markdown = rewriteAttachmentLinks(markdownWithRemoteAttachments, attachments);

      if (markdown.length < 200 && attachments.length === 0) {
        const htmlResult = await fetchHtmlMarkdown(space.url);
        if (htmlResult && htmlResult.markdown.length > markdown.length) {
          markdown = htmlResult.markdown;
          sourceUpdated = htmlResult.sourceUpdated;
        }
      }

      const validationErrors = validateProcedure(space.title, markdown, attachments);
      if (validationErrors.length > 0) {
        skipped++;
        errors.push(`${space.title}: ${validationErrors.join(", ")}`);
        continue;
      }

      const snapshot: ProcedureSnapshot = {
        id,
        title: space.title,
        source: space.url,
        sourceUpdated,
        contentHash: stableContentHash(markdown),
        attachments,
      };
      const existingSnapshot = readExistingProcedureSnapshot(id);
      const existingMeta = readExistingProcedureMeta(id);
      const editorialStatus = existingMeta?.data?.editorialStatus === "enhanced" ? "enhanced" : "source";
      const rawChangeType = classifyProcedureChange(existingSnapshot, snapshot);
      const blockedByEditorial = rawChangeType !== "unchanged" && editorialStatus === "enhanced";
      const changeType = blockedByEditorial ? "blocked_by_editorial" : rawChangeType;
      const changeKind = classifyProcedureUpdateKind(existingSnapshot, snapshot, changeType);

      changes.push({
        id,
        title: space.title,
        changeType,
        changeKind,
        blockedByEditorial,
        procedurePath: existingMeta?.filePath,
        sourceUpdated,
        source: space.url,
      });

      if (!dryRun && changeType !== "unchanged") {
        if (blockedByEditorial && existingMeta) {
          writeProcedureMetadataOnly(existingMeta, snapshot);
          continue;
        }

        const attachmentFailures = await downloadAttachments(attachments, false);
        for (const failure of attachmentFailures) {
          errors.push(`${space.title}: adjunto no descargado ${failure.sourceUrl} (${failure.error})`);
        }

        const slug = `${id}-${slugify(space.title)}`.slice(0, 90);
        const subfolder = sectionToSubfolder(space.section);
        const procedureDir = path.join(PROCEDURES_DIR, subfolder);
        fs.mkdirSync(procedureDir, { recursive: true });
        fs.writeFileSync(path.join(procedureDir, `${id}.md`), buildProcedureFile(snapshot, space.section, slug, markdown), "utf8");
      }
    } catch (error) {
      failed++;
      errors.push(`${space.title}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return {
    summary: { ...summarizeChanges(changes, spaces.length), failed, skipped },
    changes,
    errors,
  };
}

function hashFiles(paths: string[]) {
  const hashes = new Map<string, string>();
  for (const itemPath of paths) {
    const fullPath = path.join(ROOT_DIR, itemPath);
    hashes.set(itemPath, fs.existsSync(fullPath) ? stableContentHash(fs.readFileSync(fullPath, "utf8")) : "");
  }
  return hashes;
}

function diffHashes(before: Map<string, string>, after: Map<string, string>): SyncChange[] {
  return [...after.entries()].map(([itemPath, hash]) => ({
    id: itemPath,
    title: path.basename(itemPath),
    changeType: before.get(itemPath) ? before.get(itemPath) === hash ? "unchanged" : "updated" : "created",
  }));
}

async function syncVademecum(dryRun: boolean): Promise<DomainResult> {
  const files = [
    "content/data/vademecum.json",
    "content/data/perfusiones.json",
    "content/data/fluidos.json",
    "content/data/vademecum-comerciales.json",
  ];
  const before = hashFiles(files);

  if (!dryRun) {
    execFileSync(process.execPath, ["--experimental-strip-types", "scripts/scrape-vademecum.ts"], {
      cwd: ROOT_DIR,
      stdio: "inherit",
    });
  }

  const after = hashFiles(files);
  const changes = diffHashes(before, after);
  return { summary: summarizeChanges(changes, files.length), changes, errors: [] };
}

async function syncCodigos(dryRun: boolean): Promise<DomainResult> {
  const files = [
    "content/data/codigos-incidente.json",
    "content/data/codigos-indicativos.json",
    "content/data/codigos-claves.json",
    "content/data/codigos-sva.json",
    "content/data/codigos-svb.json",
    "content/data/codigos-upsi.json",
    "content/data/codigos-upsq.json",
    "content/data/codigos-icao.json",
    "content/data/codigos-cheatsheet.json",
  ];
  const before = hashFiles(files);

  if (!dryRun) {
    fs.mkdirSync(path.join(ROOT_DIR, "docs"), { recursive: true });
    const knownOfficialDocs = [
      "https://servpub.madrid.es/manualsamur/bin/download/Menu/Cabecera%20principal/Hoja%20resumen%20procedimiento%20radiotelef%C3%B3nico%20SAMUR-PC%20USVA/WebHome/Hoja-resumen-procedimiento-radiotelefonico-SAMUR-PC-USVA_202604.pdf",
      "https://servpub.madrid.es/manualsamur/bin/download/Menu/Cabecera%20principal/Hoja%20resumen%20procedimiento%20radiotelef%C3%B3nico%20SAMUR-PC%20USVB/WebHome/Hoja-resumen-procedimiento-radiotelefonico-SAMUR-PC-USVB_202604.pdf",
    ];

    for (const url of knownOfficialDocs) {
      try {
        fs.writeFileSync(path.join(ROOT_DIR, "docs", decodeURIComponent(url.split("/").at(-1) ?? "codigos.pdf")), await fetchBuffer(url));
      } catch {
        // ignore
      }
    }
  }

  const after = hashFiles(files);
  const changes = diffHashes(before, after);
  return { summary: summarizeChanges(changes, files.length), changes, errors: [] };
}

function writeJsonDataset(filePath: string, data: unknown) {
  const fullPath = path.join(ROOT_DIR, filePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function syncMain(dryRun: boolean): Promise<DomainResult> {
  const files = [
    MAIN_CONTENT_PATHS.abbreviations,
    MAIN_CONTENT_PATHS.collaborators,
    MAIN_CONTENT_PATHS.mainLinks,
  ];
  const before = hashFiles(files);
  const errors: string[] = [];

  if (!dryRun) {
    try {
      const [mainHtml, abbreviationsHtml, collaboratorsHtml] = await Promise.all([
        fetchText(MAIN_PAGE_URL),
        fetchText(MAIN_ABBREVIATIONS_URL),
        fetchText(MAIN_COLLABORATORS_URL),
      ]);

      const abbreviationSections = parseAbbreviationsFromHtml(abbreviationsHtml);
      const collaborators = parseCollaboratorsFromHtml(collaboratorsHtml, MAIN_COLLABORATORS_URL);
      const mainLinks = parseMainLinksFromHtml(mainHtml, MAIN_PAGE_URL);

      writeJsonDataset(MAIN_CONTENT_PATHS.abbreviations, abbreviationSections);
      writeJsonDataset(MAIN_CONTENT_PATHS.collaborators, collaborators);
      writeJsonDataset(MAIN_CONTENT_PATHS.mainLinks, {
        ...mainLinks,
        abbreviationsUrl: mainLinks.abbreviationsUrl || MAIN_ABBREVIATIONS_URL,
        collaboratorsUrl: mainLinks.collaboratorsUrl || MAIN_COLLABORATORS_URL,
      });
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  const after = hashFiles(files);
  const changes = diffHashes(before, after);
  return {
    summary: summarizeChanges(changes, files.length),
    changes,
    errors,
  };
}

function emptyDomainResult(): DomainResult {
  return {
    summary: { created: 0, updated: 0, unchanged: 0, blocked: 0, failed: 0, skipped: 0 },
    changes: [],
    errors: [],
  };
}

function mergeEvents(existing: ManualUpdateEvent[], incoming: ManualUpdateEvent[]) {
  const byId = new Map(existing.map((event) => [event.eventId, event]));
  for (const event of incoming) byId.set(event.eventId, event);
  return [...byId.values()].sort((a, b) => {
    const ak = `${a.effectiveDate}|${a.approvedAt ?? ""}`;
    const bk = `${b.effectiveDate}|${b.approvedAt ?? ""}`;
    return bk.localeCompare(ak);
  });
}

function runChangesToEvents(run: ManualSyncRun, approvedAt?: string): ManualUpdateEvent[] {
  const events: ManualUpdateEvent[] = [];

  for (const [domain, domainChanges] of Object.entries(run.changes) as Array<[SyncDomain, SyncChange[]]>) {
    for (const change of domainChanges) {
      if (change.changeType === "unchanged") continue;
      const label = change.changeKind === "nuevo"
        ? "Nuevo"
        : change.changeKind === "revisado"
          ? "Revisado"
          : change.changeType === "blocked_by_editorial"
            ? "Bloqueado editorial"
            : "Actualizado";
      const summary = domain === "procedures"
        ? `${label}: ${change.id} ${change.title}`
        : `${domain} actualizado: ${change.title}`;

      events.push({
        eventId: `wiki:${run.id}:${domain}:${change.id}`,
        origin: "wiki",
        officialUrl: change.source,
        procedureIds: domain === "procedures" ? [change.id] : [],
        changeKind: change.changeKind ?? (change.changeType === "created" ? "nuevo" : "actualizado"),
        summary,
        effectiveDate: change.sourceUpdated || run.finishedAt.slice(0, 10),
        approvedAt,
        isNewThisWeek: false,
      });
    }
  }

  return events;
}

function saveMetadata(metadata: ReturnType<typeof readManualSyncMetadata>) {
  fs.writeFileSync(METADATA_PATH, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
}

function extractDateFromPath(filePath: string) {
  const basename = path.basename(filePath);
  const match = basename.match(/(20\d{2})[^0-9]?([01]?\d)?/);
  if (!match) return new Date().toISOString().slice(0, 10);
  const year = match[1];
  const month = (match[2] || "01").padStart(2, "0");
  return `${year}-${month}-01`;
}

function ingestOfficialPdf(options: SyncOptions) {
  if (!options.officialPdfFile || !options.officialPdfUrl) {
    throw new Error("ingest-official-pdf requiere --file=<ruta_local_pdf> y --url=<url_oficial>");
  }

  const rawText = execFileSync("pdftotext", ["-q", "-enc", "UTF-8", options.officialPdfFile, "-"], {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });

  const parsed = parseOfficialPdfUpdateText(rawText);
  const approvedAt = new Date().toISOString();
  const effectiveDate = extractDateFromPath(options.officialPdfFile);
  const index = buildProcedureTitleIndex(ROOT_DIR);
  const incomingEvents = toOfficialPdfEvents(parsed, options.officialPdfUrl, effectiveDate, approvedAt, index);

  const dataset = readManualUpdatesDataset(ROOT_DIR);
  const merged = mergeEvents(dataset.events, incomingEvents);
  const normalized = applyNewThisWeek(merged, new Date());
  writeManualUpdatesDataset({ generatedAt: approvedAt, events: normalized }, ROOT_DIR);

  const metadata = readManualSyncMetadata(ROOT_DIR);
  const ticker = buildTickerFromEvents(normalized, new Date());
  const next = {
    ...metadata,
    manualVersionCurrent: parsed.manualVersionCurrent || metadata.manualVersionCurrent,
    manualVersion: parsed.manualVersionCurrent || metadata.manualVersion,
    lastApprovedAt: approvedAt,
    globalUpdateTimeline: normalized.map((event) => event.eventId),
    ...ticker,
  };
  saveMetadata(next);

  console.log(JSON.stringify({
    ingested: incomingEvents.length,
    manualVersionCurrent: next.manualVersionCurrent,
    approvedAt,
  }, null, 2));
}

async function executeSync(options: SyncOptions) {
  const startedAt = new Date().toISOString();
  const results: Record<SyncDomain, DomainResult> = {
    procedures: emptyDomainResult(),
    vademecum: emptyDomainResult(),
    codigos: emptyDomainResult(),
    main: emptyDomainResult(),
  };

  const applyMode = options.command === "apply";
  const metadataBefore = readManualSyncMetadata(ROOT_DIR);

  let allowedProcedureIds: Set<string> | undefined;
  if (applyMode && options.ids.size > 0) {
    allowedProcedureIds = options.ids;
  }

  if (options.domains.has("procedures")) results.procedures = await syncProcedures(options.dryRun, allowedProcedureIds);
  if (options.domains.has("vademecum")) results.vademecum = await syncVademecum(options.dryRun);
  if (options.domains.has("codigos")) results.codigos = await syncCodigos(options.dryRun);
  if (options.domains.has("main")) results.main = await syncMain(options.dryRun);

  const finishedAt = new Date().toISOString();
  const run: ManualSyncRun = {
    id: finishedAt,
    startedAt,
    finishedAt,
    dryRun: options.dryRun,
    summary: {
      procedures: results.procedures.summary,
      vademecum: results.vademecum.summary,
      codigos: results.codigos.summary,
      main: results.main.summary,
    },
    changes: {
      procedures: results.procedures.changes,
      vademecum: results.vademecum.changes,
      codigos: results.codigos.changes,
      main: results.main.changes,
    },
    errors: [
      ...results.procedures.errors,
      ...results.vademecum.errors,
      ...results.codigos.errors,
      ...results.main.errors,
    ],
  };

  let metadata = appendSyncRun(metadataBefore, run);
  metadata = withPendingChanges(metadata, run);

  const approvedAt = applyMode ? finishedAt : undefined;
  if (applyMode) {
    metadata = approvePendingChanges(
      metadata,
      (change) => {
        if (options.ids.size === 0) return true;
        return options.ids.has(change.id);
      },
      finishedAt,
      run.id,
    );
  }

  const updates = readManualUpdatesDataset(ROOT_DIR);
  const events = runChangesToEvents(run, approvedAt);
  const mergedEvents = applyNewThisWeek(mergeEvents(updates.events, events), new Date());
  writeManualUpdatesDataset({ generatedAt: finishedAt, events: mergedEvents }, ROOT_DIR);

  const tickerData = buildTickerFromEvents(mergedEvents, new Date());
  metadata = {
    ...metadata,
    globalUpdateTimeline: mergedEvents.map((event) => event.eventId),
    ...tickerData,
  };

  saveMetadata(metadata);
  console.log(JSON.stringify(run, null, 2));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.command === "ingest-official-pdf") {
    ingestOfficialPdf(options);
    return;
  }

  await executeSync(options);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

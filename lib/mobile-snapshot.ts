import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import matter from "gray-matter";

export const MOBILE_SNAPSHOT_SCHEMA = "samur-manual.mobile-content";
export const MOBILE_SNAPSHOT_VERSION = 1;

export interface MobileProcedure {
  id: string;
  title: string;
  section: string;
  slug: string;
  routeKey: string;
  tags: string[];
  synonyms: string[];
  related: string[];
  updated: string;
  sourceUpdated: string;
  source?: string;
  attachments: Array<{ sourceUrl: string; localPath: string; kind: string }>;
  content: string;
  searchText: string;
}

export interface MobileContentSnapshot {
  schema: typeof MOBILE_SNAPSHOT_SCHEMA;
  version: typeof MOBILE_SNAPSHOT_VERSION;
  generatedAt: string;
  hash: string;
  content: {
    procedures: MobileProcedure[];
    codes: Record<string, unknown[]>;
    drugs: unknown[];
    perfusions: unknown[];
    fluids: unknown[];
    commercialNames: unknown[];
    abbreviations: unknown[];
    hospitals: unknown[];
    bases: unknown[];
    status4: unknown[];
    manual: Record<string, unknown>;
    links: Record<string, unknown>;
  };
}

function readData<T>(name: string, cwd = process.cwd()): T {
  return JSON.parse(readFileSync(path.join(cwd, "content/data", `${name}.json`), "utf8")) as T;
}

function walkMarkdownFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return walkMarkdownFiles(fullPath);
    return entry.isFile() && entry.name.endsWith(".md") ? [fullPath] : [];
  });
}

function textForSearch(markdown: string): string {
  return markdown
    .replace(/```[\\s\\S]*?```/g, " ")
    .replace(/!?(?:\\[[^\\]]*\\])?\\([^)]*\\)/g, " ")
    .replace(/[#>*_`|]/g, " ")
    .replace(/\\s+/g, " ")
    .trim();
}

function readProcedures(cwd: string): MobileProcedure[] {
  const procedures = walkMarkdownFiles(path.join(cwd, "content/procedures"))
    .map((filePath) => {
      const { data, content } = matter(readFileSync(filePath, "utf8"));
      const id = String(data.id ?? path.basename(filePath, ".md"));
      return {
        id,
        title: String(data.title ?? id),
        section: String(data.section ?? "General"),
        slug: String(data.slug ?? id),
        routeKey: "",
        tags: Array.isArray(data.tags) ? data.tags.filter((tag): tag is string => typeof tag === "string") : [],
        synonyms: Array.isArray(data.synonyms) ? data.synonyms.filter((synonym): synonym is string => typeof synonym === "string") : [],
        related: Array.isArray(data.related) ? data.related.filter((related): related is string => typeof related === "string") : [],
        updated: String(data.updated ?? ""),
        sourceUpdated: String(data.sourceUpdated ?? ""),
        source: typeof data.source === "string" ? data.source : undefined,
        attachments: Array.isArray(data.attachments)
          ? data.attachments.flatMap((attachment) => {
            if (!attachment || typeof attachment !== "object") return [];
            const candidate = attachment as Record<string, unknown>;
            return typeof candidate.sourceUrl === "string" && typeof candidate.localPath === "string"
              ? [{ sourceUrl: candidate.sourceUrl, localPath: candidate.localPath, kind: typeof candidate.kind === "string" ? candidate.kind : "other" }]
              : [];
          })
          : [],
        content,
        searchText: textForSearch(content),
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id, "es", { numeric: true }));

  const idBySlug = new Map(procedures.map((procedure) => [procedure.slug, procedure.id]));
  return procedures.map((procedure, index) => {
    const linkedProcedureIds = [...procedure.content.matchAll(/\/manual\/([^\s)#?"']+)/g)]
      .map((match) => idBySlug.get(decodeURIComponent(match[1])))
      .filter((id): id is string => Boolean(id) && id !== procedure.id);
    return { ...procedure, routeKey: `${procedure.slug}--${index + 1}`, related: [...new Set([...procedure.related, ...linkedProcedureIds])] };
  });
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function contentHash(content: MobileContentSnapshot["content"]): string {
  return createHash("sha256").update(stableJson(content)).digest("hex");
}

export function buildMobileContentSnapshot(cwd = process.cwd(), generatedAt?: string): MobileContentSnapshot {
  const manual = readData<Record<string, unknown>>("manual-sync", cwd);
  const content: MobileContentSnapshot["content"] = {
    procedures: readProcedures(cwd),
    codes: {
      incidente: readData("codigos-incidente", cwd),
      sva: readData("codigos-sva", cwd),
      svb: readData("codigos-svb", cwd),
      upsi: readData("codigos-upsi", cwd),
      upsq: readData("codigos-upsq", cwd),
      icao: readData("codigos-icao", cwd),
      indicativos: readData("codigos-indicativos", cwd),
      claves: readData("codigos-pc", cwd),
      lima: readData("codigos-lima", cwd),
      cheatsheet: readData("codigos-cheatsheet", cwd),
    },
    drugs: readData("vademecum", cwd),
    perfusions: readData("perfusiones", cwd),
    fluids: readData("fluidos", cwd),
    commercialNames: readData("vademecum-comerciales", cwd),
    abbreviations: readData("abreviaturas", cwd),
    hospitals: readData("hospitals", cwd),
    bases: readData("bases", cwd),
    status4: readData("status4", cwd),
    manual,
    links: readData("main-links", cwd),
  };

  return {
    schema: MOBILE_SNAPSHOT_SCHEMA,
    version: MOBILE_SNAPSHOT_VERSION,
    generatedAt: generatedAt
      ?? (typeof manual.lastApprovedAt === "string" ? manual.lastApprovedAt : undefined)
      ?? (typeof manual.lastSyncAt === "string" ? manual.lastSyncAt : undefined)
      ?? "1970-01-01T00:00:00.000Z",
    hash: contentHash(content),
    content,
  };
}

export function isMobileContentSnapshot(value: unknown): value is MobileContentSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<MobileContentSnapshot>;
  if (snapshot.schema !== MOBILE_SNAPSHOT_SCHEMA || snapshot.version !== MOBILE_SNAPSHOT_VERSION) return false;
  if (!snapshot.content || typeof snapshot.content !== "object" || !Array.isArray(snapshot.content.procedures)) return false;
  if (!snapshot.hash || typeof snapshot.hash !== "string") return false;
  return contentHash(snapshot.content as MobileContentSnapshot["content"]) === snapshot.hash;
}

import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import {
  type ManualUpdateChangeKind,
  type ManualUpdateEvent,
  normalizeProcedureLookupKey,
  resolveStableProcedureId,
} from "./manual-sync.ts";

export interface ParsedOfficialUpdateEntry {
  changeKind: ManualUpdateChangeKind;
  summary: string;
}

export interface ParsedOfficialUpdateDocument {
  manualVersionCurrent?: string;
  entries: ParsedOfficialUpdateEntry[];
}

const CHANGE_KIND_MAP: Record<string, ManualUpdateChangeKind> = {
  nuevo: "nuevo",
  nueva: "nuevo",
  revisado: "revisado",
  revision: "revisado",
  revisión: "revisado",
  revisada: "revisado",
  actualizado: "actualizado",
  actualizacion: "actualizado",
  actualización: "actualizado",
  actualizada: "actualizado",
};

export function parseOfficialPdfUpdateText(rawText: string): ParsedOfficialUpdateDocument {
  const lines = rawText
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  let manualVersionCurrent: string | undefined;
  const entries: ParsedOfficialUpdateEntry[] = [];
  let current: ParsedOfficialUpdateEntry | null = null;

  for (const line of lines) {
    const versionMatch = line.match(/Manual de Procedimientos\s+(\d{4})\s+versi[oó]n\s+([0-9.]+)\s*[–-]\s*de\s+(.+)/i);
    if (versionMatch && !manualVersionCurrent) {
      manualVersionCurrent = `${versionMatch[3].trim().replace(/[.]+$/g, "")} v${versionMatch[2]}`;
      continue;
    }

    const cleaned = line.replace(/^[-•·]\s*/, "").trim();
    const entryMatch = cleaned.match(/^(Actualizaci[oó]n|Actualizado|Revisi[oó]n|Revisado|Nuevo|Nueva)\s*:\s*(.+)$/i);

    if (entryMatch) {
      if (current) entries.push(current);
      const key = normalizeProcedureLookupKey(entryMatch[1]).split(" ")[0] ?? "";
      const kind = CHANGE_KIND_MAP[key] ?? "actualizado";
      current = {
        changeKind: kind,
        summary: entryMatch[2].trim(),
      };
      continue;
    }

    if (current && !/^Subdirecci[oó]n General/i.test(cleaned)) {
      current.summary = `${current.summary} ${cleaned}`.replace(/\s+/g, " ").trim();
    }
  }

  if (current) entries.push(current);

  return {
    manualVersionCurrent,
    entries,
  };
}

interface ProcedureIndexItem {
  id: string;
  title: string;
  normalizedTitle: string;
}

export function buildProcedureTitleIndex(cwd = process.cwd()): ProcedureIndexItem[] {
  const proceduresDir = path.join(cwd, "content/procedures");
  const files: string[] = [];

  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.isFile() && p.endsWith(".md")) files.push(p);
    }
  }

  if (!fs.existsSync(proceduresDir)) return [];
  walk(proceduresDir);

  return files.map((filePath) => {
    const parsed = matter(fs.readFileSync(filePath, "utf8"));
    const id = typeof parsed.data.id === "string" ? parsed.data.id : path.basename(filePath, ".md");
    const title = typeof parsed.data.title === "string" ? parsed.data.title : id;
    return {
      id,
      title,
      normalizedTitle: normalizeProcedureLookupKey(title),
    };
  });
}

export function resolveProcedureIdsFromSummary(summary: string, index: ProcedureIndexItem[]): string[] {
  const ids = new Set<string>();
  const normalized = normalizeProcedureLookupKey(summary);

  for (const match of summary.matchAll(/\b(\d{3}(?:_[0-9a-z]{1,3})?)\b/gi)) {
    ids.add(match[1]);
  }

  const stableId = resolveStableProcedureId(summary);
  if (stableId) ids.add(stableId);

  const titleMatches = index
    .filter((item) => item.normalizedTitle.length >= 8 && normalized.includes(item.normalizedTitle))
    .slice(0, 5)
    .map((item) => item.id);

  for (const id of titleMatches) ids.add(id);

  return [...ids];
}

export function toOfficialPdfEvents(
  parsed: ParsedOfficialUpdateDocument,
  officialUrl: string,
  effectiveDate: string,
  approvedAt: string,
  index: ProcedureIndexItem[],
): ManualUpdateEvent[] {
  return parsed.entries.map((entry, idx) => ({
    eventId: `official-pdf:${effectiveDate}:${idx}`,
    origin: "official-pdf",
    officialUrl,
    procedureIds: resolveProcedureIdsFromSummary(entry.summary, index),
    changeKind: entry.changeKind,
    summary: entry.summary,
    effectiveDate,
    approvedAt,
    isNewThisWeek: true,
  }));
}

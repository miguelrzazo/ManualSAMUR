import { createPatch } from "diff";
import { assertCodeDatasetIsPlausible } from "./codigos-sync-logic.ts";

export interface ReferenceRecord { [key: string]: unknown; code: string; name: string; category?: string; group?: string }
const clean = (value: string) => value.normalize("NFKC").replace(/\*\*/g, "").replace(/\s+/g, " ").trim().replace(/\.$/, "");

/** pdftotext -raw preserves the document's column reading order and wrapped descriptions. */
export function parsePathologyCodes(text: string): ReferenceRecord[] {
  const rows: ReferenceRecord[] = [];
  let current: ReferenceRecord | undefined;
  let category = "Otros";
  for (const raw of text.normalize("NFKC").replace(/\f/g, "\n").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (/^ICAO\s+/i.test(line)) { category = clean(line.replace(/^ICAO\s+/i, "")); current = undefined; continue; }
    if (/^(?:madrid\.es|Códigos de |SAMUR\s*-|Manual de Procedimientos|Edición|CODIFICACIÓN|psicológica\)|Psiquiátrica\))/i.test(line)) { current = undefined; continue; }
    const match = line.match(/^([A-Z]{1,2})[. ](\d+\.\d+(?:\.\d+)?)\.?\s+(.+)$/);
    if (match) {
      current = { code: `${match[1]}.${match[2]}`, name: clean(match[3]), category };
      if (rows.some((row) => row.code === current!.code)) throw new Error(`Duplicate source code ${current.code}`);
      rows.push(current);
    } else if (current) current.name = clean(`${current.name} ${line}`);
  }
  if (rows.length < 20) throw new Error(`Unrecognized pathology table (${rows.length} rows)`);
  return rows;
}

export function reconcileCodeRecords(before: ReferenceRecord[], imported: ReferenceRecord[]): ReferenceRecord[] {
  assertCodeDatasetIsPlausible(before.length, imported.length);
  const importedIds = new Set(imported.map((row) => row.code.toUpperCase()));
  const missing = before.filter((row) => !importedIds.has(row.code.toUpperCase()));
  assertCodeDatasetIsPlausible(before.length, before.length - missing.length);
  if (importedIds.size !== imported.length) throw new Error("Duplicate imported code IDs");
  const prior = new Map(before.map((row) => [row.code.toUpperCase(), row]));
  return imported.map((row) => {
    const existing = prior.get(row.code.toUpperCase());
    // Keep editorial taxonomy and stable spelling of route identifiers; source owns the definition.
    if (existing && clean(existing.name) === clean(row.name)) return existing;
    return { ...existing, ...row, code: existing?.code ?? row.code, category: existing?.category ?? row.category,
      ...(existing?.description !== undefined ? { description: row.name } : {}) };
  }).sort((a, b) => a.code.localeCompare(b.code, "es", { numeric: true }));
}

export function referenceRecordDiff(id: string, before: unknown, after: unknown): string {
  return createPatch(id, before === undefined ? "" : JSON.stringify(before, null, 2) + "\n", after === undefined ? "" : JSON.stringify(after, null, 2) + "\n", "anterior", "actualizado", { context: 3 });
}

export function diffReferenceDataset(before: Array<Record<string, unknown>>, after: Array<Record<string, unknown>>, kind: string) {
  assertCodeDatasetIsPlausible(before.length, after.length);
  const key = (row: Record<string, unknown>) => String(row.id ?? row.drugId ?? "");
  const prior = new Map(before.map((row) => [key(row), row]));
  const next = new Map(after.map((row) => [key(row), row]));
  if (next.has("") || next.size !== after.length) throw new Error(`Invalid ${kind} record IDs`);
  return [...new Set([...prior.keys(), ...next.keys()])].sort().flatMap((id) => {
    const old = prior.get(id), current = next.get(id);
    if (JSON.stringify(old) === JSON.stringify(current)) return [];
    const changeType = !old ? "created" as const : !current ? "deleted" as const : "updated" as const;
    const changeKind = !old ? "nuevo" as const : !current ? "eliminado" as const : "actualizado" as const;
    const row = current ?? old!;
    const routeKey = `vademecum:${kind}:${id}`;
    return [{ id: routeKey, routeKey, title: String(row.name ?? row.drug ?? row.activeIngredient ?? id), changeType, changeKind, category: "vademecum" as const, diff: referenceRecordDiff(routeKey, old, current) }];
  });
}

export function parseRadioProcedure(content: string): { claves: ReferenceRecord[]; indicativos: ReferenceRecord[]; incidente: ReferenceRecord[] } {
  const result = { claves: [] as ReferenceRecord[], indicativos: [] as ReferenceRecord[], incidente: [] as ReferenceRecord[] };
  let section = "";
  let group = "";
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    const heading = line.match(/^(#{3,5})\s+(.+)$/);
    if (heading) {
      if (heading[1].length === 3) section = clean(heading[2]);
      else group = clean(heading[2]);
      continue;
    }
    if (section === "Indicativos") {
      const match = line.match(/^(?:\*\s+)?\*\*([^*]+)\*\*\s*[:–-]\s*(.+)$/);
      if (match) result.indicativos.push({ code: clean(match[1]), name: clean(match[2]), group });
    } else if (section === "Claves") {
      const match = line.match(/^\*\s+\*\*(?:clave\s+)?([\d.]+|VICTOR|CQ):?\*\*\s*:?\s*(.+)$/i);
      if (match) result.claves.push({ code: clean(match[1]), name: clean(match[2]), category: "Claves" });
    } else if (section === "Códigos de incidentes") {
      const match = line.match(/^\|(\d+(?:\.\d+)+)\|(.+?)(?:\|)?$/);
      if (match) result.incidente.push({ code: match[1], name: clean(match[2]), category: group });
      else if (result.incidente.length && line && !line.startsWith("#")) {
        const last = result.incidente.at(-1)!;
        last.name = clean(`${last.name} ${line.replace(/^\|/, "")}`);
      }
    }
  }
  if (result.claves.length < 25 || result.indicativos.length < 50 || result.incidente.length < 90) throw new Error("Incomplete radio procedure tables");
  return result;
}

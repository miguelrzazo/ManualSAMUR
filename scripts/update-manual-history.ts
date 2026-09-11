import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

interface UpdateEvent {
  eventId: string;
  procedureIds?: string[];
  changeKind?: string;
  approvedAt?: string;
  effectiveDate?: string;
  summary?: string;
  diff?: string;
  category?: string;
  routeKey?: string;
}

interface HistoryEntry {
  id: string;
  procedureId: string;
  procedureTitle: string;
  section: string;
  slug: string;
  changeKind: string;
  changedAt: string;
  summary: string;
  diff?: string;
  category?: string;
  routeKey?: string;
}

const ROOT = process.cwd();
function readJson<T>(filePath: string, fallback: T): T {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function parseFrontmatterIdAndSlug(content: string): { id: string; slug: string; section: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return { id: "", slug: "", section: "" };
  const frontmatter = match[1];
  const value = (key: string) => frontmatter.match(new RegExp(`^${key}:\\s*['"]?(.+?)['"]?\\s*$`, "m"))?.[1] ?? "";
  return { id: value("id"), slug: value("slug"), section: value("section") };
}

function stableHistoryId(event: UpdateEvent, yearMonth: string): string {
  if (event.changeKind === "revisado") {
    return `revisado:${event.procedureIds?.[0] ?? event.eventId}:${yearMonth}`;
  }
  return event.eventId;
}

export function updateManualHistory(root = ROOT): { added: number; total: number } {
  const updatesPath = path.join(root, "content/data/manual-updates.json");
  const historyPath = path.join(root, "content/data/manual-history.json");
  const proceduresPath = path.join(root, "content/procedures");
  if (!fs.existsSync(updatesPath)) return { added: 0, total: 0 };

  const updates = readJson<{ events?: UpdateEvent[] }>(updatesPath, { events: [] });
  const existing = readJson<{ generatedAt?: string; entries?: HistoryEntry[] }>(historyPath, { entries: [] });
  const now = new Date();
  const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const idToSlug = new Map<string, string>();
  const idToSection = new Map<string, string>();

  const walk = (directory: string) => {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(fullPath);
      else if (entry.name.endsWith(".md")) {
        const { id, slug, section } = parseFrontmatterIdAndSlug(fs.readFileSync(fullPath, "utf8"));
        if (id && slug) {
          idToSlug.set(id, slug);
          idToSection.set(id, section);
        }
      }
    }
  };
  walk(proceduresPath);

  const existingEntries = Array.isArray(existing.entries) ? existing.entries : [];
  const existingById = new Map(existingEntries.map((entry) => [entry.id, entry]));
  const newEntries: HistoryEntry[] = [];

  for (const event of updates.events ?? []) {
    // A review without a content diff is synchronization noise, not a user-facing event.
    if (event.changeKind === "revisado" && !event.diff) continue;
    const id = stableHistoryId(event, yearMonth);
    if (existingById.has(id)) continue;
    const procedureId = event.procedureIds?.[0] ?? "";
    const category = event.category ?? "";
    const section = idToSection.get(procedureId)
      ?? (category === "vademecum" ? "Vademécum" : category === "codigo" ? "Códigos" : "");
    newEntries.push({
      id,
      procedureId,
      procedureTitle: event.summary ?? "",
      section,
      slug: idToSlug.get(procedureId) ?? "",
      changeKind: event.changeKind ?? "actualizado",
      changedAt: event.approvedAt || event.effectiveDate || now.toISOString(),
      summary: event.summary ?? "",
      ...(event.diff ? { diff: event.diff } : {}),
      ...(category ? { category } : {}),
      ...(event.routeKey ? { routeKey: event.routeKey } : {}),
    });
  }

  const entries = [...newEntries, ...existingEntries];
  fs.mkdirSync(path.dirname(historyPath), { recursive: true });
  fs.writeFileSync(historyPath, `${JSON.stringify({ generatedAt: now.toISOString(), entries }, null, 2)}\n`, "utf8");
  return { added: newEntries.length, total: entries.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = updateManualHistory();
  console.log(`Added ${result.added} history entries. Total: ${result.total}`);
}

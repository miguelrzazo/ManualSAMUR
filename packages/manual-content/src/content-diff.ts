import type { MobileUpdateEvent, MobileUpdateSectionSummary } from "./schema.ts";

export type ReadableChangeKind = "nuevo" | "revisado" | "actualizado" | "eliminado" | "sync";

export interface ReadableContentChange {
  before: string[];
  after: string[];
}

export type ReadableUpdateCategory = "procedure" | "codigo" | "vademecum";
export type ReadableUpdateScope = "fragmento" | "procedimiento";

export interface ReadableUpdateDestination {
  category: ReadableUpdateCategory;
  procedureId?: string;
  routeKey?: string;
}

export interface ReadableUpdateViewModel {
  category: ReadableUpdateCategory;
  categoryLabel: string;
  changeLabel: string;
  title: string;
  scope: ReadableUpdateScope;
  comparison: ReadableContentChange;
  sections: MobileUpdateSectionSummary[];
  replacementGuidance?: string;
  destination?: ReadableUpdateDestination;
}

/** Keep the event title useful when the feed prefixes it with its change kind. */
export function readableChangeTitle(summary: string): string {
  const separator = summary.indexOf(":");
  return (separator >= 0 ? summary.slice(separator + 1) : summary).trim() || "Cambio en el manual";
}

export function readableChangeKindLabel(kind: ReadableChangeKind | string): string {
  switch (kind) {
    case "nuevo": return "Contenido añadido";
    case "eliminado": return "Contenido retirado";
    case "revisado": return "Contenido revisado";
    case "actualizado": return "Contenido actualizado";
    default: return "Actualización del manual";
  }
}

function readableCategory(category: string | undefined, procedureIds: readonly string[]): ReadableUpdateCategory {
  if (category === "codigo") return "codigo";
  if (category === "vademecum") return "vademecum";
  // Old procedure events predate the explicit category; their procedure ids are
  // the safe compatibility signal.
  if (category === "procedure" || procedureIds.length > 0 || !category) return "procedure";
  return "procedure";
}

function categoryLabel(category: ReadableUpdateCategory): string {
  if (category === "codigo") return "Código";
  if (category === "vademecum") return "Vademécum";
  return "Procedimiento";
}

function cleanSection(value: unknown): MobileUpdateSectionSummary | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const section = value as Record<string, unknown>;
  const title = typeof section.title === "string"
    ? section.title.trim()
    : typeof section.heading === "string" ? section.heading.trim() : "";
  const body = typeof section.body === "string"
    ? section.body.trim()
    : typeof section.summary === "string" ? section.summary.trim() : "";
  return title && body ? { title, body } : undefined;
}

function readableSections(event: MobileUpdateEvent): MobileUpdateSectionSummary[] {
  const values = Array.isArray(event.sections) ? event.sections : event.sectionSummaries;
  if (!Array.isArray(values)) return [];
  return values.map(cleanSection).filter((section): section is MobileUpdateSectionSummary => Boolean(section));
}

/**
 * One event-to-reader adapter for web-compatible update semantics. Consumers
 * receive category routing, readable comparison fragments, and complete
 * procedure sections without inspecting diff syntax or publisher quirks.
 */
export function readableUpdateViewModel(event: MobileUpdateEvent): ReadableUpdateViewModel {
  const category = readableCategory(event.category, event.procedureIds);
  const sections = readableSections(event);
  const completeProcedure = category === "procedure"
    && (event.scope === "procedimiento" || event.changeKind === "nuevo" || event.changeKind === "eliminado");
  const destination: ReadableUpdateDestination | undefined = category === "procedure"
    ? event.procedureIds[0] ? { category, procedureId: event.procedureIds[0] } : undefined
    : event.routeKey ? { category, routeKey: event.routeKey } : undefined;
  return {
    category,
    categoryLabel: categoryLabel(category),
    changeLabel: readableChangeKindLabel(event.changeKind),
    title: readableChangeTitle(event.summary),
    scope: completeProcedure ? "procedimiento" : "fragmento",
    comparison: readableContentChange(event.diff),
    sections,
    replacementGuidance: typeof event.replacementGuidance === "string" && event.replacementGuidance.trim()
      ? event.replacementGuidance.trim()
      : undefined,
    destination,
  };
}

function cleanChangedLine(value: string): string {
  return value
    .replace(/\(\(\(|\)\)\)/g, "")
    .replace(/\/\/([\s\S]*?)\/\//g, "$1")
    .replace(/\*\*|__|~~/g, "")
    .replace(/^#{1,6}\s*/, "")
    .replace(/^\s*\*\s+/, "• ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Converts the source-control-shaped payload into the two fragments the UI needs.
 * Headers, hunk markers and unchanged context are intentionally discarded here so
 * no consumer can accidentally reintroduce a technical diff into the reader UI.
 */
export function readableContentChange(diff: unknown): ReadableContentChange {
  const before: string[] = [];
  const after: string[] = [];
  for (const rawLine of typeof diff === "string" ? diff.split(/\r?\n/) : []) {
    if (rawLine.startsWith("@@")) {
      if (before.length > 0 && before.at(-1) !== "…") before.push("…");
      if (after.length > 0 && after.at(-1) !== "…") after.push("…");
      continue;
    }
    if (rawLine.startsWith("-") && !rawLine.startsWith("---")) {
      const line = cleanChangedLine(rawLine.slice(1));
      if (line) before.push(line);
    } else if (rawLine.startsWith("+") && !rawLine.startsWith("+++")) {
      const line = cleanChangedLine(rawLine.slice(1));
      if (line) after.push(line);
    }
  }
  return { before, after };
}

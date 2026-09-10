export type ReadableChangeKind = "nuevo" | "revisado" | "actualizado" | "eliminado" | "sync";

export interface ReadableContentChange {
  before: string[];
  after: string[];
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

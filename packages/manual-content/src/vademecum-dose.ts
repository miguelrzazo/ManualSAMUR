/**
 * Presentation model for medication dose text.
 *
 * The source corpus still stores dose content as plain text. This parser only
 * recognizes explicit audience headings; it never infers an audience from a
 * number, unit, or clinical phrase. Text that cannot be assigned safely stays in
 * a General section and remains in source order.
 */

export type MedicationDoseAudience =
  | "general"
  | "adultos"
  | "ninos"
  | "lactantes"
  | "adolescentes";

export interface MedicationDoseLine {
  text: string;
  bullet: boolean;
}

export interface MedicationDoseSection {
  audience: MedicationDoseAudience;
  label: string;
  /** The source heading, when it contains extra clinical context. */
  sourceHeading?: string;
  lines: MedicationDoseLine[];
}

const AUDIENCE_TERMS: Array<{ audience: Exclude<MedicationDoseAudience, "general">; pattern: RegExp; label: string }> = [
  { audience: "adultos", pattern: /\badult(?:o|os|a|as)\b/i, label: "Adultos" },
  { audience: "ninos", pattern: /\bniñ(?:o|os|a|as)\b|\bnin(?:o|os|a|as)\b/i, label: "Niños" },
  { audience: "lactantes", pattern: /\blactantes?\b/i, label: "Lactantes" },
  { audience: "adolescentes", pattern: /\badolescentes?\b/i, label: "Adolescentes" },
];

function normalizeDoseLine(value: string): string {
  return value.replace(/[\u00a0\u202f]/g, " ").trim();
}

function parseAudienceHeading(value: string): { audience: MedicationDoseAudience; label: string; sourceHeading: string; inlineText?: string; bullet: boolean } | undefined {
  const withoutMarker = value.replace(/^[-*•]\s*/, "");
  const match = /^(.*?):\s*(.*?)\s*$/.exec(withoutMarker);
  if (!match) return undefined;
  const sourceHeading = match[1].trim();
  const inlineText = match[2].trim();
  const matches = AUDIENCE_TERMS.filter((term) => term.pattern.test(sourceHeading));
  if (matches.length === 0) return undefined;
  if (matches.length > 1) return { audience: "general", label: "General", sourceHeading, inlineText: inlineText || undefined, bullet: /^[-*•]\s+/.test(value) };
  return { ...matches[0], sourceHeading, inlineText: inlineText || undefined, bullet: /^[-*•]\s+/.test(value) };
}

export function parseMedicationDose(value: unknown): MedicationDoseSection[] {
  if (typeof value !== "string") return [];

  const sections: MedicationDoseSection[] = [];
  let current: MedicationDoseSection = { audience: "general", label: "General", lines: [] };

  const pushCurrent = () => {
    if (current.lines.length > 0 || sections.length === 0) sections.push(current);
  };

  for (const rawLine of value.split(/\r?\n/)) {
    const line = normalizeDoseLine(rawLine);
    if (!line) continue;

    const heading = parseAudienceHeading(line);
    if (heading) {
      pushCurrent();
      current = {
        audience: heading.audience,
        label: heading.label,
        sourceHeading: heading.sourceHeading,
        lines: [],
      };
      if (heading.inlineText) current.lines.push({ text: heading.inlineText, bullet: heading.bullet });
      continue;
    }

    const bullet = /^[-*•]\s+/.test(line);
    current.lines.push({ text: bullet ? line.replace(/^[-*•]\s+/, "") : line, bullet });
  }

  pushCurrent();
  return sections.filter((section) => section.lines.length > 0);
}

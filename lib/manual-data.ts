const MARKDOWN_LINK_RE = /\[[^\]]+\]\(([^)]+)\)/g;
const PROCEDURE_LINK_RE = /(?:^|\/)([0-9][^./]*|[A-Z]{1,3}[^./]*)\.htm(?:$|[#?])/i;
const LEGACY_IMAGE_LINE_RE = /^\s*!\[[^\]]*]\(\.\.\/images\/(?:print|trans|logo)\.gif\)\s*$/gim;
const LEGACY_PRINT_LINK_RE = /\(javascript:[^)]+\)/gi;
const LEGACY_PRINT_GIF_RE = /^\s*\[!\[[^\n]*print\.gif[^\n]*\]\s*$/gim;
const FOOTER_RE = /^\s*Manual de Procedimientos SAMUR-Protección Civil.*$/gim;
const VADEMECUM_PLACEHOLDER_LINK_RE = /\[([^\]]+)]\(#(?:\s+"[^"]*")?\)/g;
const LOCAL_MARKDOWN_LINK_RE = /\[([^\]]+)]\(([^)\s]+\.htm)(?:\s+"[^"]*")?\)/gi;

export function deriveRelatedIds(content: string, validIds: Set<string>): string[] {
  const related = new Set<string>();

  for (const match of content.matchAll(MARKDOWN_LINK_RE)) {
    const href = match[1];
    const idMatch = href.match(PROCEDURE_LINK_RE);
    const id = idMatch?.[1];
    if (id && validIds.has(id)) {
      related.add(id);
    }
  }

  return [...related];
}

export function normalizeProcedureContent(
  content: string,
  idToSlug = new Map<string, string>(),
): string {
  return content
    .replace(/\r\n/g, "\n")
    .replace(LEGACY_PRINT_LINK_RE, "")
    .replace(LEGACY_PRINT_GIF_RE, "")
    .replace(LEGACY_IMAGE_LINE_RE, "")
    .replace(FOOTER_RE, "")
    .replace(VADEMECUM_PLACEHOLDER_LINK_RE, "$1")
    .replace(LOCAL_MARKDOWN_LINK_RE, (_, label: string, href: string) => {
      const id = href.match(PROCEDURE_LINK_RE)?.[1];
      if (!id) return label;

      const slug = idToSlug.get(id);
      if (!slug) return label;

      return `[${label}](/manual/${slug})`;
    })
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export interface ProcedureSidebarMeta {
  group: string;
  subgroup: string;
}

export function getProcedureSidebarMeta(
  section: string,
  id: string,
  title: string,
): ProcedureSidebarMeta {
  const normalizedTitle = title.toLowerCase();

  switch (section) {
    case "Administrativos":
      return { group: "Procedimientos generales", subgroup: "Servicio y dotación" };
    case "Comunicaciones":
      if (id.startsWith("125_")) {
        if (id === "125_03" || id === "125_04") {
          return {
            group: "Recomendaciones específicas",
            subgroup: "Patologías tiempo-dependientes",
          };
        }

        return {
          group: "Recomendaciones específicas",
          subgroup: "Soporte telefónico específico",
        };
      }

      return { group: "Procedimientos generales", subgroup: "Central de comunicaciones" };
    case "Operativos":
      if (/^217_/i.test(id)) {
        return { group: "Coordinación interservicios", subgroup: "Otros servicios" };
      }

      if (/^216/i.test(id)) {
        return {
          group: "Riesgo biológico e infeccioso",
          subgroup:
            normalizedTitle.includes("ébola") || /216[cd]/i.test(id)
              ? "Patógenos de alto riesgo"
              : "Exposiciones biológicas",
        };
      }

      return { group: "Actuación operativa", subgroup: "Incidentes y coordinación" };
    case "SVA":
      if (id === "301" || id === "302") {
        return { group: "Reanimación y vía aérea", subgroup: "Críticos" };
      }
      if (id === "303") {
        return { group: "Analgesia y sedación", subgroup: "Control sintomático" };
      }
      if (normalizedTitle.includes("psiqu")) {
        return { group: "Urgencias específicas", subgroup: "Psiquiatría" };
      }
      return { group: "Urgencias específicas", subgroup: "Patología crítica" };
    case "SVB":
      if (["401", "402", "403", "404", "405", "406"].includes(id)) {
        return { group: "Valoración y soporte vital", subgroup: "Secuencia básica" };
      }
      return { group: "Patologías prevalentes", subgroup: "Motivos de asistencia" };
    case "Psicológicos":
      return { group: "Intervención psicológica", subgroup: "Activación de guardia" };
    case "Técnicas":
      return { group: "Técnicas asistenciales", subgroup: "Procedimientos" };
    default:
      return { group: "General", subgroup: "Procedimientos" };
  }
}

export function buildBacklinks(
  procedures: Array<{ id: string; related: string[] }>,
): Record<string, string[]> {
  const backlinks: Record<string, Set<string>> = {};

  for (const procedure of procedures) {
    backlinks[procedure.id] ??= new Set<string>();
  }

  for (const procedure of procedures) {
    for (const relatedId of procedure.related) {
      backlinks[relatedId] ??= new Set<string>();
      backlinks[relatedId].add(procedure.id);
    }
  }

  return Object.fromEntries(
    Object.entries(backlinks).map(([id, ids]) => [id, [...ids].sort((a, b) => a.localeCompare(b, "es", { numeric: true }))]),
  );
}

export function extractCodeFamily(code: string): string {
  const alpha = code.match(/^([A-Z]+)/);
  if (alpha) return alpha[1];

  const numeric = code.match(/^(\d+)/);
  if (numeric) return numeric[1];

  return code;
}

export function normalizeCookieIds(
  raw: string | undefined,
  validIds: Set<string>,
  limit: number,
): string[] {
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const ids: string[] = [];
    const seen = new Set<string>();

    for (const value of parsed) {
      if (typeof value !== "string") continue;
      if (!validIds.has(value) || seen.has(value)) continue;
      seen.add(value);
      ids.push(value);
      if (ids.length >= limit) break;
    }

    return ids;
  } catch {
    return [];
  }
}

export function stripMarkdownToText(content: string): string {
  return content
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]+`/g, " ")
    .replace(/!\[[^\]]*]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/^#+\s+/gm, "")
    .replace(/[*_>~-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildAutoSynonyms(id: string, title: string): string[] {
  const normalizedTitle = title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();

  const synonyms = new Set<string>([id, normalizedTitle]);

  if (normalizedTitle.includes("Código")) {
    synonyms.add(normalizedTitle.replace("Código", "Codigo"));
  }

  if (normalizedTitle.includes("PCR")) {
    synonyms.add("parada cardiorrespiratoria");
    synonyms.add("rcp");
  }

  if (normalizedTitle.toLowerCase().includes("ictus")) {
    synonyms.add("acv");
    synonyms.add("codigo 13");
  }

  return [...synonyms];
}

export function buildAutoTags(section: string, title: string, content: string): string[] {
  const tags = new Set<string>([section]);
  const haystack = `${title}\n${content}`.toLowerCase();

  const candidates: Array<[string, string]> = [
    ["PCR", "pcr"],
    ["Ictus", "ictus"],
    ["Trauma", "politrauma"],
    ["Trauma", "trauma"],
    ["Cardiología", "coron"],
    ["Convulsiones", "convuls"],
    ["Psiquiatría", "psiqui"],
    ["Intubación", "intub"],
    ["Vía aérea", "via aerea"],
    ["Hemorragia", "hemorrag"],
    ["Sepsis", "sepsis"],
  ];

  for (const [tag, pattern] of candidates) {
    if (haystack.includes(pattern)) {
      tags.add(tag);
    }
  }

  return [...tags];
}

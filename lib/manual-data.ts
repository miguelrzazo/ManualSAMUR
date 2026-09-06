import type { AttachmentKind, ManualAttachment } from "./manual-sync.ts";

const MARKDOWN_LINK_RE = /\[[^\]]+\]\(([^)]+)\)/g;
const PROCEDURE_LINK_RE = /(?:^|\/)([0-9][^./]*|[A-Z]{1,3}[^./]*)\.htm(?:$|[#?])/i;
const BARE_PROCEDURE_LINK_RE = /(?:^|[\s(])(?:https?:\/\/[^\s)]+\/)?([0-9][A-Za-z0-9_]{1,12})\.htm(?:$|[#?\s)])/gim;
const LEGACY_PRINT_BUTTON_RE = /^.*!\[[^\]]*\]\([^)]*print\.gif[^)]*\).*$/gim;
const LEGACY_IMAGE_LINE_RE = /^\s*!\[[^\]]*]\(((?:\.\.\/|\.\/)?images\/[^)]+)\)\s*$/gim;
const STANDALONE_BANG_RE = /^!\s*$/gm;
/**
 * XWiki's own image macro, `image:<src>||attr="…" attr="…"`, which the scrape leaves
 * verbatim when the source used it outside a link. A real `/images/...` path becomes a
 * markdown image (alt text recovered from the options); a base64 spacer GIF is layout
 * padding with nothing to show, so it is dropped.
 */
const XWIKI_IMAGE_MACRO_RE = /^\s*image:(\S+?)(?:\|\|(.*))?$/gim;
const ÚLTIMA_MODIFICACIÓN_RE = /^\*\*Última modificación[^\n*]*\*\*\s*\.?\s*$/gim;
const PRINT_EMOJI_RE = /^🖨️?\s*Imprimir\s+esta\s+página\s*$/gim;
const CONTENIDO_STANDALONE_RE = /^Contenido\s*$/gm;
const IMAGE_IN_LINK_RE = /\[!\[[^\]]*\]\([^)]+\)\s*([^\]]*)\]\(([^)]+)\)/g;
const FOOTER_RE = /^\s*Manual de Procedimientos SAMUR-Protección Civil.*$/gim;
const VADEMECUM_PLACEHOLDER_LINK_RE = /\[([^\]]+)]\(#(?:\s+"[^"]*")?\)/g;
const LOCAL_MARKDOWN_LINK_RE = /\[([^\]]+)]\(([^)\s]+\.htm(?:[#?][^)\s]*)?)(?:\s+"[^"]*")?\)/gi;
const START_PAGE_RE = /^\s*Inicio página>>doc:\s*$/gim;
const XWIKI_EXTERNAL_LINK_RE = /\[\[([^\]]*?)>>(?:url:)?(https?:\/\/[^\]]+)\]\]/gi;
const XWIKI_TILDE_ESCAPE_RE = /~\[~\[[\s\S]*?~\]~\]/g;
const XWIKI_BACKSLASH_LINE_RE = /^\\~/gm;
const FIGURE_ARROW_LINK_RE = /^\*([^*\n]+)>>((?:\/docs|\/images)[^*\n]+)\*\s*$/gm;
const SIMPLE_ARROW_LINK_RE = /^([^\n\[]+?)>>((?:\/docs|\/images)[^\]\s)]+)(?:\]\([^)]+\))?/gm;
const DRUG_LINK_RE = /<DrugLink\s+name="([^"]+)"\s*\/>/g;
const PROTECTED_LINK_TOKEN_RE = /__MDLINK_(\d+)__/g;
const INTERNAL_MANUAL_LINK_RE = /\[[^\]]+\]\(\/manual\/([^)\s#?]+)(?:#[^)]+)?\)/g;
const MARKDOWN_LINK_WITH_TITLE_RE = /\[([^\]]+)\]\(([^)\s]+)(\s+"[^"]*")?\)/g;

const TECHNIQUE_PATTERNS: Array<[string, RegExp]> = [
  ["Intubación endotraqueal", /\bintubacion endotraqueal\b/i],
  ["Vía intraósea", /\bvia intraosea\b/i],
  ["Exploración ecográfica", /\bexploracion ecografica\b/i],
  ["Toracocentesis", /\btoracocentesis\b/i],
  ["Pericardiocentesis", /\bpericardiocentesis\b/i],
  ["Toracotomía de reanimación", /\btoracotomia de reanimacion\b/i],
];

export type ProcedureEditorialBlockType =
  | "summary"
  | "warning"
  | "checklist"
  | "diagram"
  | "cheatsheet"
  | "attachment-group"
  | "image-gallery"
  | "cited-drugs"
  | "cited-techniques"
  | "related-links"
  | "editorial-note";

export interface ProcedureEditorialAsset {
  src: string;
  kind?: AttachmentKind | "mermaid";
  title?: string;
  alt?: string;
  caption?: string;
}

export interface ProcedureEditorialItem {
  id?: string;
  title?: string;
  description?: string;
  href?: string;
  localPath?: string;
  kind?: AttachmentKind;
  label?: string;
}

export interface ProcedureEditorialBlock {
  id: string;
  type: ProcedureEditorialBlockType;
  targetHeading: string;
  placement: "before" | "after";
  title?: string;
  label?: string;
  content?: string;
  items?: string[] | ProcedureEditorialItem[];
  assets?: ProcedureEditorialAsset[];
}

export interface ProcedureContentSection {
  key: string;
  anchor: string | null;
  heading: string | null;
  level: number;
  content: string;
}

export interface ProcedureEditorialBlockBucket {
  before: ProcedureEditorialBlock[];
  after: ProcedureEditorialBlock[];
}

export interface GroupedProcedureEditorialBlocks {
  bySection: Record<string, ProcedureEditorialBlockBucket>;
  afterAll: ProcedureEditorialBlock[];
  unresolvedIds: string[];
}

export interface ProcedureContentNormalizationOptions {
  currentProcedureId?: string;
  procedureTitle?: string;
  resolveDrugHref?: (reference: string) => string | null;
  resolveInternalHref?: (href: string) => string | null;
}

export type ProcedureRelationDirection = "outgoing" | "incoming";
export type ProcedureRelationKind = "editorial" | "content-link" | "safe-mention" | "suggested";
export type ProcedureRelationStrength = "strong" | "medium";

export interface ProcedureRelation {
  id: string;
  direction: ProcedureRelationDirection;
  kind: ProcedureRelationKind;
  strength: ProcedureRelationStrength;
}

export interface ProcedureRelationCandidate {
  id: string;
  section: string;
  sidebarGroup: string;
  sidebarSubgroup: string;
  related: string[];
  backlinks: string[];
}

export interface ProcedureRelationAuditEntry {
  id: string;
  title: string;
  related: string[];
  backlinks: string[];
  relations: ProcedureRelation[];
}

export interface ProcedureRelationAudit {
  withoutOutgoing: string[];
  withoutBacklinks: string[];
  suggestedPending: Array<{ id: string; title: string; suggestedIds: string[] }>;
}

export interface TableOfContentsHeading {
  id: string;
  text: string;
  level: number;
}

function xwikiCellDepth(line: string): number {
  return (line.match(/\(\(\(/g)?.length ?? 0) - (line.match(/\)\)\)/g)?.length ?? 0);
}

function normalizeXWikiTables(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    if (!lines[i].startsWith("|")) {
      out.push(lines[i++]);
      continue;
    }

    const rows: string[] = [];

    while (i < lines.length && lines[i].startsWith("|")) {
      let row = lines[i++];
      let depth = xwikiCellDepth(row);
      let contCount = 0;
      const pipeCount = () => (row.match(/\|/g)?.length ?? 0);

      while (i < lines.length) {
        if (contCount >= 14) break;

        const next = lines[i];
        const trimmed = next.trim();

        // XWiki occasionally leaves a cell wrapper unclosed. Once a row has
        // multiple cells, a fresh pipe-prefixed line is still unambiguously a
        // new row even when the previous row's wrapper is malformed.
        if (next.startsWith("|") && (depth === 0 || pipeCount() > 1)) break;

        // A malformed final multiline cell must not swallow the paragraph or
        // list that follows the table.
        if (/^Inicio página>>/.test(trimmed)) break;

        if (depth === 0 && /^(?:[*-] |#{1,6} )/.test(trimmed)) break;

        // A blank line can occur inside a well-formed multiline cell. Consume
        // it only when a closing wrapper is still ahead; this also prevents an
        // unclosed final cell from swallowing the footer or later paragraphs.
        if (trimmed.length === 0) {
          const closingWrapperAhead = lines
            .slice(i + 1, i + 15)
            .some((candidate) => candidate.includes(")))"));
          if (depth === 0 || !closingWrapperAhead) break;
        }

        // Row is already syntactically complete (ends with |) and depth = 0
        if (depth === 0 && row.trimEnd().endsWith("|")) break;

        i++;
        contCount++;

        const opens = (trimmed.match(/\(\(\(/g)?.length ?? 0);
        const closes = (trimmed.match(/\)\)\)/g)?.length ?? 0);
        depth += opens - closes;

        const clean = trimmed.replace(/\(\(\(/g, "").replace(/\)\)\)/g, "").trim();
        if (clean) {
          const isListItem = /^[*-]\s+/.test(clean);
          const continuation = isListItem ? clean.replace(/^[*-]\s+/, "• ") : clean;
          row = row.trimEnd() + (clean === "|" ? clean : isListItem ? `<br />${continuation}` : " " + continuation);
        }
      }

      row = row.replace(/\(\(\(/g, "").replace(/\)\)\)/g, "").trim();
      if (row) rows.push(row);
    }

    if (rows.length === 0) continue;

    const parsed = rows.map(row => {
      let r = row.startsWith("|") ? row.slice(1) : row;
      if (r.endsWith("|")) r = r.slice(0, -1);
      return r.split("|").map(c => c.trim());
    });

    // One upstream table loses the line break and closing delimiter between
    // its header and its first data row. Reconstruct the intended two-column
    // Wells-risk table before applying the generic padding rules.
    if (
      parsed.length >= 3
      && parsed[0].length === 3
      && parsed.slice(1).every((row) => row.length <= 2)
      && /^\*\*?Escala\s*\(puntos\)/i.test(parsed[0][0])
      && /probabilidad de mortalidad intrahospitalaria/i.test(parsed[0][1])
      && /^Bajo riesgo/i.test(parsed[0][2])
    ) {
      const firstRisk = parsed[0][2] ?? "";
      const header = parsed[0][1]
        .replace(/\s*~?≤\s*108\s*$/, "")
        .trim();
      parsed[0] = [
        parsed[0][0],
        header.startsWith("**") && !header.endsWith("**") ? `${header}**` : header,
      ];
      parsed.splice(1, 0, ["≤ 108", firstRisk]);
    }

    // Title rows: single-cell rows at the start
    let firstData = 0;
    while (firstData < parsed.length && parsed[firstData].length === 1) firstData++;

    for (let j = 0; j < firstData; j++) {
      const t = parsed[j][0].replace(/\*\*\s+/g, "**").replace(/\s+\*\*/g, "**");
      out.push(t.startsWith("**") ? t : `**${t}**`, "");
    }

    const dataRows = parsed.slice(firstData);
    if (dataRows.length === 0) continue;

    // A final single-cell row is often a malformed multiline note (for
    // example the Wells probability thresholds). Keep it readable outside the
    // table instead of padding it into a misleading row.
    const trailingText: string[] = [];
    while (dataRows.length > 1 && dataRows.at(-1)?.length === 1) {
      trailingText.unshift(dataRows.pop()?.[0] ?? "");
    }

    const colCount = Math.max(...dataRows.map(r => r.length), 1);
    const pad = (row: string[]) => {
      const r = [...row];
      while (r.length < colCount) r.push("");
      return r;
    };

    out.push("| " + pad(dataRows[0]).join(" | ") + " |");
    out.push("| " + Array(colCount).fill("---").join(" | ") + " |");
    for (const row of dataRows.slice(1)) {
      out.push("| " + pad(row).join(" | ") + " |");
    }
    if (trailingText.length > 0) out.push(trailingText.join(" "));
    out.push("");
  }

  return out.join("\n");
}

function normalizeStandaloneBoldHeadings(text: string): string {
  return text.replace(/^(\s*)\*\*([^*\n]+?)\*\*\s*:?\s*$/gm, (match, indent: string, rawHeading: string) => {
    const heading = rawHeading.trim().replace(/:\s*$/, "");
    if (
      !heading
      || heading.length > 140
      || /[.!]$/.test(heading)
      || /^[*-]\s/.test(heading)
      || /<[^>]+>/.test(heading)
    ) {
      return match;
    }

    return `${indent}### ${heading}`;
  });
}

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

  for (const match of content.matchAll(BARE_PROCEDURE_LINK_RE)) {
    const id = match[1];
    if (id && validIds.has(id)) {
      related.add(id);
    }
  }

  return [...related];
}

function resolveRelativeUrl(href: string, sourceUrl?: string): string {
  if (!href.startsWith("../") && !href.startsWith("./")) return href;
  if (!sourceUrl) return href;
  try { return new URL(href, sourceUrl).href; } catch { return href; }
}

function stripInlineMarkdown(text: string): string {
  return text
    .replace(/!\[[^\]]*]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/[*_`~]/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePlainText(text: string): string {
  return stripInlineMarkdown(text)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function cleanupLegacyLinkLabel(label: string): string {
  return stripInlineMarkdown(
    label
      .replace(/\[\[~\[~\[!\[[^\]]*]\([^)]+\)[\s\S]*?~]\~]/g, " ")
      .replace(/!\[[^\]]*]\([^)]+\)/g, " ")
      .replace(/\[\[|\]\]|~|\|/g, " "),
  );
}

export function slugifyProcedureHeading(heading: string): string {
  return normalizePlainText(heading)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function rewriteLegacyArrowLinks(content: string): string {
  return content
    .replace(FIGURE_ARROW_LINK_RE, (_match, label: string) => `*${cleanupLegacyLinkLabel(label)}*`)
    .replace(SIMPLE_ARROW_LINK_RE, (_match, label: string, href: string) => {
      const cleanLabel = cleanupLegacyLinkLabel(label);
      return cleanLabel ? `[${cleanLabel}](${href})` : href;
    });
}

const SAFE_CODE_LINKS: Array<{ pattern: RegExp; procedureId: string }> = [
  { pattern: /(^|[^\[])(C[oó]digo\s+13\.1)(?![\d])/gi, procedureId: "214" },
  { pattern: /(^|[^\[])(C[oó]digo\s+13)(?![.\d])/gi, procedureId: "214" },
  { pattern: /(^|[^\[])(C[oó]digo\s+16\.1)(?![\d])/gi, procedureId: "213a" },
  { pattern: /(^|[^\[])(C[oó]digo\s+16\.2)(?![\d])/gi, procedureId: "213a" },
  { pattern: /(^|[^\[])(C[oó]digo\s+16\.3)(?![\d])/gi, procedureId: "213a" },
  { pattern: /(^|[^\[])(C[oó]digo\s+16)(?![.\d])/gi, procedureId: "213a" },
  { pattern: /(^|[^\[])(C[oó]digo\s+19\.1)(?![\d])/gi, procedureId: "214e" },
  { pattern: /(^|[^\[])(C[oó]digo\s+19\.2)(?![\d])/gi, procedureId: "214e" },
  { pattern: /(^|[^\[])(C[oó]digo\s+19)(?![.\d])/gi, procedureId: "214e" },
  { pattern: /(^|[^\[])(C[oó]digo\s+100)(?![.\d])/gi, procedureId: "214d" },
  { pattern: /(^|[^\[])(C[oó]digo\s+infarto)\b/gi, procedureId: "213" },
  { pattern: /(^|[^\[])(C[oó]digo\s+TEP)\b/gi, procedureId: "214e" },
];

const PROCEDURE_KEYWORD_LINKS: Array<{ patterns: RegExp[]; id: string; anchor?: string }> = [
  { patterns: [/\bvías? venosas? periféricas?\b/gi, /\bvías? periféricas?\b/gi], id: "604_02" },
  { patterns: [/\bvías? venosas? centrales?\b/gi, /\bvías? centrales?\b/gi], id: "604_04" },
  { patterns: [/\bvías? intraóseas?\b/gi], id: "604_05b" },
  { patterns: [/\banalítica venosa\b/gi, /\banalítica sanguínea\b/gi, /\banalítica arterial\b/gi], id: "604_09" },
  { patterns: [/\bmedición de (?:la )?glucemia\b/gi, /\bglucemia capilar\b/gi], id: "604_10" },
  { patterns: [/\bintubación endotraqueal\b/gi, /\bintubacion endotraqueal\b/gi], id: "602_03" },
  { patterns: [/\bdesfibrilación\b/gi, /\bdesfibrilar\b/gi], id: "603_02" },
  { patterns: [/\bECG de 12 derivaciones\b/g, /\belectrocardiograma de 12 derivaciones\b/gi], id: "603_01" },
  { patterns: [/\bvía intravenosa\b/gi], id: "604_03" },
  { patterns: [/\bpulsioximetría\b/gi], id: "602_09" },
  { patterns: [/\bEscala de Wells\b/g], id: "214e", anchor: "escala-de-wells" },
  { patterns: [/\bEscala de Glasgow\b/gi], id: "301a", anchor: "escala-de-glasgow" },
];

const PROCEDURE_MENTION_LINKS: Array<{ patterns: RegExp[]; id: string }> = [
  // SVA - PCR / RCP
  { patterns: [
    /\bver procedimiento (?:de )?PCR adulto/gi,
  ], id: "301" },
  { patterns: [
    /\bver procedimiento (?:de )?PCR(?! pediatric)/gi,
  ], id: "301" },

  // SVA - Shock
  { patterns: [
    /\bver procedimiento (?:de )?shock/gi,
  ], id: "309_01" },

  // SVA - Intoxicaciones
  { patterns: [
    /\bver procedimiento (?:de )?intoxicaciones/gi,
    /\bver procedimiento (?:de )?intoxicación por humos?/gi,
  ], id: "315_03" },
  { patterns: [
    /\bver procedimiento:? Paciente intoxicado por humo/gi,
    /\bver procedimiento de Paciente intoxicado por humo/gi,
  ], id: "315_02" },

  // SVA - Analgesia y sedación
  { patterns: [
    /\bver procedimiento (?:de )?analgesia y sedación/gi,
  ], id: "303" },

  // SVA - Vía aérea
  { patterns: [
    /\bver procedimiento 'Manejo avanzado de vía aérea'/gi,
    /\bver procedimiento de manejo de (?:la )?vía aérea/gi,
    /\bver procedimiento asistencial de manejo de la vía aérea/gi,
  ], id: "302" },
  { patterns: [
    /\bver procedimiento Manejo de la vía aérea difícil/gi,
  ], id: "302a" },

  // SVA - Ictus
  { patterns: [
    /\bver procedimiento (?:de )?ICTUS/gi,
  ], id: "306_02" },

  // SVA - Calor / hipotermia
  { patterns: [
    /\bver procedimiento (?:de )?golpe de calor/gi,
  ], id: "313_02" },
  { patterns: [
    /\bver procedimiento (?:de )?hipotermia/gi,
  ], id: "313_03" },

  // SVA - Anafilaxia
  { patterns: [
    /\bVer procedimiento de Anafilaxia/g,
  ], id: "316" },

  // SVA - Urgencias psiquiátricas
  { patterns: [
    /\bver procedimiento SVA 'urgencias psiquiátricas'/gi,
    /\bver procedimiento (?:de )?urgencias?\s+psiquiátric[ao]/gi,
  ], id: "311" },

  // SVA - Complicaciones diabéticas / hipoglucemia
  { patterns: [
    /\bver procedimiento (?:de )?complicaciones diabéticas/gi,
    /\bver procedimiento (?:de )?hipoglucemia/gi,
  ], id: "312_01" },

  // SVA - Traumatismos
  { patterns: [
    /\bver procedimiento traumatismos ortopédicos/gi,
  ], id: "304_06" },
  { patterns: [
    /\bVer procedimiento de Traumatismo Vertebral\. Manejo de shock neurogénico/g,
  ], id: "304_05" },
  { patterns: [
    /\bver procedimiento (?:de )?urgencias traumáticas/gi,
  ], id: "304_01" },

  // SVA - Urgencias pediátricas
  { patterns: [
    /\bver procedimiento (?:de )?urgencias pediátricas/gi,
  ], id: "314_00" },

  // SVA - Quemado
  { patterns: [
    /\bver procedimiento: 'paciente quemado'/gi,
  ], id: "313_01" },

  // SVA - Crisis comiciales → crisis epiléptico
  { patterns: [
    /\bver procedimiento crisis comiciales/gi,
  ], id: "306_03" },

  // SVA / Técnicas - Electrocución
  { patterns: [
    /\bVer procedimiento asistencial de electrocución\.?/gi,
  ], id: "313_04" },

  // SVA / Técnicas - Marcapasos
  { patterns: [
    /\bver procedimiento (?:de )?marcapasos transcutaneo/gi,
  ], id: "603_04" },

  // SVA - Tromboembolismo pulmonar
  { patterns: [
    /\bver procedimientos? de Tromboembolismo pulmonar/gi,
    /\bver procedimientos? de TEP\b/gi,
  ], id: "310_03" },

  // SVA - Arritmias
  { patterns: [
    /\bver procedimientos? de arritmia/gi,
  ], id: "309_04" },

  // SVA - IAM / SCACEST / SCASEST
  { patterns: [
    /\bver procedimientos? de IAM\b/gi,
  ], id: "309_02" },

  // SVA - Urgencias obstétricas
  { patterns: [
    /\bver procedimiento (?:en )?\u00a0?Urgencias obstétricas\b/gi,
  ], id: "308_01" },

  // SVA - Crisis hipertensivas
  { patterns: [
    /\bver procedimiento de Urgencias cardiovasculares: Crisis hipertensivas/gi,
  ], id: "309_05" },

  // SVB - Valoración del paciente
  { patterns: [
    /\bver procedimiento SVB 'Valoración del paciente'/gi,
  ], id: "402" },
  { patterns: [
    /\bVer procedimiento SVB Valoración del paciente adulto/gi,
  ], id: "402" },

  // SVB - Instrumental en adultos
  { patterns: [
    /\bver procedimiento SVB 'Instrumental en adultos'/gi,
    /\bver procedimiento de SVB Instrumental en adultos/gi,
  ], id: "403" },

  // SVB - Valoración de la escena
  { patterns: [
    /\bver procedimiento SVB 'valoración de la escena'/gi,
    /\bver procedimiento Valoración de la escena/gi,
  ], id: "401" },

  // SVB - Signos vitales
  { patterns: [
    /\bver procedimiento técnico 'Signos Vitales'/gi,
    /\bVer procedimiento Signos vitales/gi,
  ], id: "601_03" },

  // SVB - Desfibrilación externa
  { patterns: [
    /\bver\s+procedimiento desfibrilación externa/gi,
  ], id: "406" },

  // Técnicas - Carbón activado
  { patterns: [
    /\bver procedimiento 'Administración de Carbón activado'/gi,
  ], id: "605_03" },

  // Técnicas - Sondaje vesical
  { patterns: [
    /\bver procedimiento (?:de )?'Sondaje vesical'/gi,
  ], id: "605_04" },

  // Técnicas - Control de hemorragias
  { patterns: [
    /\bver procedimiento técnico(?: de trauma)? 'Control de hemorragias'/gi,
  ], id: "606_02" },

  // Técnicas - Parche oclusivo torácico
  { patterns: [
    /\bver procedimiento colocación parche oclusivo torácico/gi,
  ], id: "606_03a" },

  // Técnicas - Intubación endotraqueal
  { patterns: [
    /\bver procedimiento (?:de )?intubación endotraqueal/gi,
  ], id: "602_03" },

  // Técnicas - Toracocentesis
  { patterns: [
    /\bver procedimiento (?:de )?toracocentesis/gi,
  ], id: "602_07" },

  // Técnicas - Toracostomía
  { patterns: [
    /\bver procedimiento (?:de )?toracostomía/gi,
  ], id: "602_08" },

  // Técnicas - Vía intraósea EZ-IO
  { patterns: [
    /\bver procedimiento (?:de )?vía intraósea con dispositivo EZ-IO/gi,
  ], id: "604_05b" },

  // Técnicas - Saturación de oxígeno
  { patterns: [
    /\bver procedimiento 'Técnica de medición de la saturación de oxígeno'/gi,
  ], id: "602_09" },

  // Técnicas - Desfibrilación de Doble Secuencia
  { patterns: [
    /\bver procedimiento técnico Desfibrilación de Doble Secuencia \(DDS\)/gi,
  ], id: "603_02b" },

  // SVB - Valoración inicial del paciente politraumatizado
  { patterns: [
    /\bver procedimiento 'Valoración inicial del paciente politraumatizado'/gi,
  ], id: "412_00" },

  // Operativos - Actuación General
  { patterns: [
    /\bVer procedimiento de actuación general\. Operativos/gi,
  ], id: "201" },

  // Operativos - Actuación conjunta con SAMUR Social
  { patterns: [
    /\bver procedimiento de Actuación conjunta con SAMUR-Social/gi,
  ], id: "217_05" },

  // Operativos - Bomberos
  { patterns: [
    /\bver procedimiento (?:de )?actuación con Bomberos/gi,
  ], id: "217_03" },

  // Operativos - NRBQ
  { patterns: [
    /\bver procedimiento operativo:? (?:Primera respuesta )?NRBQ/gi,
    /\bver procedimiento NRBQ/gi,
  ], id: "208" },

  // Operativos - IMV / Triaje
  { patterns: [
    /\bver procedimiento operativo:? Incidentes? con Múltiples Víctimas y Triaje/gi,
  ], id: "207" },

  // Operativos - Preaviso hospitalario (paciente psiquiátrico)
  { patterns: [
    /\bver procedimiento operativo 'Preaviso hospitalario en paciente psiquiátrico'/gi,
  ], id: "206" },

  // Operativos - Atención a menores
  { patterns: [
    /\bver procedimiento Operativo 'Atención a menores'/gi,
  ], id: "209" },

  // Operativos - Policía Municipal
  { patterns: [
    /\bVer Procedimiento de Actuación conjunta con Policía Municipal/gi,
  ], id: "217_01" },

  // Operativos - Conducción de vehículos
  { patterns: [
    /\bver procedimiento conducción de vehículos sanitarios en emergencias/gi,
  ], id: "203" },

  // Operativos - Asistencia psicológica en violencia de género
  { patterns: [
    /\bVer procedimiento de Asistencia psicológica en violencia de género/g,
  ], id: "509" },

  // Operativos - Asistencia psicológica en código 9
  { patterns: [
    /\bVer procedimiento de asistencia psicológica en código 9/gi,
  ], id: "507" },

  // Comunicaciones - Radiotelefónico
  { patterns: [
    /\bver procedimiento radiotelefónico: situaciones especiales/gi,
    /\bver Procedimiento radiotelefónico: Claves/gi,
  ], id: "121" },

  // DRP - CECOR en dispositivo de riesgo previsible
  { patterns: [
    /\bver procedimiento de CECOR en un dispositivo de riesgo previsible/gi,
  ], id: "drp_03" },

  // SVA - Complicaciones de la diabetes (extended pattern)
  { patterns: [
    /\bver procedimiento Complicaciones de la diabetes: Hipoglucemia/gi,
  ], id: "312_01" },

  // Comunicaciones - RCP transtelefónica
  { patterns: [
    /\bver procedimiento RCP transtelefónica/gi,
  ], id: "125_01" },

  // General - Cumplimentación de informes asistenciales
  { patterns: [
    /\bver procedimiento Cumplimentación de informes asistenciales/gi,
  ], id: "205" },
];

function linkProcedureMentions(
  content: string,
  idToSlug: Map<string, string>,
  currentProcedureId?: string,
): string {
  const nbspNormalized = content.replace(/\u00a0/g, " ");
  let result = nbspNormalized;

  for (const { patterns, id } of PROCEDURE_MENTION_LINKS) {
    if (id === currentProcedureId) continue;
    const slug = idToSlug.get(id);
    if (!slug) continue;

    const href = `/manual/${slug}`;

    for (const pattern of patterns) {
      result = result.replace(pattern, (match) => {
        const cleanMatch = match
          .replace(/>>[\s\S]*$/, "")
          .replace(/\s*\(\(\(/g, "")
          .trim();
        return `[${cleanMatch}](${href})`;
      });
    }
  }

  return result;
}

function linkProcedureKeywords(
  content: string,
  idToSlug: Map<string, string>,
  currentProcedureId?: string,
): string {
  let result = content;

  for (const { patterns, id, anchor } of PROCEDURE_KEYWORD_LINKS) {
    if (id === currentProcedureId) continue;
    const slug = idToSlug.get(id);
    if (!slug) continue;

    const href = anchor ? `/manual/${slug}#${anchor}` : `/manual/${slug}`;
    let linked = false;

    for (const pattern of patterns) {
      if (linked) break;
      result = result.replace(pattern, (match) => {
        if (linked) return match;
        linked = true;
        return `[${match}](${href})`;
      });
    }
  }

  return result;
}

function rewriteLegacyDrugLinks(
  content: string,
  options: ProcedureContentNormalizationOptions,
): string {
  return content.replace(VADEMECUM_PLACEHOLDER_LINK_RE, (_match, label: string) => {
    const cleanLabel = stripInlineMarkdown(label);
    const href = options.resolveDrugHref?.(cleanLabel) ?? null;
    return href ? `[${cleanLabel}](${href})` : cleanLabel;
  });
}

function rewriteResolvedInternalLinks(
  content: string,
  resolveInternalHref?: (href: string) => string | null,
): string {
  if (!resolveInternalHref) return content;

  return content.replace(
    MARKDOWN_LINK_WITH_TITLE_RE,
    (match: string, label: string, href: string, title = "") => {
      const localHref = resolveInternalHref(href);
      return localHref ? `[${label}](${localHref}${title})` : match;
    },
  );
}

function protectMarkdownLinks(content: string) {
  const links: string[] = [];
  const protectedContent = content.replace(MARKDOWN_LINK_RE, (match) => {
    const token = `__MDLINK_${links.length}__`;
    links.push(match);
    return token;
  });

  return { protectedContent, links };
}

function restoreMarkdownLinks(content: string, links: string[]) {
  return content.replace(PROTECTED_LINK_TOKEN_RE, (_match, index: string) => links[Number(index)] ?? "");
}

function linkSafeCodeMentions(
  content: string,
  idToSlug: Map<string, string>,
  currentProcedureId?: string,
): string {
  let linked = content;

  for (const { pattern, procedureId } of SAFE_CODE_LINKS) {
    if (currentProcedureId === procedureId) continue;

    const slug = idToSlug.get(procedureId);
    if (!slug) continue;

    linked = linked.replace(pattern, (_match: string, prefix: string, label: string) => (
      `${prefix}[${label}](/manual/${slug})`
    ));
  }

  return linked;
}

function collectInternalManualLinkIds(
  content: string,
  validIds: Set<string>,
  slugToId: Map<string, string>,
): string[] {
  const ids = new Set<string>();

  for (const match of content.matchAll(INTERNAL_MANUAL_LINK_RE)) {
    const slug = match[1];
    const id = slugToId.get(slug);
    if (id && validIds.has(id)) {
      ids.add(id);
    }
  }

  return [...ids];
}

function extractProcedureRelationFamily(id: string): string {
  const [prefix] = id.split("_");
  const numericPrefix = prefix.match(/^(\d+)/)?.[1];
  return numericPrefix ?? prefix;
}

function pushUniqueRelation(
  relations: ProcedureRelation[],
  seen: Set<string>,
  relation: ProcedureRelation,
) {
  const key = `${relation.direction}:${relation.id}`;
  if (seen.has(key)) return;
  seen.add(key);
  relations.push(relation);
}

export function buildOutgoingRelations({
  procedureId,
  editorialIds,
  rawContent,
  normalizedContent,
  validIds,
  slugToId,
}: {
  procedureId: string;
  editorialIds: string[];
  rawContent: string;
  normalizedContent: string;
  validIds: Set<string>;
  slugToId: Map<string, string>;
}): ProcedureRelation[] {
  const relations: ProcedureRelation[] = [];
  const seen = new Set<string>();
  const explicitIds = [
    ...new Set([
      ...deriveRelatedIds(rawContent, validIds),
      ...collectInternalManualLinkIds(rawContent, validIds, slugToId),
    ]),
  ].filter((id) => id !== procedureId);
  const normalizedIds = collectInternalManualLinkIds(normalizedContent, validIds, slugToId)
    .filter((id) => id !== procedureId);
  const editorialSet = new Set(
    editorialIds.filter((id) => id !== procedureId && validIds.has(id)),
  );
  const explicitSet = new Set(explicitIds);

  for (const id of editorialIds) {
    if (id === procedureId || !validIds.has(id)) continue;
    pushUniqueRelation(relations, seen, {
      id,
      direction: "outgoing",
      kind: "editorial",
      strength: "strong",
    });
  }

  for (const id of explicitIds) {
    if (editorialSet.has(id)) continue;
    pushUniqueRelation(relations, seen, {
      id,
      direction: "outgoing",
      kind: "content-link",
      strength: "strong",
    });
  }

  for (const id of normalizedIds) {
    if (editorialSet.has(id) || explicitSet.has(id)) continue;
    pushUniqueRelation(relations, seen, {
      id,
      direction: "outgoing",
      kind: "safe-mention",
      strength: "medium",
    });
  }

  return relations;
}

export function buildSuggestedRelations(
  current: ProcedureRelationCandidate,
  procedures: ProcedureRelationCandidate[],
): ProcedureRelation[] {
  const currentFamily = extractProcedureRelationFamily(current.id);
  const excluded = new Set([current.id, ...current.related, ...current.backlinks]);

  return procedures
    .filter((candidate) =>
      candidate.id !== current.id
      && candidate.section === current.section
      && candidate.sidebarGroup === current.sidebarGroup
      && candidate.sidebarSubgroup === current.sidebarSubgroup
      && extractProcedureRelationFamily(candidate.id) === currentFamily
      && !excluded.has(candidate.id),
    )
    .sort((a, b) => a.id.localeCompare(b.id, "es", { numeric: true }))
    .map((candidate) => ({
      id: candidate.id,
      direction: "outgoing" as const,
      kind: "suggested" as const,
      strength: "medium" as const,
    }));
}

export function buildManualRelationsAudit(
  procedures: ProcedureRelationAuditEntry[],
): ProcedureRelationAudit {
  return {
    withoutOutgoing: procedures
      .filter((procedure) =>
        !procedure.relations.some((relation) =>
          relation.direction === "outgoing" && relation.kind !== "suggested",
        ),
      )
      .map((procedure) => procedure.id),
    withoutBacklinks: procedures
      .filter((procedure) =>
        !procedure.relations.some((relation) =>
          relation.direction === "incoming" && relation.kind !== "suggested",
        ),
      )
      .map((procedure) => procedure.id),
    suggestedPending: procedures
      .map((procedure) => ({
        id: procedure.id,
        title: procedure.title,
        suggestedIds: procedure.relations
          .filter((relation) => relation.direction === "outgoing" && relation.kind === "suggested")
          .map((relation) => relation.id),
      }))
      .filter((procedure) => procedure.suggestedIds.length > 0),
  };
}

export function filterTableOfContentsHeadings(
  headings: TableOfContentsHeading[],
  pageTitle?: string,
): TableOfContentsHeading[] {
  const normalizedTitle = pageTitle ? normalizePlainText(pageTitle) : "";

  return headings.filter((heading) => {
    const normalizedText = normalizePlainText(heading.text);
    if (!normalizedText) return false;
    if (normalizedTitle && normalizedText === normalizedTitle) return false;
    return true;
  });
}

/**
 * XWiki wraps the body of a list item in `(((` … `)))` when the item was authored as a
 * multi-block cell. The scrape keeps those wrappers, so a list item arrives split across
 * two lines: the marker alone (`* (((`) and its text underneath.
 *
 * The blanket `(((`/`)))` strip further down used to delete the wrapper and leave a bare
 * `* `, which `/^[*\-]\s*$/gm` then blanked out — silently demoting the item's text to a
 * paragraph and dropping the first entry of 375 lists across the corpus. Fold the wrapper
 * back into its marker instead, so the item survives as an item.
 *
 * Only lines that already carry a list marker are touched; `normalizeXWikiTables` owns
 * everything starting with `|`. When the wrapped block opens with a heading (or nothing at
 * all) there is no text to fold up, so the orphan marker is dropped outright.
 */
function foldXWikiCellWrappers(text: string): string {
  const MARKER_WRAPPER_RE = /^(\s*)((?:[*-]|\d+[.)])\s+)(\*\*\s*)?\(\(\(\s*$/;
  const lines = text.split("\n");
  const out: string[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const match = MARKER_WRAPPER_RE.exec(lines[i]);
    if (!match) {
      out.push(lines[i]);
      continue;
    }

    const [, indent, marker, bold = ""] = match;
    const next = lines[i + 1] ?? "";
    const foldable = next.trim().length > 0 && !/^#{1,6}\s/.test(next.trim()) && !next.startsWith("|");
    if (!foldable) continue;

    out.push(`${indent}${marker}${bold}${next.trim()}`);
    i += 1;
  }

  return out.join("\n");
}

export function normalizeProcedureContent(
  content: string,
  idToSlug = new Map<string, string>(),
  sourceUrl?: string,
  options: ProcedureContentNormalizationOptions = {},
): string {
  const normalized = foldXWikiCellWrappers(normalizeXWikiTables(content.replace(/\r\n/g, "\n")))
    .replace(/\{\{box[\s\S]*?\}\}/g, "")
    .replace(/^(=+)\s+(.+?)\s+=*\s*$/gm, (_m, eq: string, text: string) => "#".repeat(Math.min(eq.length + 1, 6)) + " " + text.trim())
    .replace(/^# /gm, "## ")
    .replace(/<(?=\s*\d)/g, "&lt;")
    .replace(/\(\(\(/g, "")
    .replace(/\)\)\)/g, "")
    .replace(LEGACY_PRINT_BUTTON_RE, "")
    .replace(LEGACY_IMAGE_LINE_RE, (_match, imagePath: string) => {
      const resolvedPath = resolveRelativeUrl(imagePath, sourceUrl);
      if (/\/(?:print|trans|logo)\.gif$/i.test(resolvedPath)) return "";
      if (resolvedPath.startsWith("../") || resolvedPath.startsWith("./")) {
        return `![](/${resolvedPath.replace(/^(?:\.\.\/|\.\/)+/, "")})`;
      }
      return `![](${resolvedPath})`;
    })
    .replace(XWIKI_TILDE_ESCAPE_RE, "")
    .replace(XWIKI_BACKSLASH_LINE_RE, "")
    .replace(/~([><=|()\[\]{}*_])/g, "$1")
    .replace(XWIKI_EXTERNAL_LINK_RE, (_match, label: string, url: string) => {
      const cleanLabel = label.replace(/!\[[^\]]*\]\([^)]+\)/g, "").replace(/~\[[^\]]*~\]/g, "").trim();
      return cleanLabel ? `[${cleanLabel}](${url})` : url;
    })
    .replace(XWIKI_IMAGE_MACRO_RE, (_match, src: string, options = "") => {
      if (/^data:/i.test(src)) return "";
      const alt = /alt="([^"]*)"/i.exec(options ?? "")?.[1] ?? "";
      return `![${alt}](${resolveRelativeUrl(src, sourceUrl)})`;
    })
    .replace(STANDALONE_BANG_RE, "")
    .replace(/^[*\-]\s*$/gm, "")
    .replace(/\*\*([^*\n]+:)\*\*([^\s*\n])/g, "**$1** $2")
    .replace(/^\*\*~\s*ALGORITMO\s*\*\*$/gim, "<AlgoritmoLabel />")
    .replace(/\*\*~\s*/g, "**")
    .replace(IMAGE_IN_LINK_RE, (_, label: string, href: string) => {
      const cleanLabel = label.trim();
      const resolvedHref = resolveRelativeUrl(href, sourceUrl);
      return cleanLabel ? `[${cleanLabel}](${resolvedHref})` : "";
    })
    .replace(FOOTER_RE, "")
    .replace(START_PAGE_RE, "")
    .replace(ÚLTIMA_MODIFICACIÓN_RE, "")
    .replace(PRINT_EMOJI_RE, "")
    .replace(CONTENIDO_STANDALONE_RE, "");

  const withHeadings = normalizeStandaloneBoldHeadings(normalized);

  const rewrittenLinks = rewriteResolvedInternalLinks(
    rewriteLegacyDrugLinks(rewriteLegacyArrowLinks(withHeadings), options)
      .replace(LOCAL_MARKDOWN_LINK_RE, (_, label: string, href: string) => {
        const id = href.match(PROCEDURE_LINK_RE)?.[1];
        if (!id) return label;

        const slug = idToSlug.get(id);
        if (!slug) return label;

        return `[${label}](/manual/${slug})`;
      }),
    options.resolveInternalHref,
  );

  const { protectedContent, links } = protectMarkdownLinks(rewrittenLinks);
  const linkedCodes = linkSafeCodeMentions(protectedContent, idToSlug, options.currentProcedureId);
  const linkedMentions = linkProcedureMentions(linkedCodes, idToSlug, options.currentProcedureId);
  const linkedKeywords = linkProcedureKeywords(linkedMentions, idToSlug, options.currentProcedureId);

  const restored = restoreMarkdownLinks(linkedKeywords, links).replace(/\n{3,}/g, "\n\n");

  if (options.procedureTitle) {
    const normalizedTitle = normalizePlainText(options.procedureTitle);
    const lines = restored.split("\n");
    for (let i = 0; i < Math.min(lines.length, 8); i++) {
      const trimmed = lines[i].trim();
      if (!trimmed) continue;
      const isAllCaps = trimmed === trimmed.toUpperCase() && /^[A-ZÁÉÍÓÚÑÜ]/.test(trimmed) && trimmed.length >= 3;
      if (isAllCaps && normalizePlainText(trimmed) === normalizedTitle) lines.splice(i, 1);
      break;
    }
    return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  return restored.trim();
}

export function splitProcedureContentSections(content: string): ProcedureContentSection[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const sections: ProcedureContentSection[] = [];

  let currentKey = "__start";
  let currentAnchor: string | null = null;
  let currentHeading: string | null = null;
  let currentLevel = 0;
  let buffer: string[] = [];

  function pushCurrent() {
    sections.push({
      key: currentKey,
      anchor: currentAnchor,
      heading: currentHeading,
      level: currentLevel,
      content: buffer.join("\n").trim(),
    });
  }

  for (const line of lines) {
    const headingMatch = line.match(/^(#{2,3})\s+(.+?)\s*$/);
    if (headingMatch) {
      pushCurrent();
      currentHeading = stripInlineMarkdown(headingMatch[2]);
      currentAnchor = slugifyProcedureHeading(currentHeading);
      currentKey = currentAnchor || `section-${sections.length}`;
      currentLevel = headingMatch[1].length;
      buffer = [line];
      continue;
    }

    buffer.push(line);
  }

  pushCurrent();
  return sections;
}

function createEditorialBucket(): ProcedureEditorialBlockBucket {
  return { before: [], after: [] };
}

export function groupProcedureEditorialBlocks(
  blocks: ProcedureEditorialBlock[],
  sections: ProcedureContentSection[],
): GroupedProcedureEditorialBlocks {
  const bySection = Object.fromEntries(
    sections.map((section) => [section.key, createEditorialBucket()]),
  ) as Record<string, ProcedureEditorialBlockBucket>;
  const afterAll: ProcedureEditorialBlock[] = [];
  const unresolvedIds: string[] = [];

  for (const block of blocks) {
    const normalizedTarget = slugifyProcedureHeading(block.targetHeading);
    const section = sections.find((candidate) =>
      candidate.key === block.targetHeading
      || candidate.anchor === block.targetHeading
      || candidate.anchor === normalizedTarget
      || (candidate.heading && slugifyProcedureHeading(candidate.heading) === normalizedTarget),
    );

    if (!section) {
      afterAll.push(block);
      unresolvedIds.push(block.id);
      continue;
    }

    const bucket = bySection[section.key] ?? (bySection[section.key] = createEditorialBucket());
    bucket[block.placement === "before" ? "before" : "after"].push(block);
  }

  return { bySection, afterAll, unresolvedIds };
}

export function collectCitedDrugs(content: string): string[] {
  const drugs = new Set<string>();

  for (const match of content.matchAll(DRUG_LINK_RE)) {
    drugs.add(match[1]);
  }

  return [...drugs];
}

export function collectCitedTechniques(content: string): string[] {
  const normalized = normalizePlainText(content);
  const techniques: string[] = [];

  for (const [label, pattern] of TECHNIQUE_PATTERNS) {
    if (pattern.test(normalized)) {
      techniques.push(label);
    }
  }

  return techniques;
}

export function mergeEditorialAttachments(
  items: ProcedureEditorialItem[] | undefined,
  attachments: ManualAttachment[],
): ProcedureEditorialItem[] {
  if (!items?.length) return [];

  return items.map((item) => {
    if (!item.localPath) return item;
    const attachment = attachments.find((candidate) => candidate.localPath === item.localPath);
    if (!attachment) return item;

    return {
      ...item,
      kind: item.kind ?? attachment.kind,
      href: item.href ?? attachment.localPath,
    };
  });
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
  // Extract numeric prefix: "304_01a" → 304, "309_02b" → 309, "217_01" → 217
  const num = parseInt(id.split("_")[0].replace(/[^0-9]/g, "") || "0");

  switch (section) {
    case "Administrativos":
      return { group: "Procedimientos", subgroup: "Listado" };

    case "Comunicaciones":
      return { group: "Procedimientos", subgroup: "Listado" };

    case "Operativos":
      if (/^217_/.test(id)) {
        return { group: "Coordinación interservicios", subgroup: "Actuaciones conjuntas" };
      }
      if (/^216/i.test(id)) {
        return {
          group: "Riesgo biológico e infeccioso",
          subgroup: normalizedTitle.includes("ébola") || /216[cd]/i.test(id)
            ? "Patógenos de alto riesgo"
            : "Exposiciones biológicas",
        };
      }
      if (num >= 212 && num <= 215) {
        return { group: "Códigos especiales", subgroup: "Protocolos de activación" };
      }
      return { group: "Actuación operativa", subgroup: "Incidentes y coordinación" };

    case "SVA":
      if (num <= 303 || num === 316) {
        return { group: "Soporte vital y vía aérea", subgroup: "Reanimación y vía aérea" };
      }
      if (num === 304) return { group: "Urgencias específicas", subgroup: "Urgencias traumatológicas" };
      if (num === 305) return { group: "Urgencias específicas", subgroup: "Urgencias digestivas" };
      if (num === 306) return { group: "Urgencias específicas", subgroup: "Urgencias neurológicas" };
      if (num === 307) return { group: "Urgencias específicas", subgroup: "Urgencias nefrourológicas" };
      if (num === 308) return { group: "Urgencias específicas", subgroup: "Urgencias obstétricas" };
      if (num === 309) return { group: "Urgencias específicas", subgroup: "Urgencias cardiovasculares" };
      if (num === 310) return { group: "Urgencias específicas", subgroup: "Urgencias respiratorias" };
      if (num === 311 || normalizedTitle.includes("psiqu")) {
        return { group: "Urgencias específicas", subgroup: "Urgencias psiquiátricas" };
      }
      if (num === 312) return { group: "Urgencias específicas", subgroup: "Urgencias endocrino-metabólicas" };
      if (num === 313) return { group: "Urgencias específicas", subgroup: "Urgencias por agentes físicos" };
      if (num === 314) return { group: "Urgencias específicas", subgroup: "Urgencias pediátricas" };
      if (num === 315) return { group: "Urgencias específicas", subgroup: "Intoxicaciones" };
      return { group: "Urgencias específicas", subgroup: "Otras urgencias" };

    case "SVB":
      if (/^412/.test(id)) {
        return { group: "Traumatismos SVB", subgroup: "Valoración del politraumatizado" };
      }
      if (num <= 406) {
        return { group: "Valoración y soporte vital", subgroup: "Secuencia básica" };
      }
      return { group: "Patologías prevalentes", subgroup: "Motivos de asistencia" };

    case "Psicológicos":
      return { group: "Intervención psicológica", subgroup: "Activación de guardia" };

    case "Técnicas":
      if (num === 601) return { group: "Procedimientos básicos", subgroup: "Relación y valoración" };
      if (num === 602) return { group: "Vía aérea y respiración", subgroup: "Técnicas respiratorias" };
      if (num === 603) return { group: "Cardiacos", subgroup: "Técnicas cardiacas" };
      if (num === 604) return { group: "Vasculares", subgroup: "Accesos vasculares" };
      if (num === 605) return { group: "Sondajes", subgroup: "Sondajes y lavados" };
      if (num === 606) return { group: "Trauma", subgroup: "Técnicas traumatológicas" };
      if (num === 607 || num === 608) return { group: "Otras técnicas", subgroup: "Exploración y otras" };
      if (num === 609) return { group: "Obstetricia", subgroup: "Técnicas obstétricas" };
      return { group: "Técnicas asistenciales", subgroup: "Procedimientos" };

    case "DRP":
      return { group: "Procedimientos", subgroup: "Listado" };

    case "Intervinientes":
      return { group: "Procedimientos", subgroup: "Listado" };

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

/** Atributos JSX que contienen texto legible por una persona. */
const READABLE_JSX_ATTRS = /\b(?:name|label|title|alt|text)\s*=\s*"([^"]*)"/g;

export function stripMarkdownToText(content: string): string {
  return content
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]+`/g, " ")
    .replace(/!\[[^\]]*]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    // Componentes MDX autocerrados: se conserva el texto útil de sus atributos y se
    // descarta el resto. Sin esto, los fragmentos de búsqueda mostraban literalmente
    // `<DrugLink name="Adrenalina" /` al usuario.
    // El (?:"[^"]*"|[^>"])* salta por encima de los tramos entrecomillados, para que
    // un atributo que contenga ">" —como chart="graph TD; A-->B"— no corte la etiqueta.
    .replace(/<[A-Z][A-Za-z0-9]*(?:"[^"]*"|[^>"])*\/>/g, (tag) => {
      const values = [...tag.matchAll(READABLE_JSX_ATTRS)].map((match) => match[1]);
      return values.length ? ` ${values.join(" ")} ` : " ";
    })
    // Etiquetas de apertura/cierre restantes: fuera la etiqueta, dentro el contenido.
    .replace(/<\/?[A-Za-z][A-Za-z0-9]*(?:"[^"]*"|[^>"])*>/g, " ")
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

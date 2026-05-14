import type { AttachmentKind, ManualAttachment } from "./manual-sync.ts";

const MARKDOWN_LINK_RE = /\[[^\]]+\]\(([^)]+)\)/g;
const PROCEDURE_LINK_RE = /(?:^|\/)([0-9][^./]*|[A-Z]{1,3}[^./]*)\.htm(?:$|[#?])/i;
const BARE_PROCEDURE_LINK_RE = /(?:^|[\s(])(?:https?:\/\/[^\s)]+\/)?([0-9][A-Za-z0-9_]{1,12})\.htm(?:$|[#?\s)])/gim;
const LEGACY_PRINT_BUTTON_RE = /^.*!\[[^\]]*\]\([^)]*print\.gif[^)]*\).*$/gim;
const LEGACY_IMAGE_LINE_RE = /^\s*!\[[^\]]*]\(((?:\.\.\/|\.\/)?images\/[^)]+)\)\s*$/gim;
const STANDALONE_BANG_RE = /^!\s*$/gm;
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
  resolveDrugHref?: (reference: string) => string | null;
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

export function normalizeProcedureContent(
  content: string,
  idToSlug = new Map<string, string>(),
  sourceUrl?: string,
  options: ProcedureContentNormalizationOptions = {},
): string {
  const normalized = content
    .replace(/\r\n/g, "\n")
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
    .replace(XWIKI_EXTERNAL_LINK_RE, (_match, label: string, url: string) => {
      const cleanLabel = label.replace(/!\[[^\]]*\]\([^)]+\)/g, "").replace(/~\[[^\]]*~\]/g, "").trim();
      return cleanLabel ? `[${cleanLabel}](${url})` : url;
    })
    .replace(STANDALONE_BANG_RE, "")
    .replace(IMAGE_IN_LINK_RE, (_, label: string, href: string) => {
      const cleanLabel = label.trim();
      const resolvedHref = resolveRelativeUrl(href, sourceUrl);
      return cleanLabel ? `[${cleanLabel}](${resolvedHref})` : "";
    })
    .replace(FOOTER_RE, "")
    .replace(START_PAGE_RE, "");

  const rewrittenLinks = rewriteLegacyDrugLinks(rewriteLegacyArrowLinks(normalized), options)
    .replace(LOCAL_MARKDOWN_LINK_RE, (_, label: string, href: string) => {
      const id = href.match(PROCEDURE_LINK_RE)?.[1];
      if (!id) return label;

      const slug = idToSlug.get(id);
      if (!slug) return label;

      return `[${label}](/manual/${slug})`;
    });

  const { protectedContent, links } = protectMarkdownLinks(rewrittenLinks);
  const linkedCodes = linkSafeCodeMentions(protectedContent, idToSlug, options.currentProcedureId);

  return restoreMarkdownLinks(linkedCodes, links)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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

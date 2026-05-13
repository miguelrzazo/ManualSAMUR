import { collectCitedDrugs, stripMarkdownToText } from "./manual-data.ts";
import { resolveDrugIdReference } from "./vademecum-utils.ts";

export interface CodeReferenceSource {
  code: string;
  name: string;
  tab: string;
  subtab?: string;
  group?: string;
  category?: string;
}

export interface ManualCodeReference extends CodeReferenceSource {
  label: string;
  href: string;
}

export interface ManualProcedureRelationEntry {
  procedureId: string;
  title: string;
  slug: string;
  section: string;
  preview: string;
  drugIds: string[];
  codeRefs: ManualCodeReference[];
}

export interface ManualReverseMention {
  procedureId: string;
  title: string;
  slug: string;
  section: string;
  preview: string;
}

export interface ManualRelationsIndex {
  procedures: Record<string, ManualProcedureRelationEntry>;
  drugs: Record<string, ManualReverseMention[]>;
  codes: Record<string, ManualReverseMention[]>;
}

interface ProcedureLike {
  id: string;
  title: string;
  slug: string;
  section: string;
  content?: string;
  searchText?: string;
}

interface DrugLike {
  id: string;
  name: string;
  synonyms?: string[];
  category?: string;
  subcategory?: string;
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function uniqBy<T>(items: T[], keyFor: (item: T) => string): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    const key = keyFor(item);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function buildMentionLabel(source: CodeReferenceSource, normalizedText: string): string {
  const numericMention = new RegExp(`\\bcodigo\\s+${escapeRegex(normalize(source.code))}\\b`, "i");
  const claveMention = new RegExp(`\\bclave\\s+${escapeRegex(normalize(source.code))}\\b`, "i");

  if (source.subtab === "claves" && claveMention.test(normalizedText)) return `Clave ${source.code}`;
  if (numericMention.test(normalizedText)) return `Código ${source.code}`;
  return source.name;
}

export function buildCodeHref(source: CodeReferenceSource): string {
  const params = new URLSearchParams();
  params.set("tab", source.tab);
  if (source.subtab) params.set("subtab", source.subtab);
  params.set("code", source.code);
  return `/codigos?${params.toString()}`;
}

export function extractCodeReferences(content: string, codes: CodeReferenceSource[]): ManualCodeReference[] {
  const normalizedText = normalize(stripMarkdownToText(content));
  if (!normalizedText) return [];

  const refs: ManualCodeReference[] = [];
  for (const code of codes) {
    const normalizedCode = normalize(code.code);
    const normalizedName = normalize(code.name);
    const mentions: RegExp[] = [];

    if (code.subtab === "claves") {
      mentions.push(new RegExp(`\\bclave\\s+${escapeRegex(normalizedCode)}\\b`, "i"));
    }

    if (/^\d+(?:\s+\d+)?$/.test(normalizedCode)) {
      mentions.push(new RegExp(`\\bcodigo\\s+${escapeRegex(normalizedCode)}\\b`, "i"));
    }

    if (normalizedName.startsWith("codigo ") || normalizedName.startsWith("clave ")) {
      mentions.push(new RegExp(`\\b${escapeRegex(normalizedName)}\\b`, "i"));
    }

    if (!mentions.some((pattern) => pattern.test(normalizedText))) continue;

    refs.push({
      ...code,
      label: buildMentionLabel(code, normalizedText),
      href: buildCodeHref(code),
    });
  }

  return uniqBy(refs, (ref) => `${ref.tab}:${ref.subtab ?? ""}:${ref.code}`);
}

function buildPreview(content: string | undefined, fallback: string): string {
  const text = stripMarkdownToText(content ?? fallback)
    .replace(/\bInicio página\s*doc:?/gi, "")
    .trim();
  if (text.length <= 260) return text;
  return `${text.slice(0, 257).trim()}...`;
}

function pushReverse(
  target: Record<string, ManualReverseMention[]>,
  key: string,
  mention: ManualReverseMention,
) {
  const bucket = target[key] ?? (target[key] = []);
  if (!bucket.some((item) => item.procedureId === mention.procedureId)) {
    bucket.push(mention);
  }
}

export function buildManualRelationsIndex({
  procedures,
  drugs,
  codes,
}: {
  procedures: ProcedureLike[];
  drugs: DrugLike[];
  codes: CodeReferenceSource[];
}): ManualRelationsIndex {
  const result: ManualRelationsIndex = {
    procedures: {},
    drugs: {},
    codes: {},
  };

  for (const procedure of procedures) {
    const content = procedure.content ?? procedure.searchText ?? "";
    const preview = buildPreview(content, procedure.searchText ?? procedure.title);
    const drugIds = uniqBy(
      collectCitedDrugs(content)
        .map((reference) => resolveDrugIdReference(reference, drugs))
        .filter((id): id is string => Boolean(id)),
      (id) => id,
    );
    const codeRefs = extractCodeReferences(content || procedure.searchText || procedure.title, codes);
    const mention: ManualReverseMention = {
      procedureId: procedure.id,
      title: procedure.title,
      slug: procedure.slug,
      section: procedure.section,
      preview,
    };

    result.procedures[procedure.id] = {
      procedureId: procedure.id,
      title: procedure.title,
      slug: procedure.slug,
      section: procedure.section,
      preview,
      drugIds,
      codeRefs,
    };

    for (const drugId of drugIds) pushReverse(result.drugs, drugId, mention);
    for (const codeRef of codeRefs) pushReverse(result.codes, `${codeRef.tab}:${codeRef.subtab ?? ""}:${codeRef.code}`, mention);
  }

  return result;
}

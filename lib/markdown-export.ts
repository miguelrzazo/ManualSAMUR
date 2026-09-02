export const DEFAULT_SITE_URL = "https://manual-samur.vercel.app";

export interface CanonicalProcedureMarkdown {
  id: string;
  title: string;
  section?: string;
  slug?: string;
  updated?: string;
  sourceUpdated?: string;
  source?: string;
  tags?: string[];
  synonyms?: string[];
  related?: string[];
  attachments?: unknown[];
  content: string;
}

/** Resolve and normalize the origin used by every agent-facing URL. */
export function resolveCanonicalSiteUrl(env: Record<string, string | undefined> = process.env): string {
  const value = env.SITE_URL || env.NEXT_PUBLIC_SITE_URL || (env.VERCEL_URL ? `https://${env.VERCEL_URL}` : DEFAULT_SITE_URL);
  return value.trim().replace(/\/+$/, "");
}

function yamlScalar(value: string) {
  return JSON.stringify(value);
}

function yamlList(values: string[] | undefined) {
  return values?.length ? `[${values.map(yamlScalar).join(", ")}]` : "[]";
}

/** Serialize the same content shown in the procedure page, without navigation chrome. */
export function canonicalProcedureMarkdown(procedure: CanonicalProcedureMarkdown): string {
  const lines = [
    "---",
    `id: ${yamlScalar(procedure.id)}`,
    `title: ${yamlScalar(procedure.title)}`,
  ];
  if (procedure.section) lines.push(`section: ${yamlScalar(procedure.section)}`);
  if (procedure.slug) lines.push(`slug: ${yamlScalar(procedure.slug)}`);
  if (procedure.updated) lines.push(`updated: ${yamlScalar(procedure.updated)}`);
  if (procedure.sourceUpdated) lines.push(`sourceUpdated: ${yamlScalar(procedure.sourceUpdated)}`);
  if (procedure.source) lines.push(`source: ${yamlScalar(procedure.source)}`);
  if (procedure.tags) lines.push(`tags: ${yamlList(procedure.tags)}`);
  if (procedure.synonyms) lines.push(`synonyms: ${yamlList(procedure.synonyms)}`);
  if (procedure.related) lines.push(`related: ${yamlList(procedure.related)}`);
  if (procedure.attachments) lines.push(`attachments: ${JSON.stringify(procedure.attachments)}`);
  lines.push("---", "", procedure.content.trim(), "");
  return lines.join("\n");
}

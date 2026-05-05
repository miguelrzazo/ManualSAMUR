#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import {
  buildBacklinks,
  buildManualRelationsAudit,
  buildOutgoingRelations,
  buildSuggestedRelations,
  getProcedureSidebarMeta,
  normalizeProcedureContent,
} from "../lib/manual-data.ts";

const ROOT_DIR = path.join(import.meta.dirname, "..");
const PROCEDURES_DIR = path.join(ROOT_DIR, "content/procedures");

interface RawProcedure {
  id: string;
  title: string;
  section: string;
  slug: string;
  related: string[];
  content: string;
}

function walkMarkdownFiles(dir: string): string[] {
  const files: string[] = [];
  if (!fs.existsSync(dir)) return files;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walkMarkdownFiles(entryPath));
    else if (entry.isFile() && entry.name.endsWith(".md")) files.push(entryPath);
  }

  return files;
}

const procedures: RawProcedure[] = walkMarkdownFiles(PROCEDURES_DIR).map((filePath) => {
  const parsed = matter(fs.readFileSync(filePath, "utf8"));
  const filename = path.basename(filePath, ".md");

  return {
    id: typeof parsed.data.id === "string" ? parsed.data.id : filename,
    title: typeof parsed.data.title === "string" ? parsed.data.title : filename,
    section: typeof parsed.data.section === "string" ? parsed.data.section : "General",
    slug: typeof parsed.data.slug === "string" ? parsed.data.slug : filename,
    related: Array.isArray(parsed.data.related) ? parsed.data.related : [],
    content: parsed.content,
  };
});

const validIds = new Set(procedures.map((procedure) => procedure.id));
const idToSlug = new Map(procedures.map((procedure) => [procedure.id, procedure.slug]));
const slugToId = new Map(procedures.map((procedure) => [procedure.slug, procedure.id]));

const baseProcedures = procedures.map((procedure) => {
  const normalizedContent = normalizeProcedureContent(procedure.content, idToSlug);
  const sidebarMeta = getProcedureSidebarMeta(procedure.section, procedure.id, procedure.title);
  const relations = buildOutgoingRelations({
    procedureId: procedure.id,
    editorialIds: procedure.related,
    rawContent: procedure.content,
    normalizedContent,
    validIds,
    slugToId,
  });

  return {
    ...procedure,
    sidebarGroup: sidebarMeta.group,
    sidebarSubgroup: sidebarMeta.subgroup,
    related: relations.map((relation) => relation.id),
    relations,
  };
});

const backlinks = buildBacklinks(baseProcedures);
const proceduresWithRelations = baseProcedures.map((procedure) => ({
  ...procedure,
  backlinks: backlinks[procedure.id] ?? [],
}));

const audit = buildManualRelationsAudit(
  proceduresWithRelations.map((procedure) => ({
    id: procedure.id,
    title: procedure.title,
    related: procedure.related,
    backlinks: procedure.backlinks,
    relations: [
      ...procedure.relations,
      ...buildSuggestedRelations(procedure, proceduresWithRelations),
      ...procedure.backlinks.flatMap((sourceId) => {
        const source = proceduresWithRelations.find((candidate) => candidate.id === sourceId);
        const sourceRelation = source?.relations.find((relation) => relation.id === procedure.id);
        return sourceRelation ? [{
          id: sourceId,
          direction: "incoming" as const,
          kind: sourceRelation.kind,
          strength: sourceRelation.strength,
        }] : [];
      }),
    ],
  })),
);

console.log(JSON.stringify({
  totals: {
    procedures: procedures.length,
    withoutOutgoing: audit.withoutOutgoing.length,
    withoutBacklinks: audit.withoutBacklinks.length,
    suggestedPending: audit.suggestedPending.length,
  },
  withoutOutgoing: audit.withoutOutgoing.slice(0, 40),
  withoutBacklinks: audit.withoutBacklinks.slice(0, 40),
  suggestedPending: audit.suggestedPending.slice(0, 40),
}, null, 2));

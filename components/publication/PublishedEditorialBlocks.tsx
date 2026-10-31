"use client";

import type { ComponentProps } from "react";
import { ProcedureEditorialBlockRenderer } from "@/components/manual/ProcedureEditorialBlock";
import { groupProcedureEditorialBlocks, splitProcedureContentSections, type ProcedureEditorialBlock, type ProcedureEditorialItem } from "@/lib/manual-data";
import type { MobileContentSnapshot, MobileProcedure } from "@/packages/manual-content/src/schema";
import { SafeMarkdown } from "./SafeMarkdown";

const safeUrl = (value: unknown): string | undefined => typeof value === "string" && (/^https?:\/\//i.test(value) || /^\/(?!\/)/.test(value)) ? value : undefined;
const kinds = new Set(["summary", "warning", "checklist", "diagram", "cheatsheet", "attachment-group", "image-gallery", "cited-drugs", "cited-techniques", "related-links", "editorial-note"]);
function safeBlock(value: unknown): ProcedureEditorialBlock | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const block = value as ProcedureEditorialBlock;
  if (typeof block.id !== "string" || !kinds.has(block.type) || typeof block.targetHeading !== "string") return null;
  return { ...block,
    items: Array.isArray(block.items) ? block.items.filter((item) => typeof item === "string" || Boolean(item && typeof item === "object")).map((item) => typeof item === "string" ? item : { ...item, href: safeUrl(item.href), localPath: safeUrl(item.localPath) }) as ProcedureEditorialBlock["items"] : [],
    assets: Array.isArray(block.assets) ? block.assets.filter((asset) => asset && safeUrl(asset.src)).map((asset) => ({ ...asset, src: safeUrl(asset.src)! })) : [],
  };
}

/** Only known data components are rendered; published source never goes through MDX evaluation. */
export function PublishedProcedureBody({ procedure, snapshot }: { procedure: MobileProcedure; snapshot: MobileContentSnapshot }) {
  const sections = splitProcedureContentSections(procedure.content);
  const blocks = procedure.editorialBlocks.map(safeBlock).filter((block): block is ProcedureEditorialBlock => block !== null);
  const grouped = groupProcedureEditorialBlocks(blocks, sections);
  const props = { procedure, allProcedures: [] } as unknown as Pick<ComponentProps<typeof ProcedureEditorialBlockRenderer>, "procedure" | "allProcedures">;
  const renderBlock = (block: ProcedureEditorialBlock) => {
    // Resolve IDs to explicit anchors so new slugs do not trigger static Next prefetch.
    const resolved = block.type === "related-links" ? { ...block, items: ((block.items ?? []) as Array<string | ProcedureEditorialItem>).flatMap<ProcedureEditorialItem>((item) => {
      if (typeof item !== "string") {
        const { id, title, description, href, localPath, kind, label } = item;
        return [{ id, title, description, href, localPath, kind, label }];
      }
      const target = snapshot.content.procedures.find((candidate) => candidate.id === item);
      return target ? [{ id: target.id, title: `${target.id} · ${target.title}`, href: `/manual/${encodeURIComponent(target.slug)}` }] : [];
    }) } : block;
    return <ProcedureEditorialBlockRenderer key={block.id} block={resolved} {...props} />;
  };
  return <>{sections.map((section) => <section key={section.key}>{grouped.bySection[section.key]?.before.map(renderBlock)}<SafeMarkdown content={section.content} drugs={snapshot.content.drugs} />{grouped.bySection[section.key]?.after.map(renderBlock)}</section>)}{grouped.afterAll.map(renderBlock)}</>;
}

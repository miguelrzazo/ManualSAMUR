import type { MobileAttachment, MobileProcedure } from "../../../packages/manual-content/src/index.ts";
import { rendersInline } from "./attachment-logic.ts";
import { buildProcedureFindText, type ProcedureFindText } from "./procedure-find-logic.ts";
import {
  procedureRouteKey,
  resolveProcedureReference,
  splitMarkdownBlocks,
  splitProcedureSections,
  type MarkdownBlock,
  type ProcedureHeading,
  type ProcedureSection,
} from "./procedure-logic.ts";

/** A section with its renderer blocks parsed once for the lifetime of the document. */
export interface ParsedProcedureSection extends ProcedureSection {
  blocks: MarkdownBlock[];
}

export interface ProcedureAssetReference {
  src: string;
  alt: string;
}

export interface ProcedureRenderingMetadata {
  /** Images already present in markdown are not repeated in the figures list. */
  inlineImageSources: ReadonlySet<string>;
  imageAttachments: MobileAttachment[];
  documentAttachments: MobileAttachment[];
}

export interface ProcedureAssetReferences {
  images: ProcedureAssetReference[];
  /** Keeps the first attachment for a path, matching the old `.find()` behaviour. */
  attachmentsByLocalPath: ReadonlyMap<string, MobileAttachment>;
}

export interface ProcedureNavigation {
  outgoingIds: string[];
  incomingIds: string[];
  outgoing: MobileProcedure[];
  incoming: MobileProcedure[];
  unresolvedRelatedIds: string[];
}

export interface ParsedProcedureDocument {
  procedure: MobileProcedure;
  routeKey: string;
  sections: ProcedureSection[];
  renderSections: ParsedProcedureSection[];
  headings: ProcedureHeading[];
  headingById: ReadonlyMap<string, ProcedureHeading>;
  headingIndexById: Readonly<Record<string, number>>;
  /** Text in exactly the same blocks that MarkdownContent renders. */
  findText: ProcedureFindText[];
  navigation: ProcedureNavigation;
  rendering: ProcedureRenderingMetadata;
  assets: ProcedureAssetReferences;
}

const IMAGE_REFERENCE = /!\[([^\]]*)\]\(([^)\s]+)\)/g;

function imageReferences(markdown: string): ProcedureAssetReference[] {
  return [...String(markdown ?? "").matchAll(IMAGE_REFERENCE)].map((match) => ({
    alt: match[1].trim(),
    src: match[2],
  }));
}

function uniqueRelatedIds(procedure: MobileProcedure, direction: "outgoing" | "incoming"): string[] {
  return [...new Set(
    procedure.relations
      .filter((relation) => relation.direction === direction && (direction !== "outgoing" || relation.kind !== "suggested"))
      .map((relation) => relation.id),
  )].filter((id) => id !== procedure.id);
}

function procedureNavigation(procedure: MobileProcedure, procedures?: readonly MobileProcedure[]): ProcedureNavigation {
  const outgoingIds = uniqueRelatedIds(procedure, "outgoing");
  const incomingIds = uniqueRelatedIds(procedure, "incoming");
  if (!procedures) {
    return { outgoingIds, incomingIds, outgoing: [], incoming: [], unresolvedRelatedIds: [] };
  }

  // Retain the shared content array so parsing does not clone the whole procedure
  // catalog per link.
  const resolve = (id: string) => resolveProcedureReference(procedures, id);
  const outgoing = outgoingIds.map(resolve).filter((item): item is MobileProcedure => Boolean(item));
  const incoming = incomingIds.map(resolve).filter((item): item is MobileProcedure => Boolean(item));
  return {
    outgoingIds,
    incomingIds,
    outgoing,
    incoming,
    unresolvedRelatedIds: outgoingIds.filter((id) => !resolve(id)),
  };
}

function procedureRendering(procedure: MobileProcedure, references: readonly ProcedureAssetReference[]): ProcedureRenderingMetadata {
  const inlineImageSources = new Set(references.map((reference) => reference.src));
  return {
    inlineImageSources,
    imageAttachments: procedure.attachments.filter((attachment) => rendersInline(attachment) && !inlineImageSources.has(attachment.localPath)),
    documentAttachments: procedure.attachments.filter((attachment) => !rendersInline(attachment)),
  };
}

function procedureAssets(procedure: MobileProcedure, references: ProcedureAssetReference[]): ProcedureAssetReferences {
  const attachmentsByLocalPath = new Map<string, MobileAttachment>();
  for (const attachment of procedure.attachments) {
    if (!attachmentsByLocalPath.has(attachment.localPath)) attachmentsByLocalPath.set(attachment.localPath, attachment);
  }
  return { images: references, attachmentsByLocalPath };
}

/**
 * Parse all stable reader data once. Layout-dependent values intentionally stay out
 * of this model; they belong to the screen because they change as the user scrolls
 * or expands the contents card.
 */
export function parseProcedureDocument(
  procedure: MobileProcedure,
  procedures?: readonly MobileProcedure[],
): ParsedProcedureDocument {
  const sections = splitProcedureSections(procedure.content);
  const renderSections = sections.map((section) => ({ ...section, blocks: splitMarkdownBlocks(section.lines) }));
  const headings = sections.flatMap((section) => section.heading ? [section.heading] : []);
  const headingById = new Map(headings.map((heading) => [heading.id, heading]));
  const headingIndexById: Record<string, number> = {};
  headings.forEach((heading, index) => { headingIndexById[heading.id] = index; });
  const references = imageReferences(procedure.content);

  return {
    procedure,
    routeKey: procedureRouteKey(procedure),
    sections,
    renderSections,
    headings,
    headingById,
    headingIndexById,
    findText: buildProcedureFindText(renderSections),
    navigation: procedureNavigation(procedure, procedures),
    rendering: procedureRendering(procedure, references),
    assets: procedureAssets(procedure, references),
  };
}

export interface MeasuredHeadingOffset {
  id: string;
  offset: number;
}

/** Return the last measured heading at or before a content offset in O(log n). */
export function activeHeadingIdAtOffset(offsets: readonly MeasuredHeadingOffset[], contentY: number): string | null {
  let low = 0;
  let high = offsets.length - 1;
  let active: string | null = null;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (offsets[middle].offset <= contentY) {
      active = offsets[middle].id;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return active;
}

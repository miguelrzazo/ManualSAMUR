import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowUpRight, FileText, GalleryVerticalEnd, Network, NotebookPen, Paperclip, Pill, Siren, Stethoscope, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ProcedureMeta } from "@/lib/content";
import {
  Checklist,
  MermaidDiagram,
} from "@/components/manual/mdx-extras";
import {
  collectCitedDrugs,
  collectCitedTechniques,
  mergeEditorialAttachments,
  type ProcedureEditorialBlock,
  type ProcedureEditorialItem,
} from "@/lib/manual-data";
import type { ManualAttachment } from "@/lib/manual-sync";
import { toCapitalCase } from "@/lib/title-case";

interface Props {
  block: ProcedureEditorialBlock;
  procedure: ProcedureMeta & { content: string; attachments: ManualAttachment[] };
  allProcedures: ProcedureMeta[];
}

function filenameFromPath(pathname: string) {
  return pathname.split("/").pop() ?? pathname;
}

function paragraphize(content: string | undefined) {
  if (!content) return [];
  return content.split(/\n{2,}/).map((chunk) => chunk.trim()).filter(Boolean);
}

function stringItems(items: ProcedureEditorialBlock["items"]): string[] {
  return Array.isArray(items) ? items.filter((item): item is string => typeof item === "string") : [];
}

function objectItems(items: ProcedureEditorialBlock["items"]): ProcedureEditorialItem[] {
  return Array.isArray(items)
    ? items.filter((item): item is ProcedureEditorialItem => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
}

function attachmentItems(block: ProcedureEditorialBlock, attachments: ManualAttachment[]) {
  const explicit = mergeEditorialAttachments(objectItems(block.items), attachments);
  if (explicit.length > 0) return explicit;

  return attachments.map<ProcedureEditorialItem>((attachment) => ({
    localPath: attachment.localPath,
    href: attachment.localPath,
    kind: attachment.kind,
    title: filenameFromPath(attachment.localPath),
  }));
}

function sectionBadge(label: string | undefined) {
  if (!label) return null;
  return (
    <Badge variant="outline" className="text-[11px] font-medium">
      {toCapitalCase(label)}
    </Badge>
  );
}

function BlockShell({
  icon,
  title,
  label,
  children,
}: {
  icon: ReactNode;
  title?: string;
  label?: string;
  children: ReactNode;
}) {
  return (
    <section className="my-6 rounded-2xl border border-border/60 bg-card/50 p-4 md:p-5 not-prose">
      {(title || label) && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
            {icon}
          </span>
          {title ? <p className="text-sm font-semibold text-foreground">{toCapitalCase(title)}</p> : null}
          <div className="ml-auto">{sectionBadge(label)}</div>
        </div>
      )}
      {children}
    </section>
  );
}

function renderParagraphs(content: string | undefined, className = "space-y-3 text-sm leading-7 text-foreground/90") {
  const paragraphs = paragraphize(content);
  if (!paragraphs.length) return null;

  return (
    <div className={className}>
      {paragraphs.map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
    </div>
  );
}

function RelatedLinks({
  items,
  procedures,
}: {
  items: ProcedureEditorialBlock["items"];
  procedures: ProcedureMeta[];
}) {
  const procedureById = new Map(procedures.map((procedure) => [procedure.id, procedure]));
  const resolved = [
    ...stringItems(items).flatMap((id) => {
      const procedure = procedureById.get(id);
      return procedure ? [procedure] : [];
    }),
    ...objectItems(items),
  ];

  if (!resolved.length) return null;

  return (
    <div className="grid gap-2">
      {resolved.map((entry) => {
        if ("slug" in entry) {
          return (
            <Link
              key={entry.id}
              href={`/manual/${entry.slug}`}
              className="flex items-center justify-between rounded-xl border border-border/60 bg-background/70 px-3 py-3 text-sm transition-colors hover:bg-muted/40"
            >
              <span>
                <span className="mr-2 font-mono text-xs text-muted-foreground">{entry.id}</span>
                <span className="font-medium">{entry.title}</span>
              </span>
              <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          );
        }

        const href = entry.href ?? entry.localPath ?? "#";
        return (
          <a
            key={`${entry.title ?? href}-${href}`}
            href={href}
            target={href.startsWith("/manual/") ? undefined : "_blank"}
            rel={href.startsWith("/manual/") ? undefined : "noopener noreferrer"}
            className="flex items-center justify-between rounded-xl border border-border/60 bg-background/70 px-3 py-3 text-sm transition-colors hover:bg-muted/40"
          >
            <span className="font-medium">{entry.title ?? href}</span>
            <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
          </a>
        );
      })}
    </div>
  );
}

export function ProcedureEditorialBlockRenderer({ block, procedure, allProcedures }: Props) {
  const derivedDrugs = collectCitedDrugs(procedure.content);
  const derivedTechniques = collectCitedTechniques(procedure.content);
  const blockAttachments = attachmentItems(block, procedure.attachments);

  switch (block.type) {
    case "summary":
      return (
        <BlockShell icon={<NotebookPen className="h-4 w-4" />} title={block.title} label={block.label}>
          <div className="grid gap-2 md:grid-cols-2">
            {stringItems(block.items).map((item) => (
              <div key={item} className="rounded-xl border border-emerald-200/70 bg-emerald-50/80 px-3 py-3 text-sm leading-6 text-emerald-950">
                {item}
              </div>
            ))}
          </div>
          {renderParagraphs(block.content)}
        </BlockShell>
      );

    case "warning":
      return (
        <BlockShell icon={<TriangleAlert className="h-4 w-4" />} title={block.title} label={block.label}>
          <div className="rounded-xl border border-amber-200/70 bg-amber-50/80 px-4 py-4">
            <ul className="space-y-2 text-sm leading-6 text-amber-950">
              {stringItems(block.items).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            {renderParagraphs(block.content, "space-y-3 pt-3 text-sm leading-7 text-amber-950")}
          </div>
        </BlockShell>
      );

    case "checklist":
      return (
        <BlockShell icon={<Stethoscope className="h-4 w-4" />} title={block.title} label={block.label}>
          <Checklist items={stringItems(block.items)} />
        </BlockShell>
      );

    case "diagram":
      return (
        <BlockShell icon={<Network className="h-4 w-4" />} title={block.title} label={block.label}>
          {block.content ? <MermaidDiagram chart={block.content} /> : null}
        </BlockShell>
      );

    case "cheatsheet":
      return (
        <BlockShell icon={<Siren className="h-4 w-4" />} title={block.title} label={block.label}>
          <div className="grid gap-2 md:grid-cols-2">
            {stringItems(block.items).map((item) => (
              <div key={item} className="rounded-xl border border-border/60 bg-background/80 px-3 py-3 text-sm leading-6">
                {item}
              </div>
            ))}
          </div>
          {renderParagraphs(block.content)}
        </BlockShell>
      );

    case "attachment-group":
      return (
        <BlockShell icon={<Paperclip className="h-4 w-4" />} title={block.title} label={block.label}>
          <div className="grid gap-3">
            {blockAttachments.map((item) => {
              const href = item.href ?? item.localPath ?? "#";
              return (
                <a
                  key={`${item.title ?? href}-${href}`}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between rounded-xl border border-border/60 bg-background/80 px-3 py-3 transition-colors hover:bg-muted/30"
                >
                  <div>
                    <p className="text-sm font-medium">{item.title ?? filenameFromPath(href)}</p>
                    {item.description ? <p className="mt-1 text-xs text-muted-foreground">{item.description}</p> : null}
                  </div>
                  <div className="flex items-center gap-2">
                    {item.kind ? <Badge variant="secondary">{item.kind.toUpperCase()}</Badge> : null}
                    <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </a>
              );
            })}
          </div>
        </BlockShell>
      );

    case "image-gallery":
      return (
        <BlockShell icon={<GalleryVerticalEnd className="h-4 w-4" />} title={block.title} label={block.label}>
          <div className="grid gap-4 md:grid-cols-2">
            {blockAttachments
              .filter((item) => (item.kind ?? "image") === "image")
              .map((item) => {
                const src = item.href ?? item.localPath ?? "";
                return (
                  <figure key={`${item.title ?? src}-${src}`} className="overflow-hidden rounded-xl border border-border/60 bg-background/80">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt={item.title ?? "Imagen clínica"} className="h-auto w-full object-cover" />
                    <figcaption className="border-t border-border/60 px-3 py-2 text-xs text-muted-foreground">
                      {item.title ?? filenameFromPath(src)}
                    </figcaption>
                  </figure>
                );
              })}
          </div>
        </BlockShell>
      );

    case "cited-drugs": {
      const drugs = stringItems(block.items).length > 0 ? stringItems(block.items) : derivedDrugs;
      if (!drugs.length) return null;

      return (
        <BlockShell icon={<Pill className="h-4 w-4" />} title={block.title} label={block.label}>
          <div className="flex flex-wrap gap-2">
            {drugs.map((drug) => (
              <Link
                key={drug}
                href={`/vademecum?q=${encodeURIComponent(drug)}`}
                className="inline-flex items-center rounded-full border border-border/60 bg-background px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted/40"
              >
                {drug}
              </Link>
            ))}
          </div>
        </BlockShell>
      );
    }

    case "cited-techniques": {
      const techniques = stringItems(block.items).length > 0 ? stringItems(block.items) : derivedTechniques;
      if (!techniques.length) return null;

      return (
        <BlockShell icon={<Stethoscope className="h-4 w-4" />} title={block.title} label={block.label}>
          <div className="flex flex-wrap gap-2">
            {techniques.map((technique) => (
              <span
                key={technique}
                className="inline-flex rounded-full border border-border/60 bg-background px-3 py-1.5 text-sm"
              >
                {technique}
              </span>
            ))}
          </div>
        </BlockShell>
      );
    }

    case "related-links":
      return (
        <BlockShell icon={<Network className="h-4 w-4" />} title={block.title} label={block.label}>
          <RelatedLinks items={block.items} procedures={allProcedures} />
        </BlockShell>
      );

    case "editorial-note":
      return (
        <BlockShell icon={<FileText className="h-4 w-4" />} title={block.title} label={block.label}>
          {renderParagraphs(block.content)}
        </BlockShell>
      );

    default:
      return null;
  }
}

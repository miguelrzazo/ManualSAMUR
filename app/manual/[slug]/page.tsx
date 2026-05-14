import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getAdjacentProcedures,
  getAllProcedures,
  getBacklinkProcedures,
  getProcedureBySlug,
  getProcedureMeta,
  getRelatedProcedures,
  getSuggestedProcedures,
} from "@/lib/content";
import {
  groupProcedureEditorialBlocks,
  splitProcedureContentSections,
} from "@/lib/manual-data";
import { MDXRemote } from "next-mdx-remote/rsc";
import { GraficaLocal } from "@/components/manual/GraficaLocal";
import { Badge } from "@/components/ui/badge";
import {
  Calendar,
  ExternalLink,
  GitBranch,
  Link2,
  Network,
} from "lucide-react";
import { ProcedureLinkCard } from "@/components/manual/ProcedureLinkCard";
import { ProcedureVisitTracker } from "@/components/manual/ProcedureVisitTracker";
import { FavoriteButton } from "@/components/manual/FavoriteButton";
import { PrintButton } from "@/components/manual/PrintButton";
import {
  AlgoritmoLabel,
  Caution,
  Checklist,
  Collapsible,
  Diagram,
  DrugLink,
  ImageWithLightbox,
  KeyPoints,
  MermaidDiagram,
  Note,
  Step,
  Steps,
  Warning,
} from "@/components/manual/mdx-extras";
import { TableOfContents } from "@/components/manual/TableOfContents";
import { Breadcrumbs } from "@/components/manual/Breadcrumbs";
import { ProcedureNav } from "@/components/manual/ProcedureNav";
import { ProcedureEditorialBlockRenderer } from "@/components/manual/ProcedureEditorialBlock";
import { ProcedureAttachments } from "@/components/manual/ProcedureAttachments";
import { ProcedureReferences } from "@/components/manual/ProcedureReferences";
import { ContentDiff } from "@/components/manual/ContentDiff";
import type { ComponentPropsWithoutRef } from "react";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import type { ProcedureRelation } from "@/lib/manual-data";
import { readManualUpdatesDataset } from "@/lib/manual-sync";
import { toCapitalCase } from "@/lib/title-case";
import { buildManualRelationsIndex } from "@/lib/manual-relations-index";
import { getCodeReferenceSources } from "@/lib/manual-reference-data";
import vademecumData from "@/content/data/vademecum.json";

interface Props {
  params: Promise<{ slug: string }>;
}

const mdxComponents = {
  a: ({ href = "", children, ...props }: ComponentPropsWithoutRef<"a">) => {
    if (!href || href === "#") {
      return <span className="font-medium text-foreground">{children}</span>;
    }

    if (href.startsWith("/manual/")) {
      return (
        <Link href={href} className="font-medium text-primary no-underline hover:underline">
          {children}
        </Link>
      );
    }

    return (
      <a
        {...props}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-primary no-underline hover:underline inline-flex items-center gap-0.5"
      >
        {children}
        <ExternalLink className="h-3 w-3 opacity-60 flex-shrink-0" />
      </a>
    );
  },
  img: ({ src, alt }: ComponentPropsWithoutRef<"img">) =>
    typeof src === "string" && src ? <ImageWithLightbox src={src} alt={alt} /> : null,
  table: ({ children }: ComponentPropsWithoutRef<"table">) => (
    <div className="my-6 overflow-x-auto rounded-xl border border-border/60">
      <table className="w-full min-w-[560px]">{children}</table>
    </div>
  ),
  hr: () => <hr className="my-8 border-border/60" />,
  AlgoritmoLabel,
  KeyPoints,
  Warning,
  Caution,
  Note,
  Steps,
  Step,
  Checklist,
  Diagram,
  Collapsible,
  MermaidDiagram,
  DrugLink,
};

export async function generateStaticParams() {
  const procedures = getAllProcedures();
  return procedures.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const procedure = getProcedureBySlug(slug);
  if (!procedure) return {};
  return {
    title: `${procedure.title} — SAMUR Manual`,
    description: `Procedimiento ${procedure.id}: ${procedure.title}`,
  };
}

export default async function ProcedurePage({ params }: Props) {
  const { slug } = await params;
  const procedure = getProcedureBySlug(slug);
  if (!procedure) notFound();

  const related = getRelatedProcedures(procedure);
  const backlinks = getBacklinkProcedures(procedure);
  const suggested = getSuggestedProcedures(procedure);
  const allProcedures = getProcedureMeta();
  const procedureReferenceEntry = buildManualRelationsIndex({
    procedures: [procedure],
    drugs: vademecumData,
    codes: getCodeReferenceSources(),
  }).procedures[procedure.id];
  const drugById = new Map((vademecumData as Array<{ id: string; name: string; category?: string }>).map((drug) => [drug.id, drug]));
  const citedDrugs = (procedureReferenceEntry?.drugIds ?? [])
    .map((id) => drugById.get(id))
    .filter((drug): drug is { id: string; name: string; category?: string } => Boolean(drug));
  const updateEvents = readManualUpdatesDataset().events
    .filter((event) => event.procedureIds.includes(procedure.id))
    .sort((a, b) => `${b.effectiveDate}|${b.approvedAt ?? ""}`.localeCompare(`${a.effectiveDate}|${a.approvedAt ?? ""}`));
  const { prev, next } = getAdjacentProcedures(procedure.id);
  const hasEditorialBlocks = procedure.editorialBlocks.length > 0;
  const procedureSections = hasEditorialBlocks ? splitProcedureContentSections(procedure.content) : [];
  const groupedEditorialBlocks = hasEditorialBlocks
    ? groupProcedureEditorialBlocks(procedure.editorialBlocks, procedureSections)
    : null;

  if (
    groupedEditorialBlocks
    && groupedEditorialBlocks.unresolvedIds.length > 0
    && process.env.NODE_ENV !== "production"
  ) {
    console.warn(
      `[manual] unresolved editorial blocks for ${procedure.id}: ${groupedEditorialBlocks.unresolvedIds.join(", ")}`,
    );
  }

  const SECTION_COLORS: Record<string, string> = {
    DRP: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
    Intervinientes: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300",
    Administrativos: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    Comunicaciones: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
    Operativos: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
    SVA: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
    SVB: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    "Psicológicos": "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
    Técnicas: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300",
  };
  const relationsByProcedureId = procedure.relations.reduce<Record<string, ProcedureRelation[]>>((acc, relation) => {
    acc[relation.id] ??= [];
    acc[relation.id].push(relation);
    return acc;
  }, {});
  const previewByProcedureId = allProcedures.reduce<Record<string, string>>((acc, item) => {
    const text = item.searchText.replace(/\s+/g, " ").trim();
    acc[item.id] = text.length > 260 ? `${text.slice(0, 257).trim()}...` : text;
    return acc;
  }, {});
  const hasGraphData = related.length > 0 || backlinks.length > 0 || suggested.length > 0;

  return (
    <div className="mx-auto flex max-w-7xl gap-5 px-4 py-4 md:px-6 md:py-6">
      <ProcedureVisitTracker
        procedureId={procedure.id}
        validIds={allProcedures.map((item) => item.id)}
      />
      {/* Main content */}
      <article id="procedure-content" className="min-w-0 flex-1 max-w-4xl">
        <Breadcrumbs
          section={procedure.section}
          group={procedure.sidebarGroup}
          subgroup={procedure.sidebarSubgroup}
        />
        {/* Header */}
        <div className="mb-5 rounded-lg border border-border/60 bg-card/50 p-4 md:p-5">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="font-mono text-sm text-muted-foreground">{procedure.id}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${SECTION_COLORS[procedure.section] ?? "bg-muted text-muted-foreground"}`}>
              {toCapitalCase(procedure.section)}
            </span>
            {procedure.updated && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Calendar className="h-3 w-3" />
                Rev. {procedure.updated}
              </span>
            )}
            {procedure.sourceUpdated && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Calendar className="h-3 w-3" />
                Sync {procedure.sourceUpdated}
              </span>
            )}
          </div>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight leading-tight mb-3">{procedure.title}</h1>
              {procedure.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {procedure.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-xs font-normal">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <PrintButton />
              <FavoriteButton
                procedureId={procedure.id}
                validIds={allProcedures.map((item) => item.id)}
                className="h-9 w-9 p-0"
              />
            </div>
          </div>
        </div>


        {updateEvents.length > 0 && (
          <details id={`procedure-updates-${procedure.id}`} open className="mb-5 rounded-lg border border-border/60 bg-card/40 p-4">
            <summary className="cursor-pointer text-sm font-semibold">Histórico De Actualizaciones Del Procedimiento</summary>
            <div className="mt-3 grid gap-2">
              {updateEvents.map((event) => (
                <div
                  key={event.eventId}
                  id={`update-${event.eventId}`}
                  className={`rounded-lg border px-3 py-2 text-xs ${event.isNewThisWeek ? "border-red-300/70 bg-red-50/60 dark:border-red-900/40 dark:bg-red-950/20" : "border-border/50 bg-background/60"}`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{event.effectiveDate}</span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">{event.changeKind}</span>
                    {event.isNewThisWeek && (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] uppercase tracking-wide text-red-700 dark:bg-red-900/30 dark:text-red-300">
                        Nuevo 7 días
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-foreground/90">{event.summary}</p>
                  {event.officialUrl && (
                    <a href={event.officialUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex text-xs text-primary hover:underline">
                      Ver referencia oficial
                    </a>
                  )}
                </div>
              ))}
            </div>
          </details>
        )}

        {/* Incomplete content warning — when body is very short */}
        {procedure.content.trim().length < 350 && (
          <div className="mb-4 rounded-lg border border-amber-200/70 bg-amber-50/60 dark:border-amber-800/40 dark:bg-amber-950/20 px-4 py-3 flex flex-wrap items-start gap-3" data-print-hide>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Contenido pendiente de sincronización</p>
              <p className="text-xs text-amber-700/80 dark:text-amber-400/80 mt-0.5">El cuerpo de este procedimiento no se importó correctamente desde el wiki oficial. Los anexos PDF están disponibles abajo.</p>
            </div>
            {procedure.source && (
              <a
                href={procedure.source}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-shrink-0 inline-flex items-center gap-1.5 rounded-full bg-amber-100 dark:bg-amber-900/40 border border-amber-200/80 dark:border-amber-700/40 px-3 py-1.5 text-xs font-medium text-amber-800 dark:text-amber-300 hover:bg-amber-200/60 transition-colors"
              >
                <ExternalLink className="h-3 w-3" />
                Ver en wiki oficial
              </a>
            )}
          </div>
        )}

        {/* Recent update badge — only when event < 30 days */}
        {(() => {
          const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
          const recent = updateEvents.find((e) => e.effectiveDate >= cutoff);
          if (!recent) return null;
          return (
            <ContentDiff
              changeKind={recent.changeKind as "nuevo" | "revisado" | "actualizado" | "sync"}
              changedAt={recent.effectiveDate}
              summary={recent.summary}
              diff={recent.diff}
            />
          );
        })()}

        {/* Mobile TOC — collapsible, below header */}
        <div className="lg:hidden mb-4" data-print-hide>
          <TableOfContents articleId="procedure-content" pageTitle={procedure.title} collapsible />
        </div>

        {/* MDX Content */}
        <div data-manual-body id="procedure-content" className="prose prose-sm md:prose-base dark:prose-invert max-w-none rounded-2xl border border-border/60 bg-background/70 px-4 py-6 md:px-8 md:py-8
          prose-headings:font-bold prose-headings:tracking-tight prose-headings:scroll-mt-24
          prose-h2:text-[1.75rem] md:prose-h2:text-[2.1rem] prose-h2:mt-12 prose-h2:mb-5 prose-h2:border-b-2 prose-h2:border-primary/25 prose-h2:pb-3 prose-h2:leading-snug prose-h2:text-foreground
          prose-h3:text-[1.2rem] md:prose-h3:text-[1.4rem] prose-h3:mt-9 prose-h3:mb-3 prose-h3:text-foreground/85 prose-h3:font-semibold prose-h3:leading-snug
          prose-h4:text-[1rem] md:prose-h4:text-[1.1rem] prose-h4:mt-7 prose-h4:mb-2 prose-h4:font-semibold prose-h4:text-foreground/75
          prose-h5:text-[0.9rem] prose-h5:mt-5 prose-h5:mb-1.5 prose-h5:font-medium prose-h5:text-foreground/65
          prose-p:leading-7 prose-p:text-foreground/90 prose-p:my-4
          prose-a:text-primary prose-a:no-underline hover:prose-a:underline
          prose-img:mx-auto prose-img:block prose-img:rounded-xl prose-img:border prose-img:border-border/60 prose-img:shadow-sm prose-img:my-6
          prose-figure:my-10
          [&_table]:text-sm [&_table]:my-8 [&_table]:w-full [&_table]:border [&_table]:border-border/50 [&_table]:rounded-xl [&_table]:overflow-hidden
          [&_thead]:bg-muted/60
          [&_th]:px-3 [&_th]:py-2.5 [&_th]:font-semibold [&_th]:text-left [&_th]:border-b [&_th]:border-border/60
          [&_td]:px-3 [&_td]:py-2
          [&_tr]:border-b [&_tr]:border-border/30 [&_tbody_tr:last-child]:border-0
          [&_tbody_tr:nth-child(even)]:bg-muted/20
          prose-code:text-primary prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:font-mono
          prose-pre:bg-muted prose-pre:border prose-pre:border-border/60 prose-pre:rounded-xl
          prose-blockquote:border-l-4 prose-blockquote:border-primary/40 prose-blockquote:bg-muted/40 prose-blockquote:rounded-r-xl prose-blockquote:px-4 prose-blockquote:py-2 prose-blockquote:not-italic
          [&_ul]:my-5 [&_ul]:list-disc [&_ul]:pl-7 [&_ol]:my-5 [&_ol]:list-decimal [&_ol]:pl-7
          [&_li]:leading-7 [&_li]:my-1.5 [&_li]:text-foreground/90
          [&_li>ul]:mt-1.5 [&_li>ol]:mt-1.5
          [&_hr]:my-8 [&_hr]:border-border/50
        ">
          {groupedEditorialBlocks ? (
            <>
              {procedureSections.map((section) => (
                <div key={section.key}>
                  {groupedEditorialBlocks.bySection[section.key]?.before.map((block) => (
                    <ProcedureEditorialBlockRenderer
                      key={block.id}
                      block={block}
                      procedure={procedure}
                      allProcedures={allProcedures}
                    />
                  ))}
                  {section.content ? (
                    <MDXRemote
                      source={section.content}
                      components={mdxComponents}
                      options={{ mdxOptions: { remarkPlugins: [remarkGfm], rehypePlugins: [rehypeSlug] } }}
                    />
                  ) : null}
                  {groupedEditorialBlocks.bySection[section.key]?.after.map((block) => (
                    <ProcedureEditorialBlockRenderer
                      key={block.id}
                      block={block}
                      procedure={procedure}
                      allProcedures={allProcedures}
                    />
                  ))}
                </div>
              ))}
              {groupedEditorialBlocks.afterAll.map((block) => (
                <ProcedureEditorialBlockRenderer
                  key={block.id}
                  block={block}
                  procedure={procedure}
                  allProcedures={allProcedures}
                />
              ))}
            </>
          ) : (
            <MDXRemote
              source={procedure.content}
              components={mdxComponents}
              options={{ mdxOptions: { remarkPlugins: [remarkGfm], rehypePlugins: [rehypeSlug] } }}
            />
          )}
        </div>

        {/* Source link */}
        {procedure.source && (
          <div className="mt-8 pt-4 border-t border-border/40">
            <a
              href={procedure.source}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ExternalLink className="h-3 w-3" />
              Ver fuente oficial en servpub.madrid.es
            </a>
          </div>
        )}

        {procedure.attachments.length > 0 ? <ProcedureAttachments attachments={procedure.attachments} /> : null}

        <ProcedureNav prev={prev} next={next} />

        <div className="mt-8 grid gap-4 lg:hidden" data-print-hide>
          {backlinks.length > 0 && (
            <ProcedureLinkCard
              title="Enlazado desde"
              icon={<GitBranch className="h-3.5 w-3.5" />}
              procedures={backlinks}
              relationsByProcedureId={relationsByProcedureId}
              previewByProcedureId={previewByProcedureId}
              emptyLabel="Ningún otro artículo enlaza aquí"
            />
          )}
          {related.length > 0 && (
            <ProcedureLinkCard
              title="Enlaces salientes"
              icon={<Link2 className="h-3.5 w-3.5" />}
              procedures={related}
              relationsByProcedureId={relationsByProcedureId}
              previewByProcedureId={previewByProcedureId}
            />
          )}
          {suggested.length > 0 && (
            <ProcedureLinkCard
              title="Relacionados sugeridos"
              icon={<Network className="h-3.5 w-3.5" />}
              procedures={suggested}
              relationsByProcedureId={relationsByProcedureId}
              previewByProcedureId={previewByProcedureId}
              emptyLabel="Sin Sugerencias Conservadoras Para Ampliar La Red De Esta Nota"
            />
          )}
          {hasGraphData && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Network className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold text-muted-foreground">Gráfica De Conexiones</h3>
              </div>
              <GraficaLocal current={procedure} related={related} backlinks={backlinks} suggested={suggested} />
            </div>
          )}
        </div>
      </article>

      {/* Right sidebar — desktop only */}
      <aside className="hidden lg:flex flex-col gap-4 w-72 flex-shrink-0 pt-0" data-print-hide>
        <div className="sticky top-6 flex flex-col gap-4 pb-4">
          <TableOfContents articleId="procedure-content" pageTitle={procedure.title} />
          {backlinks.length > 0 && (
            <ProcedureLinkCard
              title="Enlazado desde"
              icon={<GitBranch className="h-3.5 w-3.5" />}
              procedures={backlinks}
              relationsByProcedureId={relationsByProcedureId}
              previewByProcedureId={previewByProcedureId}
              emptyLabel="Ningún otro artículo enlaza aquí"
            />
          )}
          {related.length > 0 && (
            <ProcedureLinkCard
              title="Ver también"
              icon={<Link2 className="h-3.5 w-3.5" />}
              procedures={related}
              relationsByProcedureId={relationsByProcedureId}
              previewByProcedureId={previewByProcedureId}
            />
          )}
          {suggested.length > 0 && (
            <ProcedureLinkCard
              title="Sugeridos"
              icon={<Network className="h-3.5 w-3.5" />}
              procedures={suggested}
              relationsByProcedureId={relationsByProcedureId}
              previewByProcedureId={previewByProcedureId}
              emptyLabel="Sin Sugerencias Conservadoras Para Ampliar La Red De Esta Nota"
            />
          )}
          {hasGraphData && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Network className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold text-muted-foreground">Gráfica Local</h3>
              </div>
              <GraficaLocal current={procedure} related={related} backlinks={backlinks} suggested={suggested} />
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

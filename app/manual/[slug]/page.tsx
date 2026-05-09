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
import type { ComponentPropsWithoutRef } from "react";
import rehypeSlug from "rehype-slug";
import type { ProcedureRelation } from "@/lib/manual-data";

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
    typeof src === "string" && src && !src.startsWith("../") ? (
      <ImageWithLightbox src={src} alt={alt} />
    ) : null,
  table: ({ children }: ComponentPropsWithoutRef<"table">) => (
    <div className="my-6 overflow-x-auto rounded-xl border border-border/60">
      <table className="w-full min-w-[560px]">{children}</table>
    </div>
  ),
  hr: () => <hr className="my-8 border-border/60" />,
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
  const hasGraphData = related.length > 0 || backlinks.length > 0 || suggested.length > 0;

  return (
    <div className="flex gap-6 px-4 md:px-6 py-6 md:py-8 max-w-7xl mx-auto">
      <ProcedureVisitTracker
        procedureId={procedure.id}
        validIds={allProcedures.map((item) => item.id)}
      />
      {/* Main content */}
      <article id="procedure-content" className="flex-1 min-w-0 max-w-3xl">
        <Breadcrumbs
          section={procedure.section}
          group={procedure.sidebarGroup}
          subgroup={procedure.sidebarSubgroup}
        />
        {/* Header */}
        <div className="mb-8 rounded-2xl border border-border/60 bg-card/50 p-5 md:p-6">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="font-mono text-sm text-muted-foreground">{procedure.id}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${SECTION_COLORS[procedure.section] ?? "bg-muted text-muted-foreground"}`}>
              {procedure.section}
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
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight mb-3">{procedure.title}</h1>
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

        {/* Mobile TOC — collapsible, below header */}
        <div className="lg:hidden mb-4" data-print-hide>
          <TableOfContents articleId="procedure-content" pageTitle={procedure.title} collapsible />
        </div>

        {/* MDX Content */}
        <div data-manual-body className="prose prose-sm md:prose-base dark:prose-invert max-w-none rounded-2xl border border-border/60 bg-background/70 px-5 py-5 md:px-8 md:py-7
          prose-headings:font-semibold prose-headings:tracking-tight
          prose-h2:text-xl prose-h2:mt-9 prose-h2:mb-4 prose-h2:border-b prose-h2:border-border/60 prose-h2:pb-2
          prose-h3:text-[1.05rem] prose-h3:mt-7 prose-h3:mb-2 prose-h3:text-foreground/90
          prose-p:leading-7 prose-p:text-foreground/90 prose-p:my-4
          prose-a:text-primary prose-a:no-underline hover:prose-a:underline
          prose-img:mx-auto prose-img:block prose-img:rounded-xl prose-img:border prose-img:border-border/60 prose-img:shadow-sm
          prose-figure:my-8
          prose-table:text-sm
          prose-thead:bg-muted/50
          prose-th:px-3 prose-th:py-2 prose-th:font-semibold prose-th:text-left
          prose-td:px-3 prose-td:py-2
          prose-tr:border-b prose-tr:border-border/40
          prose-code:text-primary prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-xs
          prose-pre:bg-muted prose-pre:border prose-pre:border-border/60
          prose-blockquote:border-l-primary prose-blockquote:bg-muted/40 prose-blockquote:rounded-r-md prose-blockquote:px-4 prose-blockquote:py-2
          prose-ul:my-6 prose-ul:list-disc prose-ul:pl-5 prose-ol:my-6 prose-ol:list-decimal prose-ol:pl-5 prose-li:leading-7 prose-li:my-2 prose-li:marker:text-muted-foreground
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
                      options={{ mdxOptions: { rehypePlugins: [rehypeSlug] } }}
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
              options={{ mdxOptions: { rehypePlugins: [rehypeSlug] } }}
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
              emptyLabel="Ningún otro artículo enlaza aquí"
            />
          )}
          <ProcedureLinkCard
            title="Enlaces salientes"
            icon={<Link2 className="h-3.5 w-3.5" />}
            procedures={related}
            relationsByProcedureId={relationsByProcedureId}
            emptyLabel="Este artículo todavía no enlaza de forma explícita a otros procedimientos"
          />
          {suggested.length > 0 && (
            <ProcedureLinkCard
              title="Relacionados sugeridos"
              icon={<Network className="h-3.5 w-3.5" />}
              procedures={suggested}
              relationsByProcedureId={relationsByProcedureId}
              emptyLabel="Sin sugerencias conservadoras para ampliar la red de esta nota"
            />
          )}
          {hasGraphData && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Network className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold text-muted-foreground">Gráfica de conexiones</h3>
              </div>
              <GraficaLocal current={procedure} related={related} backlinks={backlinks} suggested={suggested} />
            </div>
          )}
        </div>
      </article>

      {/* Right sidebar — desktop only */}
      <aside className="hidden lg:flex flex-col gap-4 w-72 flex-shrink-0 pt-0" data-print-hide>
        <div className="sticky top-6 flex flex-col gap-4 max-h-[calc(100vh-3rem)] overflow-y-auto pb-4">
          <TableOfContents articleId="procedure-content" pageTitle={procedure.title} />
          {backlinks.length > 0 && (
            <ProcedureLinkCard
              title="Enlazado desde"
              icon={<GitBranch className="h-3.5 w-3.5" />}
              procedures={backlinks}
              relationsByProcedureId={relationsByProcedureId}
              emptyLabel="Ningún otro artículo enlaza aquí"
            />
          )}
          <ProcedureLinkCard
            title="Ver también"
            icon={<Link2 className="h-3.5 w-3.5" />}
            procedures={related}
            relationsByProcedureId={relationsByProcedureId}
            emptyLabel="Este artículo todavía no enlaza de forma explícita a otros procedimientos"
          />
          {suggested.length > 0 && (
            <ProcedureLinkCard
              title="Sugeridos"
              icon={<Network className="h-3.5 w-3.5" />}
              procedures={suggested}
              relationsByProcedureId={relationsByProcedureId}
              emptyLabel="Sin sugerencias conservadoras para ampliar la red de esta nota"
            />
          )}
          {hasGraphData && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Network className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold text-muted-foreground">Gráfica local</h3>
              </div>
              <GraficaLocal current={procedure} related={related} backlinks={backlinks} suggested={suggested} />
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

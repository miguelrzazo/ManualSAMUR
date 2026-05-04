import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getAllProcedures,
  getBacklinkProcedures,
  getProcedureBySlug,
  getProcedureMeta,
  getRelatedProcedures,
} from "@/lib/content";
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
  Diagram,
  KeyPoints,
  Note,
  Step,
  Steps,
  Warning,
} from "@/components/manual/mdx-extras";
import type { ComponentPropsWithoutRef } from "react";

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
  img: ({ src, alt, ...props }: ComponentPropsWithoutRef<"img">) =>
    typeof src === "string" && src && !src.startsWith("../") ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt ?? ""}
        className="rounded-xl border border-border/60 my-6 max-w-full h-auto mx-auto"
        {...props}
      />
    ) : null,
  hr: () => <hr className="my-8 border-border/60" />,
  KeyPoints,
  Warning,
  Caution,
  Note,
  Steps,
  Step,
  Checklist,
  Diagram,
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
  const allProcedures = getProcedureMeta();

  const SECTION_COLORS: Record<string, string> = {
    Administrativos: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    Comunicaciones: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
    Operativos: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
    SVA: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
    SVB: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    "Psicológicos": "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
    Técnicas: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300",
  };

  return (
    <div className="flex gap-6 px-4 md:px-6 py-6 md:py-8 max-w-7xl mx-auto">
      <ProcedureVisitTracker
        procedureId={procedure.id}
        validIds={allProcedures.map((item) => item.id)}
      />
      {/* Main content */}
      <article className="flex-1 min-w-0 max-w-3xl">
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
                {procedure.updated}
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

        {/* MDX Content */}
        <div className="prose prose-sm md:prose-base dark:prose-invert max-w-none rounded-2xl border border-border/60 bg-background/70 px-5 py-5 md:px-8 md:py-7
          prose-headings:font-semibold prose-headings:tracking-tight
          prose-h2:text-xl prose-h2:mt-10 prose-h2:mb-5 prose-h2:border-b prose-h2:border-border/60 prose-h2:pb-2
          prose-h3:text-[1.05rem] prose-h3:mt-8 prose-h3:mb-3 prose-h3:text-foreground/80
          prose-p:leading-8 prose-p:text-foreground/90 prose-p:my-5
          prose-a:text-primary prose-a:no-underline hover:prose-a:underline
          prose-table:text-sm
          prose-table:block prose-table:w-full prose-table:overflow-x-auto
          prose-thead:bg-muted/50
          prose-th:px-3 prose-th:py-2 prose-th:font-semibold prose-th:text-left
          prose-td:px-3 prose-td:py-2
          prose-tr:border-b prose-tr:border-border/40
          prose-code:text-primary prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-xs
          prose-pre:bg-muted prose-pre:border prose-pre:border-border/60
          prose-blockquote:border-l-primary prose-blockquote:bg-muted/40 prose-blockquote:rounded-r-md prose-blockquote:py-2
          prose-ul:my-6 prose-ol:my-6 prose-li:leading-7 prose-li:my-2
        ">
          <MDXRemote source={procedure.content} components={mdxComponents} />
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
              Ver fuente original en samurpc.net
            </a>
          </div>
        )}

        {/* Graph — visible on mobile too, below content */}
        {(related.length > 0 || backlinks.length > 0) && (
          <div className="mt-8 lg:hidden" data-print-hide>
            <div className="flex items-center gap-2 mb-3">
              <Network className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-muted-foreground">Gráfica de conexiones</h3>
            </div>
            <GraficaLocal current={procedure} related={related} backlinks={backlinks} />
            <div className="mt-4 grid gap-4">
              <ProcedureLinkCard
                title="Enlaces entrantes"
                icon={<GitBranch className="h-3.5 w-3.5" />}
                procedures={backlinks}
                emptyLabel="Ningún otro artículo enlaza aquí"
              />
              <ProcedureLinkCard
                title="Relacionados"
                icon={<Link2 className="h-3.5 w-3.5" />}
                procedures={related}
              />
            </div>
          </div>
        )}
      </article>

      {/* Right sidebar — desktop only */}
      {(related.length > 0 || backlinks.length > 0) && (
        <aside className="hidden lg:flex flex-col gap-4 w-72 flex-shrink-0 pt-0" data-print-hide>
          <div className="sticky top-6 flex flex-col gap-4">
            <ProcedureLinkCard
              title="Enlaces entrantes"
              icon={<GitBranch className="h-3.5 w-3.5" />}
              procedures={backlinks}
              emptyLabel="Ningún otro artículo enlaza aquí"
            />
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Network className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold text-muted-foreground">Gráfica local</h3>
              </div>
              <GraficaLocal current={procedure} related={related} backlinks={backlinks} />
            </div>
            <ProcedureLinkCard
              title="Relacionados"
              icon={<Link2 className="h-3.5 w-3.5" />}
              procedures={related}
            />
          </div>
        </aside>
      )}
    </div>
  );
}

import { notFound } from "next/navigation";
import { getAllProcedures, getProcedureBySlug, getRelatedProcedures } from "@/lib/content";
import { MDXRemote } from "next-mdx-remote/rsc";
import { RelatedCard } from "@/components/manual/RelatedCard";
import { GraficaLocal } from "@/components/manual/GraficaLocal";
import { Badge } from "@/components/ui/badge";
import { Calendar, ExternalLink, Network } from "lucide-react";

interface Props {
  params: Promise<{ slug: string }>;
}

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
    <div className="flex gap-6 px-4 md:px-8 py-8 max-w-6xl mx-auto">
      {/* Main content */}
      <article className="flex-1 min-w-0">
        {/* Header */}
        <div className="mb-8">
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

        {/* MDX Content */}
        <div className="prose prose-sm md:prose-base dark:prose-invert max-w-none
          prose-headings:font-semibold prose-headings:tracking-tight
          prose-h2:text-lg prose-h2:mt-8 prose-h2:mb-3 prose-h2:border-b prose-h2:border-border/60 prose-h2:pb-2
          prose-h3:text-base prose-h3:mt-6 prose-h3:mb-2
          prose-p:leading-relaxed prose-p:text-foreground/90
          prose-a:text-primary prose-a:no-underline hover:prose-a:underline
          prose-table:text-sm
          prose-thead:bg-muted/50
          prose-th:px-3 prose-th:py-2 prose-th:font-semibold prose-th:text-left
          prose-td:px-3 prose-td:py-2
          prose-tr:border-b prose-tr:border-border/40
          prose-code:text-primary prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-xs
          prose-pre:bg-muted prose-pre:border prose-pre:border-border/60
          prose-blockquote:border-l-primary prose-blockquote:bg-muted/40 prose-blockquote:rounded-r-md prose-blockquote:py-2
          prose-li:leading-relaxed
        ">
          <MDXRemote source={procedure.content} />
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
        {related.length > 0 && (
          <div className="mt-8 lg:hidden">
            <div className="flex items-center gap-2 mb-3">
              <Network className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-muted-foreground">Gráfica de conexiones</h3>
            </div>
            <GraficaLocal current={procedure} related={related} />
            <div className="mt-4">
              <RelatedCard related={related} />
            </div>
          </div>
        )}
      </article>

      {/* Right sidebar — desktop only */}
      {related.length > 0 && (
        <aside className="hidden lg:flex flex-col gap-4 w-64 flex-shrink-0 pt-0">
          <div className="sticky top-6 flex flex-col gap-4">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Network className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold text-muted-foreground">Gráfica local</h3>
              </div>
              <GraficaLocal current={procedure} related={related} />
            </div>
            <RelatedCard related={related} />
          </div>
        </aside>
      )}
    </div>
  );
}

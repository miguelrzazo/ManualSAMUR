import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ProcedureMeta } from "@/lib/content";
import type { ProcedureRelation } from "@/lib/manual-data";

const SECTION_COLORS: Record<string, string> = {
  Administrativos: "text-slate-500",
  Comunicaciones: "text-violet-500",
  Operativos: "text-amber-500",
  SVA: "text-red-500",
  SVB: "text-blue-500",
  "Psicológicos": "text-emerald-500",
  Técnicas: "text-cyan-500",
  General: "text-slate-500",
};

interface Props {
  title: string;
  icon: React.ReactNode;
  procedures: ProcedureMeta[];
  emptyLabel?: string;
  relationsByProcedureId?: Record<string, ProcedureRelation[]>;
  previewByProcedureId?: Record<string, string>;
}

const RELATION_LABELS: Record<ProcedureRelation["kind"], string> = {
  editorial: "editorial",
  "content-link": "enlace",
  "safe-mention": "mención",
  suggested: "sugerido",
};

export function ProcedureLinkCard({
  title,
  icon,
  procedures,
  emptyLabel = "Sin referencias",
  relationsByProcedureId,
  previewByProcedureId,
}: Props) {
  return (
    <Card className="border-border/60">
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm font-semibold flex items-center gap-1.5 text-muted-foreground">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-2 pb-4">
        {!procedures.length ? (
          <p className="px-2 text-sm text-muted-foreground">{emptyLabel}</p>
        ) : (
          <div className="flex flex-col gap-0.5">
            {procedures.map((procedure) => {
              const relationLabels = [...new Set(
                (relationsByProcedureId?.[procedure.id] ?? []).map((relation) => RELATION_LABELS[relation.kind]),
              )];
              const preview = previewByProcedureId?.[procedure.id];

              return (
                <div key={procedure.id} className="group/preview relative">
                  <Link
                    href={`/manual/${procedure.slug}`}
                    className="group/link flex items-start gap-2 rounded-md px-2 py-2 transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <span className="text-xs font-mono text-muted-foreground/60 pt-0.5 w-12 flex-shrink-0">
                      {procedure.id}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium leading-snug transition-colors group-hover/link:text-primary">
                        {procedure.title}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                        <div className={`text-xs ${SECTION_COLORS[procedure.section] ?? "text-muted-foreground"}`}>
                          {procedure.section}
                        </div>
                        {relationLabels.map((label) => (
                          <span
                            key={`${procedure.id}-${label}`}
                            className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                          >
                            {label}
                          </span>
                        ))}
                      </div>
                    </div>
                    <ArrowRight className="h-3 w-3 text-muted-foreground/40 group-hover/link:text-primary mt-1 flex-shrink-0 transition-colors" />
                  </Link>
                  {preview && (
                    <div className="pointer-events-none absolute left-2 right-2 bottom-full z-30 mb-1 hidden rounded-lg border border-border/70 bg-popover p-3 text-xs leading-relaxed text-popover-foreground shadow-lg group-hover/preview:block group-focus-within/preview:block">
                      <div className="mb-1 font-semibold text-foreground">{procedure.title}</div>
                      <p className="line-clamp-5 text-muted-foreground">{preview}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

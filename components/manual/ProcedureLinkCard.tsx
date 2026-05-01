import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ProcedureMeta } from "@/lib/content";

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
}

export function ProcedureLinkCard({
  title,
  icon,
  procedures,
  emptyLabel = "Sin referencias",
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
            {procedures.map((procedure) => (
              <Link
                key={procedure.id}
                href={`/manual/${procedure.slug}`}
                className="flex items-start gap-2 px-2 py-2 rounded-md hover:bg-muted transition-colors group"
              >
                <span className="text-xs font-mono text-muted-foreground/60 pt-0.5 w-12 flex-shrink-0">
                  {procedure.id}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium leading-snug group-hover:text-primary transition-colors">
                    {procedure.title}
                  </div>
                  <div className={`text-xs mt-0.5 ${SECTION_COLORS[procedure.section] ?? "text-muted-foreground"}`}>
                    {procedure.section}
                  </div>
                </div>
                <ArrowRight className="h-3 w-3 text-muted-foreground/40 group-hover:text-primary mt-1 flex-shrink-0 transition-colors" />
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

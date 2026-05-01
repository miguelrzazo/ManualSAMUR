import Link from "next/link";
import { ArrowRight, Link2 } from "lucide-react";
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
  related: ProcedureMeta[];
}

export function RelatedCard({ related }: Props) {
  if (!related.length) return null;

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm font-semibold flex items-center gap-1.5 text-muted-foreground">
          <Link2 className="h-3.5 w-3.5" />
          Relacionados
        </CardTitle>
      </CardHeader>
      <CardContent className="px-2 pb-4">
        <div className="flex flex-col gap-0.5">
          {related.map((p) => (
            <Link
              key={p.id}
              href={`/manual/${p.slug}`}
              className="flex items-start gap-2 px-2 py-2 rounded-md hover:bg-muted transition-colors group"
            >
              <span className="text-xs font-mono text-muted-foreground/60 pt-0.5 w-10 flex-shrink-0">
                {p.id}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium leading-snug group-hover:text-primary transition-colors">
                  {p.title}
                </div>
                <div className={`text-xs mt-0.5 ${SECTION_COLORS[p.section] ?? "text-muted-foreground"}`}>
                  {p.section}
                </div>
              </div>
              <ArrowRight className="h-3 w-3 text-muted-foreground/40 group-hover:text-primary mt-1 flex-shrink-0 transition-colors" />
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

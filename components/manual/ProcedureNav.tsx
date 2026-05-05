import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ProcedureMeta } from "@/lib/content";

interface Props {
  prev: ProcedureMeta | null;
  next: ProcedureMeta | null;
}

export function ProcedureNav({ prev, next }: Props) {
  if (!prev && !next) return null;

  return (
    <nav className="mt-10 pt-6 border-t border-border/40 grid grid-cols-2 gap-3" aria-label="Navegación entre procedimientos" data-print-hide>
      <div>
        {prev && (
          <Link
            href={`/manual/${prev.slug}`}
            className="group flex flex-col gap-1 rounded-xl border border-border/60 bg-card/50 px-4 py-3 hover:bg-card hover:border-border transition-colors no-underline"
          >
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <ChevronLeft className="h-3.5 w-3.5" />
              Anterior
            </span>
            <span className="text-sm font-medium text-foreground leading-snug line-clamp-2 group-hover:text-primary transition-colors">
              {prev.title}
            </span>
            <span className="font-mono text-xs text-muted-foreground">{prev.id}</span>
          </Link>
        )}
      </div>
      <div className="flex justify-end">
        {next && (
          <Link
            href={`/manual/${next.slug}`}
            className="group flex flex-col gap-1 rounded-xl border border-border/60 bg-card/50 px-4 py-3 hover:bg-card hover:border-border transition-colors no-underline text-right w-full"
          >
            <span className="flex items-center gap-1 text-xs text-muted-foreground justify-end">
              Siguiente
              <ChevronRight className="h-3.5 w-3.5" />
            </span>
            <span className="text-sm font-medium text-foreground leading-snug line-clamp-2 group-hover:text-primary transition-colors">
              {next.title}
            </span>
            <span className="font-mono text-xs text-muted-foreground">{next.id}</span>
          </Link>
        )}
      </div>
    </nav>
  );
}

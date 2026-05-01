import Link from "next/link";
import { BookOpen, ArrowRight } from "lucide-react";
import { getProceduresBySection, getProcedureMeta } from "@/lib/content";
import { ManualGraphToggle } from "@/components/manual/ManualGraphToggle";

const SECTION_COLORS: Record<string, { dot: string; badge: string }> = {
  Administrativos: { dot: "bg-slate-400", badge: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
  Comunicaciones: { dot: "bg-violet-500", badge: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300" },
  Operativos: { dot: "bg-amber-500", badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
  SVA: { dot: "bg-red-500", badge: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
  SVB: { dot: "bg-blue-500", badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
  "Psicológicos": { dot: "bg-emerald-500", badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" },
  Técnicas: { dot: "bg-cyan-500", badge: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300" },
};

export default function ManualPage() {
  const proceduresBySection = getProceduresBySection();
  const allProcedures = getProcedureMeta();

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 md:py-12">
      <div className="mb-8">
        <div className="inline-flex items-center gap-2 mb-3">
          <BookOpen className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">Manual de Procedimientos</h1>
        </div>
        <p className="text-muted-foreground max-w-lg text-sm">
          Manual de SAMUR-Protección Civil. Selecciona una sección o usa la búsqueda (⌘K) para navegar.
        </p>
      </div>

      <ManualGraphToggle procedures={allProcedures}>
        <div className="grid gap-6">
          {Object.entries(proceduresBySection).map(([section, procedures]) => {
            const colors = SECTION_COLORS[section] ?? { dot: "bg-slate-400", badge: "bg-muted text-muted-foreground" };
            return (
              <div key={section}>
                <div className="flex items-center gap-2 mb-3">
                  <div className={`h-2.5 w-2.5 rounded-full ${colors.dot}`} />
                  <h2 className="font-semibold text-xs uppercase tracking-widest text-muted-foreground">{section}</h2>
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${colors.badge}`}>
                    {procedures.length}
                  </span>
                </div>
                <div className="grid gap-0.5">
                  {procedures.map((p) => (
                    <Link
                      key={p.id}
                      href={`/manual/${p.slug}`}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/50 transition-colors group"
                    >
                      <span className="font-mono text-xs text-muted-foreground/50 w-10 flex-shrink-0 tabular-nums">{p.id}</span>
                      <span className="flex-1 text-sm group-hover:text-primary transition-colors">
                        {p.title}
                      </span>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/20 group-hover:text-primary/60 transition-all group-hover:translate-x-0.5" />
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </ManualGraphToggle>
    </div>
  );
}

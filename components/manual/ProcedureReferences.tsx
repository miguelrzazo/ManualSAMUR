import Link from "next/link";
import { Hash, Pill } from "lucide-react";
import type { ManualCodeReference } from "@/lib/manual-relations-index";

interface DrugReference {
  id: string;
  name: string;
  category?: string;
}

interface Props {
  drugs: DrugReference[];
  codes: ManualCodeReference[];
}

export function ProcedureReferences({ drugs, codes }: Props) {
  if (drugs.length === 0 && codes.length === 0) return null;

  return (
    <section className="mb-6 rounded-lg border border-border/60 bg-card/45 px-4 py-3 md:px-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Referencias operativas</h2>
        <span className="text-xs text-muted-foreground tabular-nums">
          {drugs.length + codes.length}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {drugs.map((drug) => (
          <Link
            key={drug.id}
            href={`/vademecum?farmaco=${encodeURIComponent(drug.id)}`}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800 transition-colors hover:bg-emerald-100 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200 dark:hover:bg-emerald-950/50"
          >
            <Pill className="h-3.5 w-3.5" />
            {drug.name}
          </Link>
        ))}
        {codes.map((code) => (
          <Link
            key={`${code.tab}-${code.subtab ?? ""}-${code.code}`}
            href={code.href}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-800 transition-colors hover:bg-sky-100 dark:border-sky-900/40 dark:bg-sky-950/30 dark:text-sky-200 dark:hover:bg-sky-950/50"
          >
            <Hash className="h-3.5 w-3.5" />
            {code.label}
          </Link>
        ))}
      </div>
    </section>
  );
}

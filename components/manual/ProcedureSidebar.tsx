"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { ProcedureMeta } from "@/lib/content";

interface Props {
  proceduresBySection: Record<string, ProcedureMeta[]>;
}

const SECTION_COLORS: Record<string, string> = {
  Administrativos: "bg-slate-400",
  Comunicaciones: "bg-violet-500",
  Operativos: "bg-amber-500",
  SVA: "bg-red-500",
  SVB: "bg-blue-500",
  "Psicológicos": "bg-emerald-500",
  Técnicas: "bg-cyan-500",
  General: "bg-slate-400",
};

export function ProcedureSidebar({ proceduresBySection }: Props) {
  const pathname = usePathname();
  const sections = Object.keys(proceduresBySection);

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    // Auto-expand section of current page
    return init;
  });

  const toggleSection = (section: string) => {
    setCollapsed((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  return (
    <nav className="flex flex-col gap-0.5 py-2">
      {sections.map((section) => {
        const procedures = proceduresBySection[section];
        const dotColor = SECTION_COLORS[section] ?? "bg-slate-400";
        const isOpen = collapsed[section] !== true;
        const hasActive = procedures.some((p) => pathname === `/manual/${p.slug}`);

        return (
          <div key={section}>
            <button
              onClick={() => toggleSection(section)}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2 rounded-md text-xs font-semibold uppercase tracking-wide transition-colors",
                hasActive
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <span className={cn("h-2 w-2 rounded-full flex-shrink-0", dotColor)} />
              <span className="flex-1 text-left">{section}</span>
              {isOpen ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
            </button>

            {isOpen && (
              <div className="ml-5 flex flex-col gap-0.5 mb-1">
                {procedures.map((p) => {
                  const active = pathname === `/manual/${p.slug}`;
                  return (
                    <Link
                      key={p.id}
                      href={`/manual/${p.slug}`}
                      className={cn(
                        "px-3 py-1.5 rounded-md text-sm transition-colors leading-snug",
                        active
                          ? "bg-primary/10 text-primary font-medium"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted"
                      )}
                    >
                      <span className="text-xs text-muted-foreground/60 font-mono mr-1.5">
                        {p.id}
                      </span>
                      {p.title}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

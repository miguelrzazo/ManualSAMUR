"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { ProcedureSidebarSection } from "@/lib/content";

interface Props {
  sections: ProcedureSidebarSection[];
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

export function ProcedureSidebar({ sections }: Props) {
  const pathname = usePathname();

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    return init;
  });

  const toggleSection = (section: string) => {
    setCollapsed((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  return (
    <nav className="flex flex-col gap-0.5 py-2">
      {sections.map((section) => {
        const dotColor = SECTION_COLORS[section.section] ?? "bg-slate-400";
        const isOpen = collapsed[section.section] !== true;
        const hasActive = section.groups.some((group) =>
          group.subgroups.some((subgroup) =>
            subgroup.procedures.some((procedure) => pathname === `/manual/${procedure.slug}`),
          ),
        );

        return (
          <div key={section.section}>
            <button
              onClick={() => toggleSection(section.section)}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2 rounded-md text-xs font-semibold uppercase tracking-wide transition-colors",
                hasActive
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <span className={cn("h-2 w-2 rounded-full flex-shrink-0", dotColor)} />
              <span className="flex-1 text-left">{section.section}</span>
              {isOpen ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
            </button>

            {isOpen && (
              <div className="ml-4 mb-2 flex flex-col gap-3">
                {section.groups.map((group) => (
                  <div key={`${section.section}-${group.name}`} className="rounded-xl border border-border/50 bg-muted/15 p-2">
                    <div className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      {group.name}
                    </div>
                    <div className="flex flex-col gap-2">
                      {group.subgroups.map((subgroup, idx) => (
                        <div key={`${group.name}-${subgroup.name}`}>
                          {idx > 0 && <div className="h-px bg-border/30 my-1" />}
                          <div className="flex flex-col gap-0.5">
                            {subgroup.procedures.map((procedure) => {
                              const active = pathname === `/manual/${procedure.slug}`;
                              return (
                                <Link
                                  key={procedure.id}
                                  href={`/manual/${procedure.slug}`}
                                  className={cn(
                                    "px-2.5 py-1.5 rounded-lg text-sm transition-colors leading-snug",
                                    active
                                      ? "bg-primary/10 text-primary font-medium"
                                      : "text-muted-foreground hover:text-foreground hover:bg-background",
                                  )}
                                >
                                  <span className="text-xs text-muted-foreground/60 font-mono mr-1.5">
                                    {procedure.id}
                                  </span>
                                  {procedure.title}
                                </Link>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

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

const SECTION_COLORS: Record<string, { dot: string; accent: string }> = {
  Administrativos: { dot: "bg-slate-400", accent: "text-slate-500 dark:text-slate-400" },
  Comunicaciones:  { dot: "bg-violet-500", accent: "text-violet-600 dark:text-violet-400" },
  Operativos:      { dot: "bg-amber-500",  accent: "text-amber-600 dark:text-amber-400" },
  SVA:             { dot: "bg-red-500",    accent: "text-red-600 dark:text-red-400" },
  SVB:             { dot: "bg-blue-500",   accent: "text-blue-600 dark:text-blue-400" },
  "Psicológicos":  { dot: "bg-emerald-500",accent: "text-emerald-600 dark:text-emerald-400" },
  Técnicas:        { dot: "bg-cyan-500",   accent: "text-cyan-600 dark:text-cyan-400" },
  General:         { dot: "bg-slate-400",  accent: "text-slate-500 dark:text-slate-400" },
};
const DEFAULT_COLORS = SECTION_COLORS.General;

export function ProcedureSidebar({ sections }: Props) {
  const pathname = usePathname();

  const [openState, setOpenState] = useState<Record<string, boolean>>({});

  const toggle = (key: string, defaultOpen = false) =>
    setOpenState((prev) => ({ ...prev, [key]: !(prev[key] ?? defaultOpen) }));

  const isOpen = (key: string, defaultOpen = false) => openState[key] ?? defaultOpen;

  return (
    <nav className="flex flex-col gap-0.5 py-2">
      {sections.map((section) => {
        const colors = SECTION_COLORS[section.section] ?? DEFAULT_COLORS;
        const sectionKey = `s:${section.section}`;
        const totalCount = section.groups.reduce(
          (acc, g) => acc + g.subgroups.reduce((a, s) => a + s.procedures.length, 0),
          0,
        );
        const hasActive = section.groups.some((g) =>
          g.subgroups.some((sg) =>
            sg.procedures.some((p) => pathname === `/manual/${p.slug}`),
          ),
        );

        return (
          <div key={section.section}>
            {/* ── Section header ── */}
            <button
              onClick={() => toggle(sectionKey, hasActive)}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2 rounded-md text-xs font-semibold uppercase tracking-wide transition-colors",
                hasActive ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span className={cn("h-2 w-2 rounded-full flex-shrink-0", colors.dot)} />
              <span className="flex-1 text-left">{section.section}</span>
              <span className="text-[10px] font-normal text-muted-foreground/50 tabular-nums">{totalCount}</span>
              {isOpen(sectionKey, hasActive)
                ? <ChevronDown className="h-3 w-3 flex-shrink-0" />
                : <ChevronRight className="h-3 w-3 flex-shrink-0" />}
            </button>

            {isOpen(sectionKey, hasActive) && (
              <div className="ml-3 mb-2 flex flex-col gap-0">
                {section.groups.map((group) => {
                  const groupKey = `g:${section.section}:${group.name}`;

                  return (
                    <div key={groupKey}>
                      {/* ── Group label (separator, not collapsible) ── */}
                      <div className="mt-2 mb-1 px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/50 select-none">
                        {group.name}
                      </div>

                      {/* ── Subgroups (collapsible) ── */}
                      {group.subgroups.map((subgroup) => {
                        const subKey = `sg:${section.section}:${group.name}:${subgroup.name}`;
                        const subActive = subgroup.procedures.some(
                          (p) => pathname === `/manual/${p.slug}`,
                        );

                        return (
                          <div key={subKey} className="rounded-lg overflow-hidden mb-0.5">
                            <button
                              onClick={() => toggle(subKey, subActive)}
                              className={cn(
                                "w-full flex items-center gap-1.5 px-2 py-1.5 text-xs font-medium rounded-lg transition-colors",
                                subActive
                                  ? cn("bg-primary/8", colors.accent)
                                  : "text-muted-foreground hover:text-foreground hover:bg-muted/40",
                              )}
                            >
                              {isOpen(subKey, subActive)
                                ? <ChevronDown className="h-3 w-3 flex-shrink-0 opacity-60" />
                                : <ChevronRight className="h-3 w-3 flex-shrink-0 opacity-60" />}
                              <span className="flex-1 text-left leading-snug">{subgroup.name}</span>
                              <span className="text-[10px] font-normal tabular-nums opacity-50">
                                {subgroup.procedures.length}
                              </span>
                            </button>

                            {isOpen(subKey, subActive) && (
                              <div className="ml-3 flex flex-col gap-0.5 pb-1">
                                {subgroup.procedures.map((procedure) => {
                                  const active = pathname === `/manual/${procedure.slug}`;
                                  return (
                                    <Link
                                      key={procedure.id}
                                      href={`/manual/${procedure.slug}`}
                                      className={cn(
                                        "flex items-baseline gap-1.5 px-2 py-1.5 rounded-md text-sm transition-colors leading-snug",
                                        active
                                          ? "bg-primary/10 text-primary font-medium"
                                          : "text-muted-foreground hover:text-foreground hover:bg-background/80",
                                      )}
                                    >
                                      <span className="text-[10px] text-muted-foreground/50 font-mono flex-shrink-0 tabular-nums">
                                        {procedure.id}
                                      </span>
                                      <span className="leading-tight">{procedure.title}</span>
                                    </Link>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
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

"use client";

import { ChevronDown, List } from "lucide-react";
import { cn } from "@/lib/utils";
import { useHeadings } from "@/lib/hooks/use-headings";

interface Props {
  articleId?: string;
  pageTitle?: string;
  collapsible?: boolean;
}

export function TableOfContents({ articleId = "procedure-content", pageTitle, collapsible = false }: Props) {
  // La extracción de encabezados y el seguimiento del activo viven en el hook,
  // compartidos con el minimapa lateral (TableOfContentsRail).
  const { headings, activeId } = useHeadings(articleId, pageTitle);

  if (headings.length === 0) return null;

  const nav = (
    <nav>
      <ul className="space-y-0.5">
        {headings.map((h) => (
          <li key={h.id}>
            <a
              href={`#${h.id}`}
              className={cn(
                "block py-1 text-sm leading-snug transition-colors no-underline",
                h.level === 3 && "pl-4 text-xs",
                activeId === h.id
                  ? "text-primary font-medium"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );

  if (collapsible) {
    return (
      <details className="rounded-2xl border border-border/60 bg-card/70 shadow-sm group">
        <summary className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer list-none select-none">
          <div className="flex min-w-0 items-center gap-2">
            <List className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <span className="text-sm font-semibold text-foreground">En esta página</span>
            {activeId && (
              <span className="hidden sm:inline-flex max-w-44 truncate rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {headings.find((h) => h.id === activeId)?.text}
              </span>
            )}
          </div>
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-open:rotate-180 flex-shrink-0" />
        </summary>
        <div className="px-4 pb-4 pt-1">
          {nav}
        </div>
      </details>
    );
  }

  return (
    <div className="rounded-2xl border border-border/60 bg-card/70 p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <List className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        <span className="text-sm font-semibold text-foreground">Contenido</span>
      </div>
      {nav}
    </div>
  );
}

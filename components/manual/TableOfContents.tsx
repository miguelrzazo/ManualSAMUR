"use client";

import { useState, useEffect } from "react";
import { ChevronDown, List } from "lucide-react";
import { cn } from "@/lib/utils";
import { filterTableOfContentsHeadings } from "@/lib/manual-data";

interface Heading {
  id: string;
  text: string;
  level: number;
}

interface Props {
  articleId?: string;
  pageTitle?: string;
  collapsible?: boolean;
}

export function TableOfContents({ articleId = "procedure-content", pageTitle, collapsible = false }: Props) {
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [activeId, setActiveId] = useState<string>("");

  useEffect(() => {
    const article = document.getElementById(articleId);
    if (!article) return;

    const elements = Array.from(article.querySelectorAll("h2, h3")) as HTMLElement[];
    const parsed = elements
      .filter((el) => el.id)
      .map((el) => ({
        id: el.id,
        text: el.textContent?.trim() ?? "",
        level: el.tagName === "H2" ? 2 : 3,
      }));
    const filtered = filterTableOfContentsHeadings(parsed, pageTitle);
    const frame = window.requestAnimationFrame(() => setHeadings(filtered));

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length > 0) setActiveId(visible[0].target.id);
      },
      { rootMargin: "-15% 0px -65% 0px" }
    );

    elements.forEach((el) => observer.observe(el));
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [articleId, pageTitle]);

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

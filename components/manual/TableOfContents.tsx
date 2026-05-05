"use client";

import { useState, useEffect } from "react";
import { List } from "lucide-react";
import { cn } from "@/lib/utils";

interface Heading {
  id: string;
  text: string;
  level: number;
}

interface Props {
  articleId?: string;
}

export function TableOfContents({ articleId = "procedure-content" }: Props) {
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
    setHeadings(parsed);

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length > 0) setActiveId(visible[0].target.id);
      },
      { rootMargin: "-15% 0px -65% 0px" }
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [articleId]);

  if (headings.length === 0) return null;

  return (
    <div className="rounded-xl border border-border/60 bg-card/50 p-4">
      <div className="flex items-center gap-2 mb-3">
        <List className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        <span className="text-sm font-semibold text-muted-foreground">Contenido</span>
      </div>
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
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";

interface Heading { id: string; text: string; level: number }

function useActiveHeadings(articleId: string) {
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [activeId, setActiveId] = useState<string>("");

  useEffect(() => {
    const article = document.getElementById(articleId);
    if (!article) return;

    const els = Array.from(article.querySelectorAll("h2, h3")) as HTMLElement[];
    const parsed = els.filter((el) => el.id).map((el) => ({
      id: el.id,
      text: el.textContent?.trim() ?? "",
      level: el.tagName === "H2" ? 2 : 3,
    }));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHeadings(parsed);

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length > 0) setActiveId(visible[0].target.id);
      },
      { rootMargin: "-10% 0px -65% 0px" }
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [articleId]);

  return { headings, activeId };
}

function scrollTo(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const offset = 100; // account for sticky headers
  const top = el.getBoundingClientRect().top + window.scrollY - offset;
  window.scrollTo({ top, behavior: "smooth" });
}

/* ── Left indicator bars (mini ToC) ── */
export function MobileScrollIndicator({ articleId }: { articleId: string }) {
  const { headings, activeId } = useActiveHeadings(articleId);
  if (headings.length < 2) return null;

  return (
    <div
      className="fixed left-0 top-1/2 -translate-y-1/2 z-30 md:hidden flex flex-col gap-[5px] py-3 pl-1.5 pr-1"
      aria-hidden
    >
      {headings.map((h) => {
        const isActive = h.id === activeId;
        return (
          <button
            key={h.id}
            onClick={() => scrollTo(h.id)}
            className={`block rounded-full transition-all duration-200 ${
              isActive
                ? "w-4 h-[3px] bg-foreground"
                : h.level === 2
                ? "w-2.5 h-[2px] bg-muted-foreground/35 hover:bg-muted-foreground/60"
                : "w-1.5 h-[2px] bg-muted-foreground/20 hover:bg-muted-foreground/40"
            }`}
          />
        );
      })}
    </div>
  );
}

/* ── Sticky current section heading ── */
export function MobileStickyHeading({ articleId }: { articleId: string }) {
  const { headings, activeId } = useActiveHeadings(articleId);
  const active = headings.find((h) => h.id === activeId && h.level === 2) ?? headings.find((h) => h.id === activeId);
  if (!active) return null;

  return (
    <div className="md:hidden sticky z-40 border-b border-border/40 bg-background/95 backdrop-blur-sm px-4 py-1.5"
      style={{ top: "calc(3rem + env(safe-area-inset-top))" }}
    >
      <p className="text-xs font-semibold text-muted-foreground truncate">{active.text}</p>
    </div>
  );
}

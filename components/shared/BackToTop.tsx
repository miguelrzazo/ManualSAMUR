"use client";

import { useState, useEffect } from "react";
import { ChevronUp } from "lucide-react";

interface BackToTopProps {
  scrollContainerId?: string; // If provided, listen to this container instead of window
}

export function BackToTop({ scrollContainerId }: BackToTopProps) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const getScrollContainer = () => {
      if (scrollContainerId) {
        return document.getElementById(scrollContainerId);
      }
      return window;
    };

    const handleScroll = () => {
      const container = getScrollContainer();
      let scrollY = 0;
      
      if (container === window) {
        scrollY = window.scrollY;
      } else {
        scrollY = (container as HTMLElement).scrollTop;
      }

      setShow(scrollY > 200);
    };

    const container = getScrollContainer();
    if (!container) return;

    container.addEventListener("scroll", handleScroll, { passive: true });
    // Initial check
    handleScroll();

    return () => container.removeEventListener("scroll", handleScroll);
  }, [scrollContainerId]);

  const scrollToTop = () => {
    if (scrollContainerId) {
      const container = document.getElementById(scrollContainerId);
      container?.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  if (!show) return null;

  return (
    <button
      onClick={scrollToTop}
      className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] md:bottom-6 right-6 z-50 flex h-10 w-10 items-center justify-center rounded-full bg-background border border-border/60 shadow-lg text-muted-foreground hover:text-foreground hover:border-border hover:bg-muted/50 transition-all active:scale-95"
      aria-label="Volver al inicio"
    >
      <ChevronUp className="h-5 w-5" />
    </button>
  );
}

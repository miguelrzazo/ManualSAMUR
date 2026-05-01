"use client";

import { useEffect } from "react";

import { syncViewportHeightVar } from "@/lib/viewport";

export function ViewportHeightObserver() {
  useEffect(() => {
    const syncViewportHeight = () => {
      syncViewportHeightVar(document, window);
    };

    syncViewportHeight();

    const visualViewport = window.visualViewport;
    window.addEventListener("resize", syncViewportHeight);
    window.addEventListener("orientationchange", syncViewportHeight);
    window.addEventListener("pageshow", syncViewportHeight);
    visualViewport?.addEventListener("resize", syncViewportHeight);
    visualViewport?.addEventListener("scroll", syncViewportHeight);

    return () => {
      window.removeEventListener("resize", syncViewportHeight);
      window.removeEventListener("orientationchange", syncViewportHeight);
      window.removeEventListener("pageshow", syncViewportHeight);
      visualViewport?.removeEventListener("resize", syncViewportHeight);
      visualViewport?.removeEventListener("scroll", syncViewportHeight);
    };
  }, []);

  return null;
}

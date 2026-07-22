"use client";

import { useEffect, useState } from "react";
import { filterTableOfContentsHeadings } from "@/lib/manual-data";

export interface Heading {
  id: string;
  text: string;
  level: number;
}

/**
 * Extrae los encabezados del artículo y sigue cuál está visible.
 *
 * Vive en un hook porque lo comparten las dos presentaciones del índice: la
 * lista desplegable de móvil (TableOfContents) y el minimapa lateral de
 * escritorio (TableOfContentsRail). Antes esta lógica —incluido el
 * IntersectionObserver— estaba dentro del componente, de modo que una segunda
 * presentación habría tenido que duplicarla.
 *
 * Los ids los pone rehype-slug al renderizar el MDX.
 */
export function useHeadings(articleId: string, pageTitle?: string) {
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
    // En rAF para no provocar un set durante el render de hidratación.
    const frame = window.requestAnimationFrame(() => setHeadings(filtered));

    /**
     * Activo = el último encabezado que ha pasado por la línea de lectura.
     *
     * Antes esto era un IntersectionObserver con una banda del 15% al 35% de la
     * ventana, y solo marcaba activo lo que cayera dentro. Entre dos encabezados
     * separados no había ninguno en la banda, así que el índice se quedaba sin
     * nada resaltado justo mientras se leía esa sección. Mirando la posición se
     * resuelve: siempre hay un "último encabezado pasado".
     */
    const LINE = 0.25; // línea de lectura, a un cuarto de la ventana
    let ticking = false;

    const recompute = () => {
      ticking = false;
      const line = window.innerHeight * LINE;
      let current = "";
      for (const el of elements) {
        if (el.getBoundingClientRect().top <= line) current = el.id;
        else break; // están en orden de documento
      }
      // Antes del primer encabezado, resaltar el primero en vez de nada.
      setActiveId(current || elements[0]?.id || "");
    };

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(recompute);
    };

    recompute();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [articleId, pageTitle]);

  return { headings, activeId };
}

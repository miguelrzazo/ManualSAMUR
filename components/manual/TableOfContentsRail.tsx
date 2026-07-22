"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { useHeadings } from "@/lib/hooks/use-headings";

interface Props {
  articleId?: string;
  pageTitle?: string;
}

/**
 * Índice lateral en forma de minimapa, al estilo de Notion.
 *
 * En reposo es una pila de trazos —uno por encabezado, más corto y sangrado si
 * es de nivel 3— con el trazo activo resaltado. Al pasar el ratón se despliega
 * y muestra el texto de cada encabezado.
 *
 * Va fijo al borde de la ventana, fuera del flujo, para que el artículo pueda
 * ocupar todo el ancho. Solo escritorio: depende del hover, que no existe en
 * pantallas táctiles, así que en móvil se sigue usando TableOfContents.
 */
export function TableOfContentsRail({ articleId = "procedure-content", pageTitle }: Props) {
  const { headings, activeId } = useHeadings(articleId, pageTitle);
  const [open, setOpen] = useState(false);

  if (headings.length === 0) return null;

  return (
    <div
      // aria-hidden: es un atajo visual redundante. El mismo índice está
      // disponible de forma accesible en TableOfContents, y los encabezados
      // reales ya permiten navegar con lector de pantalla.
      aria-hidden="true"
      data-print-hide
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      className="hidden xl:flex fixed right-0 top-1/2 z-30 -translate-y-1/2 flex-col justify-center pr-3 pl-6 py-4"
    >
      <div
        className={cn(
          "flex flex-col gap-1 rounded-2xl transition-all duration-200 ease-out",
          open && "gap-0.5 border border-border/60 bg-card/95 p-2 shadow-lg backdrop-blur-sm",
        )}
      >
        {headings.map((heading) => {
          const isActive = activeId === heading.id;
          return (
            <a
              key={heading.id}
              href={`#${heading.id}`}
              tabIndex={-1}
              className={cn(
                "group flex items-center gap-2 no-underline",
                open ? "rounded-md px-2 py-1 hover:bg-muted/60" : "justify-end py-1",
              )}
            >
              {/* El trazo: ancho por nivel, resaltado si está activo */}
              <span
                className={cn(
                  "block h-0.5 flex-shrink-0 rounded-full transition-all duration-200",
                  heading.level === 3 ? "w-3" : "w-5",
                  open && "w-2",
                  isActive ? "bg-primary" : "bg-muted-foreground/35 group-hover:bg-muted-foreground/60",
                )}
              />
              <span
                className={cn(
                  "whitespace-nowrap text-xs leading-snug transition-all duration-200",
                  // max-w-0 + overflow-hidden para que el texto se despliegue
                  // en lugar de aparecer de golpe.
                  open ? "max-w-56 truncate opacity-100" : "max-w-0 overflow-hidden opacity-0",
                  heading.level === 3 && "pl-1 text-[11px]",
                  isActive ? "font-medium text-primary" : "text-muted-foreground",
                )}
              >
                {heading.text}
              </span>
            </a>
          );
        })}
      </div>
    </div>
  );
}

"use client";

import { useRef } from "react";
import Link from "next/link";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { ManualReverseMention } from "@/lib/manual-relations-index";

interface Props<T> {
  item: T | null;
  onClose: () => void;
  /** Cabecera coloreada por categoría, igual que la tarjeta de la lista. */
  accent: { bg: string; text: string; dot: string };
  title: string;
  subtitle?: string;
  badge?: string;
  children: React.ReactNode;
  mentions?: ManualReverseMention[];
}

/**
 * Diálogo de detalle para fármacos y perfusiones.
 *
 * Antes el detalle se desplegaba bajo la tarjeta, lo que empujaba el resto de la
 * lista y obligaba a rebuscar la posición al cerrar. En un listado largo con
 * scroll propio eso desorienta, así que ahora abre en modal.
 *
 * Quien lo abre sincroniza la URL, de modo que un fármaco es enlazable y el botón
 * atrás cierra el diálogo.
 */
export function DrugDetailDialog<T>({
  item,
  onClose,
  accent,
  title,
  subtitle,
  badge,
  children,
  mentions = [],
}: Props<T>) {
  const bodyRef = useRef<HTMLDivElement>(null);

  return (
    <Dialog open={item !== null} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent
        className="w-[95vw] sm:max-w-2xl max-h-[88vh] flex flex-col gap-0 p-0"
        // Por defecto se enfoca el primer elemento enfocable, que aqui son los
        // enlaces de "Mencionado en procedimientos" al final del contenido: eso
        // abria el modal ya desplazado hasta abajo. Enfocando el cuerpo, el foco
        // sigue entrando en el dialogo pero el scroll se queda arriba.
        initialFocus={bodyRef}
      >
        <DialogHeader className="flex-shrink-0 space-y-2 border-b border-border/40 px-5 pb-4 pt-5 text-left">
          <div className="flex items-start gap-3">
            <div className={cn("mt-1 w-1 self-stretch rounded-full flex-shrink-0", accent.dot)} />
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-base font-bold leading-snug">{title}</DialogTitle>
              {subtitle && (
                <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
              )}
              {badge && (
                <span className={cn("mt-2 inline-block rounded-full px-2 py-0.5 text-xs font-medium", accent.bg, accent.text)}>
                  {badge}
                </span>
              )}
            </div>
          </div>
        </DialogHeader>

        <div ref={bodyRef} tabIndex={-1} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4 outline-none">
          {children}

          {mentions.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Mencionado en procedimientos
              </p>
              <div className="grid gap-1.5">
                {mentions.slice(0, 6).map((mention) => (
                  <Link
                    key={mention.procedureId}
                    href={`/manual/${mention.slug}`}
                    onClick={onClose}
                    className="rounded-lg border border-border/50 bg-background px-3 py-2 text-xs transition-colors hover:border-primary/40 hover:bg-muted/30"
                  >
                    <span className="font-mono text-muted-foreground">{mention.procedureId}</span>
                    <span className="ml-2 font-semibold text-foreground">{mention.title}</span>
                    <span className="mt-1 line-clamp-2 block text-muted-foreground">{mention.preview}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

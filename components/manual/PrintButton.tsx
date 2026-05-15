"use client";

import { Printer } from "lucide-react";
import { cn } from "@/lib/utils";

export function PrintButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className={cn(
        "inline-flex items-center justify-center rounded-md border border-border/60 bg-background px-2 py-1.5 text-muted-foreground transition-colors hover:text-foreground hover:bg-muted print:hidden",
        className,
      )}
      title="Imprimir / Guardar como PDF"
      aria-label="Imprimir / Guardar como PDF"
    >
      <Printer className="h-4 w-4" />
    </button>
  );
}

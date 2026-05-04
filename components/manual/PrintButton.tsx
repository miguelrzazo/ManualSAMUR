"use client";

import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 border border-border/60 transition-colors print:hidden"
      title="Imprimir / Guardar como PDF"
    >
      <Printer className="h-3.5 w-3.5" />
      Imprimir
    </button>
  );
}

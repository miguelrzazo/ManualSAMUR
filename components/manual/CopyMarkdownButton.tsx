"use client";

import { useState } from "react";
import { Check, Clipboard, X } from "lucide-react";

export function CopyMarkdownButton({ markdown }: { markdown: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");

  async function copy() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
      await navigator.clipboard.writeText(markdown);
      setStatus("copied");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="flex items-center gap-1">
      <button type="button" onClick={copy} aria-label="Copiar Markdown" title="Copiar Markdown" className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border/60 bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground print:hidden">
        {status === "copied" ? <Check className="h-4 w-4" /> : status === "error" ? <X className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />}
      </button>
      <span role="status" aria-live="polite" className={`text-xs ${status === "error" ? "text-destructive" : "text-muted-foreground"}`}>
        {status === "copied" ? "Markdown copiado" : status === "error" ? "No se pudo copiar" : null}
      </span>
    </div>
  );
}

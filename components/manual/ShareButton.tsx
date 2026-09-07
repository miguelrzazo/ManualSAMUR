"use client";

import { useEffect, useState } from "react";
import { Check, Clipboard, Download, Link2, Share2, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface ShareButtonProps {
  title: string;
  url: string;
  markdown: string;
  className?: string;
}

type FeedbackKind = "share" | "link" | "markdown";
type FeedbackStatus = "ok" | "error";

/** Un único menú que agrupa compartir, copiar enlace, imprimir/PDF y copiar Markdown. */
export function ShareButton({ title, url, markdown, className }: ShareButtonProps) {
  // navigator.share solo existe en el navegador: se detecta tras el montaje para no
  // desincronizar el HTML del servidor (export estático, sin runtime) con el del cliente.
  const [canShare, setCanShare] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: FeedbackKind; status: FeedbackStatus } | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- navigator.share es client-only, se detecta tras el montaje.
    setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, []);

  useEffect(() => {
    if (!feedback) return;
    const timeout = setTimeout(() => setFeedback(null), 2000);
    return () => clearTimeout(timeout);
  }, [feedback]);

  async function handleShare() {
    try {
      await navigator.share({ title, url });
    } catch {
      // El usuario canceló el share sheet o el navegador lo rechazó; no es un error a reportar.
    }
  }

  async function handleCopyLink() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
      await navigator.clipboard.writeText(url);
      setFeedback({ kind: "link", status: "ok" });
    } catch {
      setFeedback({ kind: "link", status: "error" });
    }
  }

  async function handleCopyMarkdown() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
      await navigator.clipboard.writeText(markdown);
      setFeedback({ kind: "markdown", status: "ok" });
    } catch {
      setFeedback({ kind: "markdown", status: "error" });
    }
  }

  function handlePrint() {
    window.print();
  }

  const feedbackLabel =
    feedback?.kind === "link"
      ? feedback.status === "ok"
        ? "Enlace copiado"
        : "No se pudo copiar el enlace"
      : feedback?.kind === "markdown"
        ? feedback.status === "ok"
          ? "Markdown copiado"
          : "No se pudo copiar el Markdown"
        : null;

  return (
    <div className="flex items-center gap-1" data-print-hide>
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            "inline-flex h-9 w-9 items-center justify-center rounded-md border border-border/60 bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            className,
          )}
          title="Compartir"
          aria-label="Compartir"
        >
          <Share2 className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canShare && (
            <DropdownMenuItem onClick={handleShare}>
              <Share2 className="mr-2 h-4 w-4" />
              Compartir…
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={handleCopyLink}>
            <Link2 className="mr-2 h-4 w-4" />
            Copiar enlace
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handlePrint}>
            <Download className="mr-2 h-4 w-4" />
            Descargar PDF
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleCopyMarkdown}>
            {feedback?.kind === "markdown" ? (
              feedback.status === "ok" ? (
                <Check className="mr-2 h-4 w-4" />
              ) : (
                <X className="mr-2 h-4 w-4" />
              )
            ) : (
              <Clipboard className="mr-2 h-4 w-4" />
            )}
            Copiar Markdown
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <span role="status" aria-live="polite" className={`text-xs ${feedback?.status === "error" ? "text-destructive" : "text-muted-foreground"}`}>
        {feedbackLabel}
      </span>
    </div>
  );
}

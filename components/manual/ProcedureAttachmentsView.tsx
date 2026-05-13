"use client";

import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { ChevronDown, ExternalLink, FileText, Image as ImageIcon, Paperclip } from "lucide-react";
import type { ManualAttachment } from "@/lib/manual-sync";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

function PdfInlineViewer({ src, title }: { src: string; title: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [numPages, setNumPages] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const updateWidth = () => {
      const nextWidth = Math.floor(node.clientWidth);
      if (nextWidth > 0) setContainerWidth(nextWidth);
    };

    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const pageWidth = Math.max(320, containerWidth - 16);

  return (
    <div className="space-y-3">
      <div ref={containerRef} className="w-full min-h-[240px] rounded-lg border border-border/40 bg-muted/20 p-2">
        <Document
          file={src}
          loading={<p className="px-2 py-6 text-sm text-muted-foreground">Cargando PDF...</p>}
          error={<p className="px-2 py-6 text-sm text-destructive">No se pudo cargar el PDF.</p>}
          onLoadSuccess={(pdf) => {
            setNumPages(pdf.numPages);
            setError(null);
          }}
          onLoadError={(loadError) => {
            setError(loadError instanceof Error ? loadError.message : "Error al cargar PDF");
          }}
        >
          {numPages > 0
            ? Array.from({ length: numPages }, (_unused, index) => (
              <div key={`${src}-page-${index + 1}`} className="mb-4 last:mb-0">
                <Page
                  pageNumber={index + 1}
                  width={pageWidth}
                  renderAnnotationLayer={false}
                  renderTextLayer={false}
                  className="mx-auto overflow-hidden rounded-md border border-border/50 bg-white shadow-sm"
                />
                <p className="mt-1 text-center text-xs text-muted-foreground">
                  Página {index + 1} / {numPages}
                </p>
              </div>
            ))
            : null}
        </Document>
      </div>
      <a
        href={src}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <ExternalLink className="h-3 w-3" />
        Abrir {title} en nueva pestaña
      </a>
      {error ? <p className="text-xs text-destructive break-all">{error}</p> : null}
    </div>
  );
}

function filenameFromPath(pathname: string) {
  return pathname.split("/").pop() ?? pathname;
}

export function ProcedureAttachmentsView({ attachments }: { attachments: ManualAttachment[] }) {
  const [expandedByPath, setExpandedByPath] = useState<Record<string, boolean>>({});
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- attachment previews depend on client-only media/PDF handling.
    setIsClient(true);
  }, []);

  const toggle = (localPath: string) => {
    setExpandedByPath((prev) => ({ ...prev, [localPath]: !prev[localPath] }));
  };

  return (
    <div className="mt-8" data-print-hide>
      <div className="mb-3 flex items-center gap-2">
        <Paperclip className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-muted-foreground">Anexos</h3>
      </div>
      <div className="space-y-2">
        {attachments.map((attachment) => {
          const filename = filenameFromPath(attachment.localPath);
          const isImage = attachment.kind === "image" || /\.(jpe?g|png|gif|webp|svg)$/i.test(attachment.localPath);
          const isPdf = attachment.kind === "pdf" || attachment.localPath.toLowerCase().endsWith(".pdf");
          const isExpanded = Boolean(expandedByPath[attachment.localPath]);

          return (
            <section
              key={attachment.localPath}
              className="rounded-xl border border-border/60 bg-card/50"
            >
              <button
                type="button"
                onClick={() => toggle(attachment.localPath)}
                aria-expanded={isExpanded}
                className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-muted/30 rounded-xl transition-colors"
              >
                <span className="flex min-w-0 items-center gap-2">
                  {isImage ? (
                    <ImageIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  ) : (
                    <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  )}
                  <span className="truncate text-sm font-medium">{filename}</span>
                  <span className="flex-shrink-0 text-xs uppercase text-muted-foreground">
                    {isImage ? "imagen" : isPdf ? "pdf" : attachment.kind}
                  </span>
                </span>
                <ChevronDown
                  className={`h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`}
                />
              </button>

              {isExpanded ? (
                <div className="px-4 pb-4 pt-2">
                  {isImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={attachment.localPath}
                      alt={filename}
                      className="h-auto w-full rounded-lg border border-border/40"
                    />
                  ) : isPdf ? (
                    isClient ? <PdfInlineViewer src={attachment.localPath} title={filename} /> : (
                      <div className="rounded-lg border border-border/40 bg-muted/20 p-4 text-sm text-muted-foreground">
                        Preparando visor de PDF...
                      </div>
                    )
                  ) : (
                    <a
                      href={attachment.localPath}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      {filename}
                    </a>
                  )}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}

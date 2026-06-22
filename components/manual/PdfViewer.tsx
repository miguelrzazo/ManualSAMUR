"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { AlertCircle, ChevronLeft, ChevronRight, ExternalLink, Loader2 } from "lucide-react";

pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

type PdfViewerProps = {
  src: string;
  title: string;
};

export function PdfViewer({ src, title }: PdfViewerProps) {
  const [pageCount, setPageCount] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [error, setError] = useState<Error | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const element = containerRef.current;
    const measure = () => setContainerWidth(element.getBoundingClientRect().width);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const handleLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setPageCount(numPages);
    setPageNumber(1);
    setError(null);
  }, []);

  const handleLoadError = useCallback((loadError: Error) => {
    setError(loadError);
  }, []);

  const goToPrevious = () => setPageNumber((prev) => Math.max(1, prev - 1));
  const goToNext = () => setPageNumber((prev) => Math.min(pageCount, prev + 1));

  const pageWidth = containerWidth > 0 ? Math.min(containerWidth, 900) : undefined;

  return (
    <div ref={containerRef} className="space-y-3">
      <div className="overflow-hidden rounded-lg border border-border/50 bg-muted/10">
        <div className="flex items-center justify-between gap-2 border-b border-border/40 bg-card/60 px-3 py-2">
          <span className="truncate text-xs text-muted-foreground" title={title}>
            {title}
          </span>
          {pageCount > 0 ? (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={goToPrevious}
                disabled={pageNumber <= 1}
                aria-label="Página anterior"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="min-w-[4.5rem] text-center text-xs tabular-nums text-muted-foreground">
                {pageNumber} / {pageCount}
              </span>
              <button
                type="button"
                onClick={goToNext}
                disabled={pageNumber >= pageCount}
                aria-label="Página siguiente"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          ) : null}
        </div>

        <div className="flex justify-center bg-muted/20 px-2 py-4">
          {error ? (
            <div className="flex max-w-sm flex-col items-center gap-2 py-10 text-center">
              <AlertCircle className="h-6 w-6 text-destructive" />
              <p className="text-sm text-muted-foreground">
                No se pudo renderizar el PDF en línea.
              </p>
              <a
                href={src}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Abrir en nueva pestaña
              </a>
            </div>
          ) : (
            <Document
              file={src}
              onLoadSuccess={handleLoadSuccess}
              onLoadError={handleLoadError}
              loading={
                <div className="flex h-[340px] flex-col items-center justify-center gap-2 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="text-xs">Cargando PDF…</span>
                </div>
              }
              error={
                <div className="flex max-w-sm flex-col items-center gap-2 py-10 text-center">
                  <AlertCircle className="h-6 w-6 text-destructive" />
                  <p className="text-sm text-muted-foreground">
                    No se pudo cargar el PDF.
                  </p>
                  <a
                    href={src}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Abrir en nueva pestaña
                  </a>
                </div>
              }
              className="react-pdf__Document"
            >
              <Page
                pageNumber={pageNumber}
                width={pageWidth}
                renderTextLayer
                renderAnnotationLayer
                loading={
                  <div className="flex h-[340px] flex-col items-center justify-center gap-2 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span className="text-xs">Renderizando página…</span>
                  </div>
                }
                className="react-pdf__Page"
              />
            </Document>
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Si no se visualiza,{" "}
        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:text-foreground transition-colors"
        >
          abre en nueva pestaña
        </a>
        .
      </p>
    </div>
  );
}

"use client";

import { useState } from "react";
import { ChevronDown, ExternalLink, FileText, Image as ImageIcon, Paperclip } from "lucide-react";
import type { ManualAttachment } from "@/lib/manual-sync";
import { ImageWithLightbox } from "@/components/manual/mdx-extras";

function filenameFromPath(pathname: string) {
  return pathname.split("/").pop() ?? pathname;
}

function PdfCard({ src, title }: { src: string; title: string }) {
  const [showPreview, setShowPreview] = useState(false);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">Abre el PDF en el navegador o activa la previsualización.</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowPreview((v) => !v)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
          >
            {showPreview ? "Ocultar vista previa" : "Vista previa"}
          </button>
          <a
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Abrir PDF
          </a>
        </div>
      </div>

      {showPreview && (
        <iframe
          src={`${src}#toolbar=1&navpanes=0`}
          title={title}
          className="w-full rounded-lg border border-border/50 bg-muted/20"
          style={{ height: "60vh", minHeight: 320 }}
        />
      )}
    </div>
  );
}

export function ProcedureAttachmentsView({ attachments }: { attachments: ManualAttachment[] }) {
  const [expandedByPath, setExpandedByPath] = useState<Record<string, boolean>>({});

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
                    <div className="flex justify-center">
                      <ImageWithLightbox src={attachment.localPath} alt={filename} />
                    </div>
                  ) : isPdf ? (
                    <PdfCard src={attachment.localPath} title={filename} />
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

"use client";

import { useState } from "react";
import { ChevronDown, ExternalLink, FileText, Image as ImageIcon, Paperclip } from "lucide-react";
import type { ManualAttachment } from "@/lib/manual-sync";
import { ImageWithLightbox } from "@/components/manual/mdx-extras";
import { PdfViewer } from "@/components/manual/PdfViewer";

function filenameFromPath(pathname: string) {
  return pathname.split("/").pop() ?? pathname;
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
          const unavailable = attachment.availability === "unavailable";
          const isImage = attachment.kind === "image" || /\.(jpe?g|png|gif|webp|svg)$/i.test(attachment.localPath);
          const isPdf = attachment.kind === "pdf" || attachment.localPath.toLowerCase().endsWith(".pdf");
          const isExpanded = Boolean(expandedByPath[attachment.localPath]);

          return (
            <section
              key={attachment.localPath}
              className="rounded-xl border border-border/60 bg-card/50"
            >
              <div className="flex items-center gap-2 px-4 py-3">
                <button
                  type="button"
                  onClick={() => toggle(attachment.localPath)}
                  aria-expanded={isExpanded}
                  className="flex flex-1 min-w-0 items-center gap-2 text-left"
                >
                  {unavailable ? (
                    <FileText className="h-4 w-4 text-amber-600 flex-shrink-0" />
                  ) : isImage ? (
                    <ImageIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  ) : (
                    <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  )}
                  <span className="truncate text-sm font-medium">{filename}</span>
                  <span className="flex-shrink-0 text-xs uppercase text-muted-foreground">
                    {unavailable ? "no disponible" : isImage ? "imagen" : isPdf ? "pdf" : attachment.kind}
                  </span>
                </button>
                {!unavailable && isPdf && (
                  <a
                    href={attachment.localPath}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="flex-shrink-0 inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2.5 py-1 text-xs font-medium hover:bg-primary/20 transition-colors"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Abrir
                  </a>
                )}
                <ChevronDown
                  className={`h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`}
                  onClick={() => toggle(attachment.localPath)}
                />
              </div>

              {isExpanded ? (
                <div className="px-4 pb-4 pt-2">
                  {unavailable ? (
                    <div role="status" className="rounded-lg border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-200">
                      <p>No se pudo descargar este anexo desde la fuente oficial.</p>
                      {attachment.error ? <p className="mt-1 text-xs opacity-80">{attachment.error}</p> : null}
                      {attachment.sourceUrl ? (
                        <a href={attachment.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 font-medium underline">
                          <ExternalLink className="h-3 w-3" /> Intentar abrir la fuente oficial
                        </a>
                      ) : null}
                    </div>
                  ) : isImage ? (
                    <div className="flex justify-center">
                      <ImageWithLightbox src={attachment.localPath} alt={filename} />
                    </div>
                  ) : isPdf ? (
                    <PdfViewer src={attachment.localPath} title={filename} />
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

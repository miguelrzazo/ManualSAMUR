"use client";

import { useState } from "react";
import { ChevronDown, ExternalLink, FileText, Image as ImageIcon, Paperclip } from "lucide-react";
import type { ManualAttachment } from "@/lib/manual-sync";
import { ImageWithLightbox } from "@/components/manual/mdx-extras";

function filenameFromPath(pathname: string) {
  return pathname.split("/").pop() ?? pathname;
}

function PdfCard({ src, title }: { src: string; title: string }) {
  return (
    <div className="space-y-3">
      {/* Inline embed — uses browser/OS native PDF viewer */}
      <embed
        src={`${src}#toolbar=0&navpanes=0&scrollbar=0`}
        type="application/pdf"
        title={title}
        className="w-full rounded-lg border border-border/50 bg-muted/10"
        style={{ height: "64vh", minHeight: 340 }}
      />
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
              <div className="flex items-center gap-2 px-4 py-3">
                <button
                  type="button"
                  onClick={() => toggle(attachment.localPath)}
                  aria-expanded={isExpanded}
                  className="flex flex-1 min-w-0 items-center gap-2 text-left"
                >
                  {isImage ? (
                    <ImageIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  ) : (
                    <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  )}
                  <span className="truncate text-sm font-medium">{filename}</span>
                  <span className="flex-shrink-0 text-xs uppercase text-muted-foreground">
                    {isImage ? "imagen" : isPdf ? "pdf" : attachment.kind}
                  </span>
                </button>
                {isPdf && (
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

"use client";

import { useState } from "react";
import {
  MoreVertical,
  ExternalLink,
  Cookie,
  Info,
  Mail,
  Bot,
  Users,
  TriangleAlert,
  GitBranch,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { CollaboratorsData, MainLinksData } from "@/lib/main-content";

const APP_VERSION = "0.1.0";

interface Props {
  collaborators: CollaboratorsData;
  mainLinks: MainLinksData;
}

function summarizeCollaborators(data: CollaboratorsData): string[] {
  if (data.list.length > 0) return data.list.slice(0, 5);
  const fromBlocks = [
    ...data.blocks.coordination,
    ...data.blocks.technicalReview,
    ...data.blocks.designAndProgramming,
  ];
  return fromBlocks.slice(0, 5);
}

export function AppMenu({ collaborators, mainLinks }: Props) {
  const [open, setOpen] = useState(false);
  const collaboratorSummary = summarizeCollaborators(collaborators);

  const openExternal = (href: string) => {
    if (!href) return;
    setOpen(false);
    window.open(href, "_blank", "noopener,noreferrer");
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition-colors"
        aria-label="Menú"
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogHeader className="sr-only">
          <DialogTitle>Acerca de SAMUR Manual</DialogTitle>
        </DialogHeader>
        <DialogContent className="sm:max-w-xs p-0 overflow-hidden gap-0">
          <div className="flex items-center gap-3 px-5 py-4 border-b border-border/50">
            <div className="h-9 w-9 rounded-xl bg-primary flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-bold text-primary-foreground">S</span>
            </div>
            <div>
              <p className="text-sm font-semibold leading-tight">SAMUR Manual</p>
              <p className="text-xs text-muted-foreground">v{APP_VERSION}</p>
            </div>
          </div>

          <div className="px-5 py-4 space-y-4 overflow-y-auto max-h-[70vh]">
            <section className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Info className="h-3.5 w-3.5 text-muted-foreground" />
                Aviso de uso
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Adaptación no oficial del Manual de Procedimientos de SAMUR-Protección Civil. El contenido clínico pertenece a SAMUR-PC / Ayuntamiento de Madrid.
              </p>
            </section>

            <div className="h-px bg-border/60" />

            <section className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Users className="h-3.5 w-3.5 text-muted-foreground" />
                Colaboradores
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Listado oficial: {collaborators.list.length > 0 ? `${collaborators.list.length} colaboradores` : "sin datos locales todavía"}.
              </p>
              {collaboratorSummary.length > 0 && (
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {collaboratorSummary.join(" · ")}
                </p>
              )}
              <button
                onClick={() => openExternal("/colaboradores")}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border text-xs font-medium hover:bg-muted transition-colors"
              >
                Ver lista completa
              </button>
            </section>

            <div className="h-px bg-border/60" />

            <section className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                Enlaces oficiales
              </div>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => openExternal(mainLinks.avisoImportanteUrl)}
                  className="w-full inline-flex items-center gap-2 px-2.5 py-2 rounded-lg border border-border text-xs font-medium hover:bg-muted transition-colors text-left"
                >
                  <TriangleAlert className="h-3.5 w-3.5 flex-shrink-0" />
                  Aviso importante (PDF)
                </button>
                <button
                  onClick={() => openExternal(`mailto:${mainLinks.samurEmail}`)}
                  className="w-full inline-flex items-center gap-2 px-2.5 py-2 rounded-lg border border-border text-xs font-medium hover:bg-muted transition-colors text-left"
                >
                  <Mail className="h-3.5 w-3.5 flex-shrink-0" />
                  Enviar correo a SAMUR
                </button>
                <button
                  onClick={() => openExternal(mainLinks.officialWebUrl)}
                  className="w-full inline-flex items-center gap-2 px-2.5 py-2 rounded-lg border border-border text-xs font-medium hover:bg-muted transition-colors text-left"
                >
                  <ExternalLink className="h-3.5 w-3.5 flex-shrink-0" />
                  Web oficial del Ayuntamiento
                </button>
              </div>
            </section>

            <div className="h-px bg-border/60" />

            <section className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Cookie className="h-3.5 w-3.5 text-muted-foreground" />
                Cookies
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Solo se usan cookies propias para favoritos y recientes. Sin analítica ni seguimiento.
              </p>
            </section>

            <div className="h-px bg-border/60" />

            <section className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Bot className="h-3.5 w-3.5 text-muted-foreground" />
                Acceso para IA
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Contenido disponible en formato <a href="/llms.txt" className="underline hover:text-foreground transition-colors" target="_blank" rel="noopener noreferrer">llms.txt</a>.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => openExternal("/llms.txt")}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border text-xs font-medium hover:bg-muted transition-colors"
                >
                  <Bot className="h-3 w-3" />
                  llms.txt
                </button>
                <button
                  onClick={() => openExternal("/llms-full.txt")}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border text-xs font-medium hover:bg-muted transition-colors"
                >
                  <Bot className="h-3 w-3" />
                  llms-full.txt
                </button>
              </div>
            </section>

            <div className="h-px bg-border/60" />

            <section className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
                Autor de la aplicación
              </div>
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">MR</div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-foreground">Miguel Rosa Zazo</p>
                  <p className="text-[11px] text-muted-foreground">Versión digital del Manual SAMUR-PC</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => openExternal("https://github.com/miguelrzazo")}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border text-xs font-medium hover:bg-muted transition-colors"
                >
                  <GitBranch className="h-3 w-3" />
                  GitHub
                </button>
                <button
                  onClick={() => openExternal("mailto:mrosaz00@estudiantes.unileon.es")}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border text-xs font-medium hover:bg-muted transition-colors"
                >
                  <Mail className="h-3 w-3" />
                  Contacto
                </button>
              </div>
            </section>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

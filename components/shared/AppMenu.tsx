"use client";

import { useState } from "react";
import { MoreVertical, ExternalLink, BookOpen, Cookie, Info, Mail } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const APP_VERSION = "0.1.0";

export function AppMenu() {
  const [open, setOpen] = useState(false);

  const openExternal = (href: string) => {
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

          {/* App identity */}
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

            {/* Aviso de uso */}
            <section className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Info className="h-3.5 w-3.5 text-muted-foreground" />
                Aviso de uso
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Adaptación no oficial del Manual de Procedimientos de SAMUR-Protección Civil. El contenido clínico pertenece a SAMUR-PC / Ayuntamiento de Madrid. Esta app no tiene relación oficial con SAMUR.
              </p>
            </section>

            <div className="h-px bg-border/60" />

            {/* Sobre el autor */}
            <section className="space-y-2">
              <p className="text-xs font-semibold text-foreground">Sobre el autor</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Desarrollado por <strong className="text-foreground">Miguel Rosa Zazo</strong>, estudiante de Medicina y TES.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => openExternal("#")}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border text-xs font-medium hover:bg-muted transition-colors"
                >
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                  X / Twitter
                </button>
                <button
                  onClick={() => openExternal("#")}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border text-xs font-medium hover:bg-muted transition-colors"
                >
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                  </svg>
                  GitHub
                </button>
                <button
                  onClick={() => openExternal("mailto:#")}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border text-xs font-medium hover:bg-muted transition-colors"
                >
                  <Mail className="h-3 w-3" />
                  Contacto
                </button>
              </div>
            </section>

            <div className="h-px bg-border/60" />

            {/* Cookies */}
            <section className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Cookie className="h-3.5 w-3.5 text-muted-foreground" />
                Cookies
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Solo se usan cookies propias para guardar favoritos y recientes. Sin analítica ni seguimiento. No se requiere consentimiento (ePrivacy art. 5.3).
              </p>
            </section>

            <div className="h-px bg-border/60" />

            {/* External links */}
            <section className="space-y-1">
              <button
                onClick={() => openExternal("https://www.samurpc.net")}
                className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-xs hover:bg-muted transition-colors text-left text-muted-foreground"
              >
                <ExternalLink className="h-3.5 w-3.5 flex-shrink-0" />
                Colaboradores del manual original
              </button>
              <button
                onClick={() => openExternal("https://manualsamur.com")}
                className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-xs hover:bg-muted transition-colors text-left text-muted-foreground"
              >
                <BookOpen className="h-3.5 w-3.5 flex-shrink-0" />
                Manual original
              </button>
            </section>

          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

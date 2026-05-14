"use client";

import { useMemo, useState } from "react";
import { BookOpen, GitBranch, Mail, Search, Shield } from "lucide-react";
import { normalizeForSearch } from "@/lib/vademecum-utils";
import type { CollaboratorsData } from "@/lib/main-content";

interface Props {
  collaborators: CollaboratorsData;
}

function Block({ title, members }: { title: string; members: string[] }) {
  if (members.length === 0) return null;
  return (
    <section className="rounded-xl border border-border/60 bg-card/40 p-4">
      <h2 className="text-sm font-semibold mb-2">{title}</h2>
      <ul className="grid gap-1 text-sm text-muted-foreground">
        {members.map((member) => (
          <li key={`${title}-${member}`}>{member}</li>
        ))}
      </ul>
    </section>
  );
}

export function ColaboradoresView({ collaborators }: Props) {
  const [query, setQuery] = useState("");
  const normalizedQuery = normalizeForSearch(query);

  const filteredList = useMemo(() => {
    if (!normalizedQuery) return collaborators.list;
    return collaborators.list.filter((name) => normalizeForSearch(name).includes(normalizedQuery));
  }, [collaborators.list, normalizedQuery]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-4 md:py-8 space-y-8">

      {/* About this app */}
      <section>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight mb-4">Acerca de la aplicación</h1>

        {/* Author card */}
        <div className="rounded-xl border border-border/60 bg-card/60 p-4 flex flex-col sm:flex-row sm:items-center gap-4 mb-4">
          <div className="flex-shrink-0 h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-lg font-bold text-primary select-none">
            MR
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">Miguel Rosa Zazo</p>
            <p className="text-xs text-muted-foreground mt-0.5">Desarrollo de la aplicación — versión digital del Manual SAMUR-PC</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <a
              href="https://github.com/miguelrzazo"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/50 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors"
            >
              <GitBranch className="h-3.5 w-3.5" />
              GitHub
            </a>
            <a
              href="mailto:mrosaz00@estudiantes.unileon.es"
              className="flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/50 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors"
            >
              <Mail className="h-3.5 w-3.5" />
              Contacto
            </a>
          </div>
        </div>

        {/* Usage notice */}
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-border/60 bg-card/40 p-4 flex gap-3">
            <BookOpen className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold mb-1">Fuente oficial</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                El contenido clínico procede del{" "}
                <a
                  href="https://servpub.madrid.es/manualsamur"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 hover:text-foreground transition-colors"
                >
                  Manual SAMUR-Protección Civil
                </a>{" "}
                y se sincroniza periódicamente. En caso de discrepancia, prevalece la versión oficial.
              </p>
            </div>
          </div>
          <div className="rounded-xl border border-border/60 bg-card/40 p-4 flex gap-3">
            <Shield className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold mb-1">Aviso de uso</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Esta aplicación es una herramienta de consulta rápida para personal de SAMUR-PC. No sustituye la formación clínica ni el juicio profesional. El uso es exclusivamente interno.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Collaborators */}
      <section>
        <h2 className="text-xl font-bold tracking-tight mb-1">Colaboradores del Manual</h2>
        <p className="text-sm text-muted-foreground mb-4">
          {collaborators.list.length} profesionales contribuyen al Manual SAMUR-PC
          {collaborators.updatedAt ? ` — actualizado ${collaborators.updatedAt}` : ""}
        </p>

        <div className="grid gap-3 md:grid-cols-3 mb-5">
          <Block title="Dirección y coordinación" members={collaborators.blocks.coordination} />
          <Block title="Revisión técnica" members={collaborators.blocks.technicalReview} />
          <Block title="Diseño y programación" members={collaborators.blocks.designAndProgramming} />
        </div>

        <div className="mb-4 rounded-xl border border-border/60 bg-card/50 p-3">
          <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-background px-3 py-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar colaborador"
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
            />
          </div>
        </div>

        <div className="rounded-xl border border-border/60 bg-card/40 p-4">
          <ul className="grid gap-1 md:grid-cols-2 lg:grid-cols-3">
            {filteredList.map((name) => (
              <li key={name} className="text-sm text-muted-foreground">{name}</li>
            ))}
          </ul>
        </div>
      </section>

    </div>
  );
}

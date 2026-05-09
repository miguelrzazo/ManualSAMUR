"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
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
    <div className="max-w-5xl mx-auto px-4 py-4 md:py-8">
      <div className="mb-5 md:mb-7">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Colaboradores</h1>
        <p className="text-sm text-muted-foreground mt-2">
          {filteredList.length} de {collaborators.list.length} colaboradores
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-3 mb-6">
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
    </div>
  );
}

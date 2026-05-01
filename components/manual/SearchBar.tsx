"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { search } from "@/lib/search";
import type { ProcedureMeta } from "@/lib/content";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

const SECTION_COLORS: Record<string, string> = {
  Administrativos: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  Comunicaciones: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
  Operativos: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  SVA: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  SVB: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  "Psicológicos": "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  Técnicas: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300",
};

interface Props {
  procedures: ProcedureMeta[];
}

export function SearchBar({ procedures }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const router = useRouter();

  const results = query.length >= 2 ? search(query, procedures) : procedures.slice(0, 8);

  const grouped = results.reduce<Record<string, ProcedureMeta[]>>((acc, p) => {
    if (!acc[p.section]) acc[p.section] = [];
    acc[p.section].push(p);
    return acc;
  }, {});

  const handleSelect = useCallback(
    (slug: string) => {
      setOpen(false);
      setQuery("");
      router.push(`/manual/${slug}`);
    },
    [router]
  );

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setQuery("");
    }
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 w-full px-3 py-2 rounded-lg border border-border/60 bg-muted/40 text-muted-foreground text-sm hover:bg-muted transition-colors"
      >
        <Search className="h-4 w-4 flex-shrink-0" />
        <span className="flex-1 text-left">Buscar procedimientos...</span>
        <kbd className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs border border-border bg-background font-mono">
          ⌘K
        </kbd>
      </button>

      <CommandDialog open={open} onOpenChange={handleOpenChange}>
        <CommandInput
          placeholder="Buscar procedimientos, sinónimos, tags..."
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          <CommandEmpty>No se encontraron resultados para &quot;{query}&quot;</CommandEmpty>
          {Object.entries(grouped).map(([section, items]) => (
            <CommandGroup key={section} heading={section}>
              {items.map((p) => (
                <CommandItem
                  key={p.id}
                  value={`${p.id} ${p.title} ${p.synonyms.join(" ")} ${p.tags.join(" ")}`}
                  onSelect={() => handleSelect(p.slug)}
                  className="flex items-center gap-3"
                >
                  <span className="font-mono text-xs text-muted-foreground w-10 flex-shrink-0">
                    {p.id}
                  </span>
                  <span className="flex-1">{p.title}</span>
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                      SECTION_COLORS[section] ?? "bg-muted text-muted-foreground"
                    }`}
                  >
                    {section}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>
    </>
  );
}

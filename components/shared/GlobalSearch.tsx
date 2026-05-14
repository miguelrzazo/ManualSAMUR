"use client";

import { useState, useEffect, useCallback } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { FileText, Pill, Code, MapPin } from "lucide-react";
import { globalSearch, type SearchResult } from "@/lib/global-search";
import type { ProcedureMeta } from "@/lib/content";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

interface Props {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  procedures: ProcedureMeta[];
}

const RESULT_ICONS = {
  procedure: FileText,
  drug: Pill,
  code: Code,
  hospital: MapPin,
};

const RESULT_TYPES = {
  procedure: "Procedimiento",
  drug: "Medicamento",
  code: "Código",
  hospital: "Hospital",
};

function renderHighlightedSnippet(result: SearchResult): ReactNode {
  if (!result.snippet) return null;

  const parts: ReactNode[] = [];
  let cursor = 0;

  result.snippet.highlights.forEach(([start, end], index) => {
    if (start > cursor) {
      parts.push(
        <span key={`plain-${index}-${cursor}`}>
          {result.snippet!.text.slice(cursor, start)}
        </span>
      );
    }

    parts.push(
      <mark
        key={`mark-${index}-${start}`}
        className="rounded-sm bg-primary/15 px-0.5 text-foreground"
      >
        {result.snippet!.text.slice(start, end)}
      </mark>
    );
    cursor = end;
  });

  if (cursor < result.snippet.text.length) {
    parts.push(<span key={`tail-${cursor}`}>{result.snippet.text.slice(cursor)}</span>);
  }

  return parts;
}

const FILTER_PREFIXES: Record<string, string> = { ":p": "procedure", ":c": "code", ":v": "drug" };
const FILTER_LABELS: Record<string, string> = { ":p": "Procedimientos", ":c": "Códigos", ":v": "Medicamentos" };

function parseQuery(raw: string): { term: string; filter: string | null } {
  for (const [prefix, type] of Object.entries(FILTER_PREFIXES)) {
    if (raw.startsWith(prefix + " ") || raw === prefix) {
      return { term: raw.slice(prefix.length).trimStart(), filter: type };
    }
  }
  return { term: raw, filter: null };
}

export function GlobalSearch({ isOpen, onOpenChange, procedures }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { term, filter } = parseQuery(query);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [data, setData] = useState<{ drugs: any[]; codes: any[]; hospitals: any[] } | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const [
          vademecum,
          indicativos,
          claves,
          incidente,
          pc,
          icao,
          lima,
          sva,
          svb,
          upsi,
          upsq,
          hospitals,
        ] = await Promise.all([
          import("@/content/data/vademecum.json"),
          import("@/content/data/codigos-indicativos.json"),
          import("@/content/data/codigos-claves.json"),
          import("@/content/data/codigos-incidente.json"),
          import("@/content/data/codigos-pc.json"),
          import("@/content/data/codigos-icao.json"),
          import("@/content/data/codigos-lima.json"),
          import("@/content/data/codigos-sva.json"),
          import("@/content/data/codigos-svb.json"),
          import("@/content/data/codigos-upsi.json"),
          import("@/content/data/codigos-upsq.json"),
          import("@/content/data/hospitals.json"),
        ]);

        if (!mounted) return;

        const drugs = vademecum.default;
        const codes = [
          ...indicativos.default,
          ...claves.default,
          ...incidente.default,
          ...pc.default,
          ...icao.default,
          ...lima.default,
          ...sva.default,
          ...svb.default,
          ...upsi.default,
          ...upsq.default,
        ];

        setData({ drugs, codes, hospitals: hospitals.default });
      } catch (error) {
        console.error("Failed to load search data:", error);
      }
    };
    load();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    const performSearch = async () => {
      if (!term.trim() || !data) {
        setResults([]);
        return;
      }
      setIsLoading(true);
      try {
        const searchResults = await globalSearch(term, procedures, data.drugs, data.codes, data.hospitals);
        setResults(filter ? searchResults.filter((r) => r.type === filter) : searchResults);
      } catch (error) {
        console.error("Search failed:", error);
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    };

    const id = setTimeout(performSearch, 150);
    return () => clearTimeout(id);
  }, [term, filter, data, procedures]);

  const grouped = results.reduce<Record<string, SearchResult[]>>((acc, result) => {
    if (!acc[result.type]) acc[result.type] = [];
    acc[result.type].push(result);
    return acc;
  }, {});

  const handleSelect = useCallback(
    (result: SearchResult) => {
      onOpenChange(false);
      setQuery("");
      router.push(result.href);
    },
    [router, onOpenChange]
  );

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (!nextOpen) setQuery("");
  }, [onOpenChange]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        onOpenChange(!isOpen);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onOpenChange]);

  return (
    <CommandDialog
      open={isOpen}
      onOpenChange={handleOpenChange}
      commandProps={{ shouldFilter: false }}
      className="sm:max-w-lg"
    >
      <div className="flex items-center border-b border-border/50">
        {filter && (
          <span className={`ml-3 flex-shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            filter === "procedure" ? "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300"
            : filter === "code" ? "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300"
            : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
          }`}>
            {filter === "procedure" ? "Procedimientos" : filter === "code" ? "Códigos" : "Medicamentos"}
          </span>
        )}
        <CommandInput
          placeholder={filter
            ? `Buscar en ${filter === "procedure" ? "procedimientos" : filter === "code" ? "códigos" : "medicamentos"}...`
            : "Buscar... (:p proc · :c códigos · :v medicamentos)"}
          value={query}
          onValueChange={setQuery}
          className="border-0 focus:ring-0"
        />
      </div>
      <CommandList>
        {isLoading && (
          <div className="p-4 text-center text-sm text-muted-foreground">Buscando...</div>
        )}
        {!isLoading && term.length >= 2 && results.length === 0 && (
          <CommandEmpty>Sin resultados para &quot;{term}&quot;</CommandEmpty>
        )}
        {!isLoading && term.length < 2 && !results.length && (
          <div className="px-4 py-6 text-center text-sm text-muted-foreground">
            <p>Escribe para buscar en procedimientos, medicamentos y códigos.</p>
            <p className="mt-2 text-xs opacity-70">Filtra con: <code className="bg-muted px-1 rounded">:p</code> proc · <code className="bg-muted px-1 rounded">:c</code> códigos · <code className="bg-muted px-1 rounded">:v</code> medicamentos</p>
          </div>
        )}
        {Object.entries(grouped).map(([type, items]) => (
          <CommandGroup key={type} heading={RESULT_TYPES[type as keyof typeof RESULT_TYPES]}>
            {items.map((result) => {
              const Icon = RESULT_ICONS[result.type as keyof typeof RESULT_ICONS];
              return (
                <CommandItem
                  key={`${result.type}-${result.id}`}
                  value={`${result.type}-${result.id}`}
                  onSelect={() => handleSelect(result)}
                  className="flex items-center gap-3 py-2"
                >
                  <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm leading-snug">{result.title}</div>
                    {result.snippet && (
                      <div className="mt-1 text-[11px] leading-snug text-muted-foreground line-clamp-2">
                        {renderHighlightedSnippet(result)}
                      </div>
                    )}
                    {result.subtitle && (
                      <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                        {result.subtitle}
                      </div>
                    )}
                  </div>
                  {result.badge && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground flex-shrink-0 font-mono">
                      {result.badge}
                    </span>
                  )}
                </CommandItem>
              );
            })}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}

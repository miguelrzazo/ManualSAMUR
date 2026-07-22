"use client";

import { useState, useEffect, useCallback } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { FileText, Pill, Code, MapPin } from "lucide-react";
import { globalSearch, type SearchResult } from "@/lib/global-search";
import { cn } from "@/lib/utils";
import type { ProcedureSearchDoc } from "@/lib/search";
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
}

const RESULT_ICONS = {
  procedure: FileText,
  drug: Pill,
  code: Code,
  hospital: MapPin,
  base: MapPin,
};

const RESULT_TYPES = {
  procedure: "Procedimiento",
  drug: "Medicamento",
  code: "Código",
  hospital: "Hospital",
  base: "Base",
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

/**
 * Chips de filtro, derivados de los propios prefijos para que ambas vías —escribir
 * ":p" o pulsar el chip— no puedan describir cosas distintas. Antes los filtros solo
 * existían como prefijos escritos, invisibles para quien no los conociera.
 */
const FILTER_CHIPS = Object.entries(FILTER_PREFIXES).map(([prefix, type]) => ({
  type,
  prefix,
  label: FILTER_LABELS[prefix],
}));

const CHIP_STYLE: Record<string, string> = {
  procedure: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
  code: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300",
  drug: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
};

function parseQuery(raw: string): { term: string; filter: string | null } {
  for (const [prefix, type] of Object.entries(FILTER_PREFIXES)) {
    if (raw.startsWith(prefix + " ") || raw === prefix) {
      return { term: raw.slice(prefix.length).trimStart(), filter: type };
    }
  }
  return { term: raw, filter: null };
}

export function GlobalSearch({ isOpen, onOpenChange }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { term, filter: prefixFilter } = parseQuery(query);
  const [chipFilter, setChipFilter] = useState<string | null>(null);
  // Si se escribe un prefijo, manda sobre el chip: es la intención más explícita.
  const filter = prefixFilter ?? chipFilter;

  const [data, setData] = useState<{
    procedures: ProcedureSearchDoc[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    drugs: any[]; codes: any[]; hospitals: any[]; bases: any[];
  } | null>(null);

  // Los datasets solo se cargan cuando el usuario abre la búsqueda: antes se
  // descargaban al montar, en todas las páginas, la abriera o no. El índice de
  // procedimientos es un asset estático (~MB) que el navegador cachea entre visitas.
  useEffect(() => {
    if (!isOpen || data) return;

    let mounted = true;
    const load = async () => {
      try {
        const [
          searchIndex,
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
          bases,
        ] = await Promise.all([
          fetch("/search-index.json").then((response) => {
            if (!response.ok) throw new Error(`search-index.json: HTTP ${response.status}`);
            return response.json() as Promise<ProcedureSearchDoc[]>;
          }),
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
          import("@/content/data/bases.json"),
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
          ...sva.default.map((c: Record<string, unknown>) => ({ ...c, _source: "SVA" })),
          ...svb.default.map((c: Record<string, unknown>) => ({ ...c, _source: "SVB" })),
          ...upsi.default,
          ...upsq.default,
        ];

        setData({ procedures: searchIndex, drugs, codes, hospitals: hospitals.default, bases: bases.default });
      } catch (error) {
        console.error("Failed to load search data:", error);
      }
    };
    load();
    return () => { mounted = false; };
  }, [isOpen, data]);

  useEffect(() => {
    const performSearch = async () => {
      if (!term.trim()) {
        setResults([]);
        setIsLoading(false);
        return;
      }

      // El índice se descarga al abrir el diálogo, así que puede haber consultas
      // antes de que llegue. Mostramos "Buscando..." en lugar de "sin resultados":
      // un falso negativo en una referencia clínica es peor que una espera. Al
      // resolverse `data` este efecto se vuelve a ejecutar y lanza la búsqueda.
      if (!data) {
        setIsLoading(true);
        return;
      }

      setIsLoading(true);
      try {
        const searchResults = await globalSearch(term, data.procedures, data.drugs, data.codes, data.hospitals, data.bases);
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
  }, [term, filter, data]);

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
    if (!nextOpen) {
      setQuery("");
      setChipFilter(null);
    }
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
      <CommandInput
        placeholder="Buscar... (:p proc · :c códigos · :v medicamentos)"
        value={query}
        onValueChange={setQuery}
      />
      <div className="flex items-center gap-1.5 border-b border-border/40 px-3 py-2">
        <button
          type="button"
          onClick={() => { setChipFilter(null); if (prefixFilter) setQuery(term); }}
          className={cn(
            "rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-colors",
            !filter ? "bg-foreground text-background" : "bg-muted/60 text-muted-foreground hover:text-foreground",
          )}
        >
          Todo
        </button>
        {FILTER_CHIPS.map((chip) => {
          const active = filter === chip.type;
          return (
            <button
              key={chip.type}
              type="button"
              onClick={() => {
                // Escribir el prefijo gana al chip, así que al pulsar hay que retirarlo.
                if (prefixFilter) setQuery(term);
                setChipFilter(active ? null : chip.type);
              }}
              className={cn(
                "rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-colors",
                active ? CHIP_STYLE[chip.type] : "bg-muted/60 text-muted-foreground hover:text-foreground",
              )}
            >
              {chip.label}
            </button>
          );
        })}
        <span className="ml-auto hidden sm:inline text-[10px] text-muted-foreground/70">
          o escribe :p · :c · :v
        </span>
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
            <p className="mt-2 text-xs opacity-70">Filtra con: <code className="bg-muted px-1 rounded">:p</code> proc · <code className="bg-muted px-1 rounded">:c</code> códigos · <code className="bg-muted px-1 rounded">:v</code> meds</p>
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
                  {result.source && (
                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide flex-shrink-0 ${result.source === "SVA" ? "bg-red-500 text-white" : "bg-blue-500 text-white"}`}>
                      {result.source}
                    </span>
                  )}
                  {result.badge && (
                    // max-w + truncate: en procedimientos el badge es un id corto
                    // ("301"), pero en medicamentos es la presentación completa, que
                    // sin tope desbordaba la fila y tapaba el título.
                    <span
                      title={result.badge}
                      className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground flex-shrink-0 font-mono max-w-[45%] truncate"
                    >
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

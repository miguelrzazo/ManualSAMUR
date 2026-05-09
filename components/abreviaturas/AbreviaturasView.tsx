"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { normalizeForSearch } from "@/lib/vademecum-utils";
import type { AbbreviationSection } from "@/lib/main-content";

interface Props {
  sections: AbbreviationSection[];
}

interface AbbreviationRow {
  letter: string;
  abbreviation: string;
  meaning: string;
}

function flattenSections(sections: AbbreviationSection[]): AbbreviationRow[] {
  return sections.flatMap((section) =>
    section.entries.map((entry) => ({
      letter: section.letter,
      abbreviation: entry.abbreviation,
      meaning: entry.meaning,
    })),
  );
}

export function AbreviaturasView({ sections }: Props) {
  const [query, setQuery] = useState("");
  const normalizedQuery = normalizeForSearch(query);

  const allRows = useMemo(() => flattenSections(sections), [sections]);
  const filteredRows = useMemo(() => {
    if (!normalizedQuery) return allRows;
    return allRows.filter((row) => {
      const haystack = normalizeForSearch(`${row.abbreviation} ${row.meaning}`);
      return haystack.includes(normalizedQuery);
    });
  }, [allRows, normalizedQuery]);

  const filteredSections = useMemo(() => {
    const bucket = new Map<string, AbbreviationSection["entries"]>();
    for (const row of filteredRows) {
      const entries = bucket.get(row.letter) ?? [];
      entries.push({ abbreviation: row.abbreviation, meaning: row.meaning });
      bucket.set(row.letter, entries);
    }

    return [...bucket.entries()]
      .sort(([a], [b]) => a.localeCompare(b, "es"))
      .map(([letter, entries]) => ({ letter, entries }));
  }, [filteredRows]);

  const letters = filteredSections.map((section) => section.letter);

  return (
    <div className="max-w-6xl mx-auto px-4 py-4 md:py-8">
      <div className="mb-5 md:mb-7">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Abreviaturas</h1>
        <p className="text-sm text-muted-foreground mt-2">
          {filteredRows.length} términos
        </p>
      </div>

      <div className="mb-4 rounded-xl border border-border/60 bg-card/50 p-3">
        <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-background px-3 py-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar abreviatura o significado"
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
          />
        </div>
      </div>

      <div className="mb-5 flex gap-2 overflow-x-auto no-scrollbar">
        {letters.map((letter) => (
          <a
            key={letter}
            href={`#abbr-${letter}`}
            className="flex-shrink-0 inline-flex items-center justify-center h-8 w-8 rounded-md border border-border/60 bg-card text-xs font-semibold hover:bg-muted transition-colors"
          >
            {letter}
          </a>
        ))}
      </div>

      <div className="space-y-6">
        {filteredSections.map((section) => (
          <section key={section.letter} id={`abbr-${section.letter}`} className="scroll-mt-24">
            <div className="mb-2">
              <h2 className="text-lg font-bold tracking-tight">{section.letter}</h2>
            </div>
            <div className="overflow-x-auto rounded-xl border border-border/60 bg-card/40">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold">Abreviatura</th>
                    <th className="text-left px-3 py-2 font-semibold">Significado</th>
                  </tr>
                </thead>
                <tbody>
                  {section.entries.map((entry) => (
                    <tr key={`${section.letter}-${entry.abbreviation}`} className="border-t border-border/40">
                      <td className="px-3 py-2 font-mono text-xs md:text-sm">{entry.abbreviation}</td>
                      <td className="px-3 py-2">{entry.meaning}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useMemo, useState, useEffect } from "react";
import {
  ArrowRight,
  BookMarked,
  BookOpen,
  ChevronDown,
  History,
  LayoutGrid,
} from "lucide-react";
import { ManualGraphToggle } from "@/components/manual/ManualGraphToggle";
import { FavoriteButton } from "@/components/manual/FavoriteButton";
import {
  FAVORITES_COOKIE,
  RECENT_COOKIE,
  readCollectionCookie,
  writeCollectionCookie,
} from "@/lib/manual-cookies";
import type { ProcedureMeta } from "@/lib/content";

const SECTION_META: Record<string, { dot: string; badge: string; card: string }> = {
  Administrativos: {
    dot: "bg-slate-400",
    badge: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    card: "border-slate-200 dark:border-slate-700/50",
  },
  Comunicaciones: {
    dot: "bg-violet-500",
    badge: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
    card: "border-violet-200 dark:border-violet-800/40",
  },
  Operativos: {
    dot: "bg-amber-500",
    badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
    card: "border-amber-200 dark:border-amber-800/40",
  },
  SVA: {
    dot: "bg-red-500",
    badge: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
    card: "border-red-200 dark:border-red-800/40",
  },
  SVB: {
    dot: "bg-blue-500",
    badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    card: "border-blue-200 dark:border-blue-800/40",
  },
  "Psicológicos": {
    dot: "bg-emerald-500",
    badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
    card: "border-emerald-200 dark:border-emerald-800/40",
  },
  Técnicas: {
    dot: "bg-cyan-500",
    badge: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300",
    card: "border-cyan-200 dark:border-cyan-800/40",
  },
  General: {
    dot: "bg-slate-400",
    badge: "bg-muted text-muted-foreground",
    card: "border-border",
  },
};

const FALLBACK = SECTION_META.General;

interface Props {
  proceduresBySection: Record<string, ProcedureMeta[]>;
  allProcedures: ProcedureMeta[];
}

function ProcedureRow({
  procedure,
  validIds,
  favoriteIds,
  onFavoritesChange,
}: {
  procedure: ProcedureMeta;
  validIds: string[];
  favoriteIds: string[];
  onFavoritesChange: () => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <FavoriteButton
        procedureId={procedure.id}
        validIds={validIds}
        isFavorited={favoriteIds.includes(procedure.id)}
        className="h-7 w-7 p-0 flex-shrink-0"
        onToggle={onFavoritesChange}
      />
      <Link
        href={`/manual/${procedure.slug}`}
        className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-muted/50 transition-colors group flex-1 min-w-0"
      >
        <span className="font-mono text-xs text-muted-foreground/50 w-10 flex-shrink-0 tabular-nums">{procedure.id}</span>
        <span className="flex-1 text-sm group-hover:text-primary transition-colors truncate">{procedure.title}</span>
        <ArrowRight className="h-3 w-3 text-muted-foreground/20 group-hover:text-primary/60 transition-all group-hover:translate-x-0.5 flex-shrink-0" />
      </Link>
    </div>
  );
}

function CollectionSection({
  icon,
  title,
  procedures,
  validIds,
  favoriteIds,
  onFavoritesChange,
}: {
  icon: React.ReactNode;
  title: string;
  procedures: ProcedureMeta[];
  validIds: string[];
  favoriteIds: string[];
  onFavoritesChange: () => void;
}) {
  if (!procedures.length) return null;

  return (
    <section className="rounded-2xl border border-border/60 bg-card/60 p-4 md:p-5">
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="ml-auto text-xs font-medium tabular-nums px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
          {procedures.length}
        </span>
      </div>
      <div className="grid gap-1">
        {procedures.map((procedure) => (
          <ProcedureRow
            key={`${title}-${procedure.id}`}
            procedure={procedure}
            validIds={validIds}
            favoriteIds={favoriteIds}
            onFavoritesChange={onFavoritesChange}
          />
        ))}
      </div>
    </section>
  );
}

function SectionCard({
  section,
  procedures,
  validIds,
  favoriteIds,
  onFavoritesChange,
}: {
  section: string;
  procedures: ProcedureMeta[];
  validIds: string[];
  favoriteIds: string[];
  onFavoritesChange: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const meta = SECTION_META[section] ?? FALLBACK;

  return (
    <section
      id={`section-${section.toLowerCase()}`}
      className={`rounded-2xl border bg-card/40 overflow-hidden ${meta.card}`}
    >
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-muted/30 transition-colors text-left"
      >
        <div className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${meta.dot}`} />
        <h2 className="font-semibold text-sm flex-1">{section}</h2>
        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold tabular-nums ${meta.badge}`}>
          {procedures.length}
        </span>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground/60 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      {expanded && (
        <div className="px-3 pb-3 grid gap-0.5">
          {procedures.map((procedure) => (
            <ProcedureRow
              key={procedure.id}
              procedure={procedure}
              validIds={validIds}
              favoriteIds={favoriteIds}
              onFavoritesChange={onFavoritesChange}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export function ManualHomeClient({ proceduresBySection, allProcedures }: Props) {
  const validIds = useMemo(() => allProcedures.map((p) => p.id), [allProcedures]);
  const validIdSet = useMemo(() => new Set(validIds), [validIds]);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [recentIds, setRecentIds] = useState<string[]>([]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFavoriteIds(readCollectionCookie(FAVORITES_COOKIE, validIdSet));
    setRecentIds(readCollectionCookie(RECENT_COOKIE, validIdSet));
  }, [validIdSet]);

  function refreshCollections() {
    const nextFavorites = readCollectionCookie(FAVORITES_COOKIE, validIdSet);
    const nextRecents = readCollectionCookie(RECENT_COOKIE, validIdSet);
    writeCollectionCookie(FAVORITES_COOKIE, nextFavorites);
    writeCollectionCookie(RECENT_COOKIE, nextRecents);
    setFavoriteIds(nextFavorites);
    setRecentIds(nextRecents);
  }

  const favorites = favoriteIds
    .map((id) => allProcedures.find((p) => p.id === id))
    .filter(Boolean) as ProcedureMeta[];
  const recents = recentIds
    .map((id) => allProcedures.find((p) => p.id === id))
    .filter(Boolean) as ProcedureMeta[];

  const sectionCount = Object.keys(proceduresBySection).length;
  const latestUpdate = allProcedures
    .map((p) => p.updated)
    .filter(Boolean)
    .sort()
    .at(-1);

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 md:py-10">
      {/* Header */}
      <div className="mb-6">
        <div className="inline-flex items-center gap-2 mb-2">
          <BookOpen className="h-6 w-6 text-primary" />
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Manual de Procedimientos</h1>
        </div>
        <p className="text-muted-foreground text-sm leading-relaxed max-w-2xl">
          Manual de SAMUR-Protección Civil. Usa la búsqueda para ir directo a un procedimiento y mantén a mano tus favoritos y los últimos artículos abiertos.
        </p>
      </div>

      {/* Stats row */}
      <div className="flex flex-wrap gap-2 mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-border/60 bg-card/60 text-sm">
          <LayoutGrid className="h-3.5 w-3.5 text-primary" />
          <span className="font-bold tabular-nums text-foreground">{allProcedures.length}</span>
          <span className="text-muted-foreground">procedimientos</span>
        </div>
        <div className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-border/60 bg-card/60 text-sm">
          <span className="font-bold tabular-nums text-foreground">{sectionCount}</span>
          <span className="text-muted-foreground">secciones</span>
        </div>
        {latestUpdate && (
          <div className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-border/60 bg-card/60 text-sm">
            <span className="text-muted-foreground">Actualizado</span>
            <span className="font-medium text-foreground">{latestUpdate}</span>
          </div>
        )}
      </div>

      {/* Favorites + Recents */}
      {(favorites.length > 0 || recents.length > 0) && (
        <div className="grid gap-4 mb-8 md:grid-cols-2">
          <CollectionSection
            icon={<BookMarked className="h-4 w-4 text-amber-500" />}
            title="Favoritos"
            procedures={favorites}
            validIds={validIds}
            favoriteIds={favoriteIds}
            onFavoritesChange={refreshCollections}
          />
          <CollectionSection
            icon={<History className="h-4 w-4 text-sky-500" />}
            title="Recientes"
            procedures={recents}
            validIds={validIds}
            favoriteIds={favoriteIds}
            onFavoritesChange={refreshCollections}
          />
        </div>
      )}

      {/* Section cards */}
      <ManualGraphToggle procedures={allProcedures}>
        <div className="grid gap-3 md:grid-cols-2">
          {Object.entries(proceduresBySection).map(([section, procedures]) => (
            <SectionCard
              key={section}
              section={section}
              procedures={procedures}
              validIds={validIds}
              favoriteIds={favoriteIds}
              onFavoritesChange={refreshCollections}
            />
          ))}
        </div>
      </ManualGraphToggle>
    </div>
  );
}

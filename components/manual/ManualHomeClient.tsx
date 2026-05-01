"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, BookMarked, History, BookOpen } from "lucide-react";
import { ManualGraphToggle } from "@/components/manual/ManualGraphToggle";
import { FavoriteButton } from "@/components/manual/FavoriteButton";
import {
  FAVORITES_COOKIE,
  RECENT_COOKIE,
  readCollectionCookie,
  writeCollectionCookie,
} from "@/lib/manual-cookies";
import type { ProcedureMeta } from "@/lib/content";

const SECTION_COLORS: Record<string, { dot: string; badge: string }> = {
  Administrativos: { dot: "bg-slate-400", badge: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
  Comunicaciones: { dot: "bg-violet-500", badge: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300" },
  Operativos: { dot: "bg-amber-500", badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
  SVA: { dot: "bg-red-500", badge: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
  SVB: { dot: "bg-blue-500", badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
  "Psicológicos": { dot: "bg-emerald-500", badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" },
  Técnicas: { dot: "bg-cyan-500", badge: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300" },
  General: { dot: "bg-slate-400", badge: "bg-muted text-muted-foreground" },
};

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
    <div className="flex items-center gap-2">
      <FavoriteButton
        procedureId={procedure.id}
        validIds={validIds}
        isFavorited={favoriteIds.includes(procedure.id)}
        className="h-8 w-8 p-0 flex-shrink-0"
        onToggle={onFavoritesChange}
      />
      <Link
        href={`/manual/${procedure.slug}`}
        className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/50 transition-colors group flex-1 min-w-0"
      >
        <span className="font-mono text-xs text-muted-foreground/60 w-12 flex-shrink-0 tabular-nums">{procedure.id}</span>
        <span className="flex-1 text-sm group-hover:text-primary transition-colors">{procedure.title}</span>
        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/20 group-hover:text-primary/60 transition-all group-hover:translate-x-0.5" />
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
        <span className="text-xs text-muted-foreground">{procedures.length}</span>
      </div>
      <div className="grid gap-2">
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

export function ManualHomeClient({ proceduresBySection, allProcedures }: Props) {
  const validIds = useMemo(() => allProcedures.map((procedure) => procedure.id), [allProcedures]);
  const validIdSet = useMemo(() => new Set(validIds), [validIds]);
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() =>
    readCollectionCookie(FAVORITES_COOKIE, validIdSet),
  );
  const [recentIds, setRecentIds] = useState<string[]>(() =>
    readCollectionCookie(RECENT_COOKIE, validIdSet),
  );

  function refreshCollections() {
    const nextFavorites = readCollectionCookie(FAVORITES_COOKIE, validIdSet);
    const nextRecents = readCollectionCookie(RECENT_COOKIE, validIdSet);
    writeCollectionCookie(FAVORITES_COOKIE, nextFavorites);
    writeCollectionCookie(RECENT_COOKIE, nextRecents);
    setFavoriteIds(nextFavorites);
    setRecentIds(nextRecents);
  }

  const favorites = favoriteIds
    .map((id) => allProcedures.find((procedure) => procedure.id === id))
    .filter(Boolean) as ProcedureMeta[];
  const recents = recentIds
    .map((id) => allProcedures.find((procedure) => procedure.id === id))
    .filter(Boolean) as ProcedureMeta[];

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 md:py-10">
      <div className="mb-8">
        <div className="inline-flex items-center gap-2 mb-3">
          <BookOpen className="h-6 w-6 text-primary" />
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Manual de Procedimientos</h1>
        </div>
        <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed">
          Manual de SAMUR-Protección Civil. Usa la búsqueda para ir directo a un procedimiento y mantén a mano tus favoritos y los últimos artículos abiertos.
        </p>
      </div>

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

      <ManualGraphToggle procedures={allProcedures}>
        <div className="grid gap-6">
          {Object.entries(proceduresBySection).map(([section, procedures]) => {
            const colors = SECTION_COLORS[section] ?? SECTION_COLORS.General;
            return (
              <section key={section}>
                <div className="flex items-center gap-2 mb-3">
                  <div className={`h-2.5 w-2.5 rounded-full ${colors.dot}`} />
                  <h2 className="font-semibold text-xs uppercase tracking-widest text-muted-foreground">{section}</h2>
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${colors.badge}`}>
                    {procedures.length}
                  </span>
                </div>
                <div className="grid gap-1.5">
                  {procedures.map((procedure) => (
                    <ProcedureRow
                      key={procedure.id}
                      procedure={procedure}
                      validIds={validIds}
                      favoriteIds={favoriteIds}
                      onFavoritesChange={refreshCollections}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </ManualGraphToggle>
    </div>
  );
}

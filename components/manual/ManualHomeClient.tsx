"use client";

import Link from "next/link";
import { useMemo, useState, useEffect } from "react";
import {
  ArrowRight,
  BookMarked,
  BookOpen,
  ChevronDown,
  FilterX,
  History,
  LayoutGrid,
  Network,
  Rows3,
} from "lucide-react";
import { ManualGraphToggle } from "@/components/manual/ManualGraphToggle";
import { FavoriteButton } from "@/components/manual/FavoriteButton";
import {
  FAVORITES_COOKIE,
  RECENT_COOKIE,
  readCollectionCookie,
  writeCollectionCookie,
} from "@/lib/manual-cookies";
import type { ProcedureMeta, ProcedureSidebarSection } from "@/lib/content";
import type { ManualSyncMetadata } from "@/lib/manual-sync";

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
  sidebarSections: ProcedureSidebarSection[];
  allProcedures: ProcedureMeta[];
  syncMetadata: ManualSyncMetadata;
  initialSection?: string;
  initialGroup?: string;
  initialSubgroup?: string;
}

function formatSyncDate(value: string) {
  if (!value) return "Pendiente";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es", { dateStyle: "medium" }).format(date);
}

function buildManualHref(section?: string, group?: string, subgroup?: string) {
  const params = new URLSearchParams();
  if (section) params.set("section", section);
  if (group) params.set("group", group);
  if (subgroup) params.set("subgroup", subgroup);
  const query = params.toString();
  return query ? `/manual?${query}` : "/manual";
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
  selectedSection,
  selectedGroup,
  selectedSubgroup,
  validIds,
  favoriteIds,
  onFavoritesChange,
}: {
  section: ProcedureSidebarSection;
  selectedSection?: string;
  selectedGroup?: string;
  selectedSubgroup?: string;
  validIds: string[];
  favoriteIds: string[];
  onFavoritesChange: () => void;
}) {
  const [expanded, setExpanded] = useState(
    !selectedSection || selectedSection === section.section,
  );
  const meta = SECTION_META[section.section] ?? FALLBACK;
  const procedures = section.groups.flatMap((group) =>
    group.subgroups.flatMap((subgroup) => subgroup.procedures),
  );

  return (
    <section
      id={`section-${section.section.toLowerCase()}`}
      className={`rounded-2xl border bg-card/40 overflow-hidden ${meta.card}`}
    >
      <button
        onClick={() => setExpanded((value) => !value)}
        className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-muted/30 transition-colors text-left"
      >
        <div className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${meta.dot}`} />
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm">{section.section}</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {section.groups.length} grupos · {procedures.length} procedimientos
          </div>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold tabular-nums ${meta.badge}`}>
          {procedures.length}
        </span>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground/60 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4">
          <div className="flex flex-wrap gap-2 pt-1">
            <Link
              href={buildManualHref(section.section)}
              className="rounded-full border border-border/60 px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            >
              Ver sección
            </Link>
            {section.groups.flatMap((group) =>
              group.subgroups.map((subgroup) => {
                const active = selectedSection === section.section
                  && selectedGroup === group.name
                  && selectedSubgroup === subgroup.name;
                return (
                  <Link
                    key={`${group.name}-${subgroup.name}`}
                    href={buildManualHref(section.section, group.name, subgroup.name)}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                      active
                        ? "bg-primary/10 text-primary"
                        : "bg-muted/50 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {subgroup.name}
                  </Link>
                );
              }),
            )}
          </div>

          {section.groups.map((group) => {
            const visibleSubgroups = group.subgroups.filter((subgroup) => (
              (!selectedGroup || group.name === selectedGroup)
              && (!selectedSubgroup || subgroup.name === selectedSubgroup)
            ));

            if (!visibleSubgroups.length) return null;

            return (
              <div key={`${section.section}-${group.name}`} className="rounded-xl border border-border/50 bg-muted/15 p-3">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    {group.name}
                  </div>
                  <Link
                    href={buildManualHref(section.section, group.name)}
                    className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    filtrar grupo
                  </Link>
                </div>
                <div className="space-y-2">
                  {visibleSubgroups.map((subgroup) => (
                    <div key={`${group.name}-${subgroup.name}`}>
                      <div className="mb-1.5 flex items-center gap-2">
                        <Rows3 className="h-3.5 w-3.5 text-muted-foreground/60" />
                        <div className="text-xs font-medium text-foreground/85">{subgroup.name}</div>
                        <span className="text-[10px] text-muted-foreground/60 tabular-nums">
                          {subgroup.procedures.length}
                        </span>
                      </div>
                      <div className="grid gap-0.5">
                        {subgroup.procedures.map((procedure) => (
                          <ProcedureRow
                            key={procedure.id}
                            procedure={procedure}
                            validIds={validIds}
                            favoriteIds={favoriteIds}
                            onFavoritesChange={onFavoritesChange}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function ManualHomeClient({
  sidebarSections,
  allProcedures,
  syncMetadata,
  initialSection,
  initialGroup,
  initialSubgroup,
}: Props) {
  const validIds = useMemo(() => allProcedures.map((p) => p.id), [allProcedures]);
  const validIdSet = useMemo(() => new Set(validIds), [validIds]);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [recentIds, setRecentIds] = useState<string[]>([]);

  useEffect(() => {
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

  const visibleSections = sidebarSections
    .map((section) => ({
      ...section,
      groups: section.groups
        .map((group) => ({
          ...group,
          subgroups: group.subgroups.filter((subgroup) =>
            (!initialGroup || group.name === initialGroup)
            && (!initialSubgroup || subgroup.name === initialSubgroup),
          ),
        }))
        .filter((group) => group.subgroups.length > 0),
    }))
    .filter((section) =>
      (!initialSection || section.section === initialSection)
      && section.groups.length > 0,
    );

  const visibleProcedures = visibleSections.flatMap((section) =>
    section.groups.flatMap((group) => group.subgroups.flatMap((subgroup) => subgroup.procedures)),
  );
  const sectionCount = sidebarSections.length;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 md:py-10">
      <div className="mb-6">
        <div className="inline-flex items-center gap-2 mb-2">
          <BookOpen className="h-6 w-6 text-primary" />
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Manual de Procedimientos</h1>
        </div>
        <p className="text-muted-foreground text-sm leading-relaxed max-w-3xl">
          Índice visual del manual de SAMUR-Protección Civil. Explora por secciones, grupos y subgrupos para entrar al corpus desde su estructura real, o salta a la gráfica global para recorrer la red entre procedimientos.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        <div className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-border/60 bg-card/60 text-sm">
          <LayoutGrid className="h-3.5 w-3.5 text-primary" />
          <span className="font-bold tabular-nums text-foreground">{allProcedures.length}</span>
          <span className="text-muted-foreground">procedimientos</span>
        </div>
        <div className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-border/60 bg-card/60 text-sm">
          <span className="font-bold tabular-nums text-foreground">{sectionCount}</span>
          <span className="text-muted-foreground">secciones</span>
        </div>
        <div className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-border/60 bg-card/60 text-sm">
          <span className="text-muted-foreground">Versión</span>
          <span className="font-medium text-foreground">{syncMetadata.manualVersion}</span>
          {syncMetadata.lastSyncAt && (
            <>
              <span className="h-4 w-px bg-border" />
              <span className="text-muted-foreground">Sync</span>
              <span className="font-medium text-foreground">{formatSyncDate(syncMetadata.lastSyncAt)}</span>
            </>
          )}
        </div>
        <a
          href="#manual-graph"
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-border/60 bg-card/60 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <Network className="h-3.5 w-3.5" />
          Abrir gráfica global
        </a>
      </div>

      {(initialSection || initialGroup || initialSubgroup) && (
        <div className="mb-6 rounded-2xl border border-border/60 bg-card/60 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">Filtro activo</span>
            {initialSection && <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">{initialSection}</span>}
            {initialGroup && <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">{initialGroup}</span>}
            {initialSubgroup && <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">{initialSubgroup}</span>}
            <span className="ml-auto text-xs text-muted-foreground tabular-nums">
              {visibleProcedures.length} resultados
            </span>
            <Link
              href="/manual"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <FilterX className="h-3.5 w-3.5" />
              Limpiar
            </Link>
          </div>
        </div>
      )}

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

      <div id="manual-graph">
        <ManualGraphToggle procedures={visibleProcedures.length ? visibleProcedures : allProcedures}>
          <div className="grid gap-4 md:grid-cols-2">
            {visibleSections.map((section) => (
              <SectionCard
                key={section.section}
                section={section}
                selectedSection={initialSection}
                selectedGroup={initialGroup}
                selectedSubgroup={initialSubgroup}
                validIds={validIds}
                favoriteIds={favoriteIds}
                onFavoritesChange={refreshCollections}
              />
            ))}
          </div>
        </ManualGraphToggle>
      </div>
    </div>
  );
}

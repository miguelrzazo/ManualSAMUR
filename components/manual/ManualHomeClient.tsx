"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState, useEffect } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookMarked,
  BookOpen,
  ChevronDown,
  ChevronRight,
  FilterX,
  History,
  LayoutGrid,
  Network,
  Rows3,
} from "lucide-react";
import { GraficaGlobal } from "@/components/manual/GraficaGlobal";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FavoriteButton } from "@/components/manual/FavoriteButton";
import {
  FAVORITES_COOKIE,
  RECENT_COOKIE,
  readCollectionCookie,
  writeCollectionCookie,
} from "@/lib/manual-cookies";
import type { ProcedureMeta, ProcedureSidebarSection } from "@/lib/content";
import type { ManualSyncMetadata, ManualUpdateEvent } from "@/lib/manual-sync";
import { toCapitalCase } from "@/lib/title-case";

const SECTIONS_PRIORITY = ["SVA", "SVB", "Operativos", "DRP", "Intervinientes", "Técnicas", "Comunicaciones", "Psicológicos", "Administrativos", "General"];

const SECTION_META: Record<string, { dot: string; badge: string }> = {
  DRP: {
    dot: "bg-orange-500",
    badge: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  },
  Intervinientes: {
    dot: "bg-teal-500",
    badge: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300",
  },
  Administrativos: {
    dot: "bg-slate-400",
    badge: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  },
  Comunicaciones: {
    dot: "bg-violet-500",
    badge: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
  },
  Operativos: {
    dot: "bg-amber-500",
    badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  },
  SVA: {
    dot: "bg-red-500",
    badge: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  },
  SVB: {
    dot: "bg-blue-500",
    badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  },
  "Psicológicos": {
    dot: "bg-emerald-500",
    badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  },
  Técnicas: {
    dot: "bg-cyan-500",
    badge: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300",
  },
  General: {
    dot: "bg-slate-400",
    badge: "bg-muted text-muted-foreground",
  },
};

const FALLBACK = SECTION_META.General;
const FLAT_SECTIONS = new Set(["Administrativos", "Comunicaciones", "DRP", "Intervinientes"]);

interface Props {
  sidebarSections: ProcedureSidebarSection[];
  allProcedures: ProcedureMeta[];
  syncMetadata: ManualSyncMetadata;
  updateEvents: ManualUpdateEvent[];
}

function formatSyncDate(value: string) {
  if (!value) return "Pendiente";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es", { dateStyle: "medium" }).format(date);
}

function SectionPillBar({
  sections,
  activeSection,
  onSelect,
}: {
  sections: ProcedureSidebarSection[];
  activeSection?: string;
  onSelect: (section: string | undefined) => void;
}) {
  const sorted = [...sections].sort((a, b) => {
    const ai = SECTIONS_PRIORITY.indexOf(a.section);
    const bi = SECTIONS_PRIORITY.indexOf(b.section);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 mb-4 no-scrollbar" style={{ scrollbarWidth: "none" }}>
      <button
        onClick={() => onSelect(undefined)}
        className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
          !activeSection
            ? "bg-primary/10 text-primary border-primary/20"
            : "bg-muted/50 text-muted-foreground border-border/50 hover:text-foreground"
        }`}
      >
        Todas
      </button>
      {sorted.map((section) => {
        const meta = SECTION_META[section.section] ?? FALLBACK;
        const count = section.groups.flatMap((g) => g.subgroups.flatMap((s) => s.procedures)).length;
        const active = activeSection === section.section;
        return (
          <button
            key={section.section}
            onClick={() => onSelect(active ? undefined : section.section)}
            className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
              active
                ? "bg-primary/10 text-primary border-primary/20"
                : "bg-muted/50 text-muted-foreground border-border/50 hover:text-foreground"
            }`}
          >
            <div className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
            {toCapitalCase(section.section)}
            <span className="tabular-nums opacity-60">{count}</span>
          </button>
        );
      })}
    </div>
  );
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

function sKey(section: string) { return `s:${section}`; }
function gKey(section: string, group: string) { return `g:${section}|${group}`; }
function sgKey(section: string, group: string, subgroup: string) { return `sg:${section}|${group}|${subgroup}`; }

function ExplorerTree({
  sections,
  effectiveSection,
  validIds,
  favoriteIds,
  onFavoritesChange,
}: {
  sections: ProcedureSidebarSection[];
  effectiveSection?: string;
  validIds: string[];
  favoriteIds: string[];
  onFavoritesChange: () => void;
}) {
  const [openKeys, setOpenKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (effectiveSection) {
      setOpenKeys(new Set([sKey(effectiveSection)]));
    }
  }, [effectiveSection]);

  function toggle(key: string) {
    setOpenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  if (!sections.length) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card/40 px-6 py-10 text-center text-sm text-muted-foreground">
        No hay procedimientos que coincidan con el filtro.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border/60 bg-card/40 overflow-hidden">
      {sections.map((section) => {
        const meta = SECTION_META[section.section] ?? FALLBACK;
        const procedures = section.groups
          .flatMap((g) => g.subgroups.flatMap((sg) => sg.procedures))
          .sort((a, b) => a.id.localeCompare(b.id, "es", { numeric: true }));
        const isSectionOpen = openKeys.has(sKey(section.section));
        const isFlatSection = FLAT_SECTIONS.has(section.section);

        return (
          <div key={section.section} className="border-b border-border/40 last:border-b-0">
            <button
              onClick={() => toggle(sKey(section.section))}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors text-left"
            >
              {isSectionOpen
                ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/60 flex-shrink-0" />
                : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60 flex-shrink-0" />
              }
              <div className={`h-2 w-2 rounded-full flex-shrink-0 ${meta.dot}`} />
              <span className="font-semibold text-sm flex-1">{toCapitalCase(section.section)}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium tabular-nums ${meta.badge}`}>
                {procedures.length}
              </span>
            </button>

            {isSectionOpen && (
              <div className="pb-1">
                {isFlatSection ? (
                  <div className="px-3 pb-2 grid gap-0.5">
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
                ) : section.groups.map((group) => {
                  const isGroupOpen = openKeys.has(gKey(section.section, group.name));
                  const groupProcedures = group.subgroups.flatMap((sg) => sg.procedures);

                  return (
                    <div key={group.name}>
                      <button
                        onClick={() => toggle(gKey(section.section, group.name))}
                        className="w-full flex items-center gap-2.5 pl-9 pr-4 py-2 hover:bg-muted/20 transition-colors text-left"
                      >
                        {isGroupOpen
                          ? <ChevronDown className="h-3 w-3 text-muted-foreground/50 flex-shrink-0" />
                          : <ChevronRight className="h-3 w-3 text-muted-foreground/50 flex-shrink-0" />
                        }
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex-1">
                          {group.name}
                        </span>
                        <span className="text-[10px] tabular-nums text-muted-foreground/60">{groupProcedures.length}</span>
                      </button>

                      {isGroupOpen && (
                        <div>
                          {group.subgroups.map((subgroup) => {
                            const isSubgroupOpen = openKeys.has(sgKey(section.section, group.name, subgroup.name));

                            return (
                              <div key={subgroup.name}>
                                <button
                                  onClick={() => toggle(sgKey(section.section, group.name, subgroup.name))}
                                  className="w-full flex items-center gap-2 pl-14 pr-4 py-1.5 hover:bg-muted/20 transition-colors text-left"
                                >
                                  {isSubgroupOpen
                                    ? <ChevronDown className="h-2.5 w-2.5 text-muted-foreground/40 flex-shrink-0" />
                                    : <ChevronRight className="h-2.5 w-2.5 text-muted-foreground/40 flex-shrink-0" />
                                  }
                                  <Rows3 className="h-3 w-3 text-muted-foreground/40 flex-shrink-0" />
                                  <span className="text-xs text-foreground/80 flex-1">{subgroup.name}</span>
                                  <span className="text-[10px] tabular-nums text-muted-foreground/50">{subgroup.procedures.length}</span>
                                </button>

                                {isSubgroupOpen && (
                                  <div className="pl-14 pr-2 pb-1 grid gap-0.5">
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
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const PREVIEW_NODES = [
  { cx: 50,  cy: 50,  r: 8, fill: "#ef4444" },
  { cx: 120, cy: 28,  r: 5, fill: "#3b82f6" },
  { cx: 200, cy: 55,  r: 6, fill: "#f59e0b" },
  { cx: 80,  cy: 92,  r: 4, fill: "#06b6d4" },
  { cx: 155, cy: 88,  r: 5, fill: "#10b981" },
  { cx: 240, cy: 30,  r: 4, fill: "#8b5cf6" },
  { cx: 270, cy: 72,  r: 4, fill: "#f97316" },
  { cx: 180, cy: 112, r: 3, fill: "#14b8a6" },
  { cx: 30,  cy: 112, r: 3, fill: "#94a3b8" },
];

const PREVIEW_EDGES = [
  [0, 1], [0, 3], [1, 2], [1, 5], [2, 4], [2, 6], [3, 4], [4, 7], [5, 6], [6, 8],
];

function GraphCard({ procedureCount, linkCount, onOpen }: {
  procedureCount: number;
  linkCount: number;
  onOpen: () => void;
}) {
  return (
    <button
      onClick={onOpen}
      className="hidden md:flex w-full items-center gap-5 rounded-2xl border border-border/60 bg-card/40 hover:bg-card/70 transition-colors px-5 py-4 mb-4 text-left group"
    >
      <div className="flex-shrink-0 rounded-xl border border-border/40 bg-muted/30 overflow-hidden w-[140px] h-[76px]">
        <svg width="140" height="76" viewBox="0 0 300 130" className="opacity-60 group-hover:opacity-85 transition-opacity">
          {PREVIEW_EDGES.map(([from, to], i) => {
            const a = PREVIEW_NODES[from];
            const b = PREVIEW_NODES[to];
            return <line key={i} x1={a.cx} y1={a.cy} x2={b.cx} y2={b.cy} stroke="currentColor" strokeOpacity={0.25} strokeWidth={1.2} />;
          })}
          {PREVIEW_NODES.map((node, i) => (
            <circle key={i} cx={node.cx} cy={node.cy} r={node.r} fill={node.fill} opacity={0.85} />
          ))}
        </svg>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <Network className="h-4 w-4 text-primary flex-shrink-0" />
          <span className="text-sm font-semibold">Gráfica de procedimientos</span>
        </div>
        <p className="text-xs text-muted-foreground">
          {procedureCount} nodos · {linkCount} conexiones — mapa de relaciones entre procedimientos
        </p>
      </div>

      <div className="flex-shrink-0 flex items-center gap-1 text-xs font-medium text-primary group-hover:gap-2 transition-all">
        Ver gráfica
        <ArrowRight className="h-3.5 w-3.5" />
      </div>
    </button>
  );
}

export function ManualHomeClient({
  sidebarSections,
  allProcedures,
  syncMetadata,
  updateEvents,
}: Props) {
  const searchParams = useSearchParams();
  const initialSection = searchParams.get("section") ?? undefined;
  const initialGroup = searchParams.get("group") ?? undefined;
  const initialSubgroup = searchParams.get("subgroup") ?? undefined;
  const validIds = useMemo(() => allProcedures.map((p) => p.id), [allProcedures]);
  const validIdSet = useMemo(() => new Set(validIds), [validIds]);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [activeSectionFilter, setActiveSectionFilter] = useState<string | undefined>(initialSection);
  const [view, setView] = useState<"list" | "graph">("list");
  const [historyModalOpen, setHistoryModalOpen] = useState(false);

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

  const sortedSections = [...sidebarSections].sort((a, b) => {
    const ai = SECTIONS_PRIORITY.indexOf(a.section);
    const bi = SECTIONS_PRIORITY.indexOf(b.section);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  const effectiveSection = activeSectionFilter ?? initialSection;

  const visibleSections = sortedSections
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
      (!effectiveSection || section.section === effectiveSection)
      && section.groups.length > 0,
    );

  const visibleProcedures = visibleSections.flatMap((section) =>
    section.groups.flatMap((group) => group.subgroups.flatMap((subgroup) => subgroup.procedures)),
  );

  const isFiltered = Boolean(effectiveSection || initialGroup || initialSubgroup);

  const totalLinks = useMemo(
    () => allProcedures.reduce((acc, p) => acc + (p.related?.length ?? 0), 0),
    [allProcedures],
  );
  const sortedUpdateEvents = useMemo(
    () => [...updateEvents].sort((a, b) => `${b.effectiveDate}|${b.approvedAt ?? ""}`.localeCompare(`${a.effectiveDate}|${a.approvedAt ?? ""}`)),
    [updateEvents],
  );
  const newThisWeekEvents = useMemo(
    () => sortedUpdateEvents.filter((event) => event.isNewThisWeek).slice(0, 10),
    [sortedUpdateEvents],
  );

  return (
    <div className="max-w-6xl mx-auto px-4 py-4 md:py-8">

      {/* Header */}
      <div className="flex items-center gap-2.5 mb-4 md:mb-6">
        <BookOpen className="h-5 w-5 text-primary flex-shrink-0" />
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight leading-tight">Manual SAMUR-PC</h1>
          <p className="text-xs text-muted-foreground hidden md:block">
            {allProcedures.length} procedimientos · {sidebarSections.length} secciones
            {syncMetadata.manualVersionCurrent && ` · ${syncMetadata.manualVersionCurrent}`}
          </p>
        </div>
      </div>

      <section id="historial-global" className="mb-6 rounded-2xl border border-border/60 bg-card/50 p-4 md:p-5">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="text-sm md:text-base font-semibold">Cronograma De Actualizaciones</h2>
          <span className="text-xs text-muted-foreground">{sortedUpdateEvents.length} eventos</span>
        </div>
        {newThisWeekEvents.length > 0 && (
          <div className="mb-4 rounded-xl border border-red-200/70 bg-red-50/70 px-3 py-2 dark:border-red-900/40 dark:bg-red-950/20">
            <p className="text-xs font-semibold text-red-700 dark:text-red-300 mb-1">Novedades (Últimos 7 Días)</p>
            <ul className="grid gap-1">
              {newThisWeekEvents.map((event) => (
                <li key={`new-${event.eventId}`} className="text-xs text-red-700/90 dark:text-red-200/90">
                  {event.procedureIds[0] ? (
                    <Link href={`/manual?procedure=${encodeURIComponent(event.procedureIds[0])}#update-${event.eventId}`} className="underline decoration-red-300 underline-offset-2">
                      {event.summary}
                    </Link>
                  ) : event.officialUrl ? (
                    <a href={event.officialUrl} target="_blank" rel="noopener noreferrer" className="underline decoration-red-300 underline-offset-2">
                      {event.summary}
                    </a>
                  ) : event.summary}
                </li>
              ))}
            </ul>
          </div>
        )}
        <Dialog open={historyModalOpen} onOpenChange={setHistoryModalOpen}>
          <DialogTrigger>
            <button className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
              Ver Historial Global
            </button>
          </DialogTrigger>
          <DialogContent className="w-[95vw] max-w-3xl">
            <DialogHeader>
              <DialogTitle>Cronograma De Actualizaciones</DialogTitle>
            </DialogHeader>
            <div className="max-h-[70vh] overflow-auto pr-1">
              <ul className="grid gap-2">
                {sortedUpdateEvents.map((event) => (
                  <li key={event.eventId} className={`rounded-lg border px-3 py-2 ${event.isNewThisWeek ? "border-red-300/70 bg-red-50/50 dark:border-red-900/40 dark:bg-red-950/20" : "border-border/50 bg-background/60"}`}>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-medium">{formatSyncDate(event.effectiveDate)}</span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                        {event.origin}
                      </span>
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-primary">
                        {event.changeKind}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-foreground/90">{event.summary}</div>
                  </li>
                ))}
              </ul>
            </div>
          </DialogContent>
        </Dialog>
      </section>

      {/* Favorites + Recents */}
      {(favorites.length > 0 || recents.length > 0) && (
        <div className="grid gap-3 mb-6 md:grid-cols-2">
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

      {/* Section pill filter bar */}
      <SectionPillBar
        sections={sortedSections}
        activeSection={activeSectionFilter}
        onSelect={setActiveSectionFilter}
      />

      {/* Active filter info */}
      {isFiltered && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {effectiveSection && (
            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${SECTION_META[effectiveSection]?.badge ?? "bg-muted text-muted-foreground"}`}>
              {toCapitalCase(effectiveSection)}
            </span>
          )}
          {initialGroup && <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">{initialGroup}</span>}
          {initialSubgroup && <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">{initialSubgroup}</span>}
          <span className="text-xs text-muted-foreground tabular-nums">{visibleProcedures.length} resultados</span>
          <Link
            href="/manual"
            onClick={() => setActiveSectionFilter(undefined)}
            className="inline-flex items-center gap-1 rounded-lg border border-border/60 px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <FilterX className="h-3 w-3" />
            Limpiar
          </Link>
        </div>
      )}

      {/* Main content: list or graph */}
      {view === "graph" ? (
        <div>
          <button
            onClick={() => setView("list")}
            className="flex items-center gap-1.5 mb-4 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver a la lista
          </button>
          <GraficaGlobal procedures={allProcedures} />
        </div>
      ) : (
        <>
          <GraphCard
            procedureCount={allProcedures.length}
            linkCount={totalLinks}
            onOpen={() => setView("graph")}
          />
          <ExplorerTree
            sections={visibleSections}
            effectiveSection={effectiveSection}
            validIds={validIds}
            favoriteIds={favoriteIds}
            onFavoritesChange={refreshCollections}
          />
        </>
      )}

      {/* Stats footer */}
      <div className="mt-6 flex flex-wrap gap-2 text-xs text-muted-foreground border-t border-border/40 pt-4">
        <div className="flex items-center gap-1.5">
          <LayoutGrid className="h-3.5 w-3.5" />
          <span><strong className="text-foreground">{allProcedures.length}</strong> procedimientos</span>
        </div>
        {syncMetadata.manualVersionCurrent && (
          <>
            <span className="text-border">·</span>
            <span>Versión: <strong className="text-foreground">{syncMetadata.manualVersionCurrent}</strong></span>
          </>
        )}
        {syncMetadata.lastSyncAt && (
          <>
            <span className="text-border">·</span>
            <span>Última sync: <strong className="text-foreground">{formatSyncDate(syncMetadata.lastSyncAt)}</strong></span>
          </>
        )}
      </div>

      {/* Mobile FAB for graph */}
      {view === "list" && (
        <button
          onClick={() => setView("graph")}
          aria-label="Ver gráfica global"
          className="md:hidden fixed bottom-[calc(4rem+env(safe-area-inset-bottom)+0.75rem)] right-4 z-40 flex items-center gap-2 px-4 py-2.5 rounded-full bg-primary text-primary-foreground shadow-lg text-xs font-semibold"
        >
          <Network className="h-4 w-4" />
          Gráfica
        </button>
      )}
    </div>
  );
}

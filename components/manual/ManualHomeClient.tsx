"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useEffect } from "react";
import {
  ArrowRight,
  BookMarked,
  BookOpen,
  ChevronDown,
  ChevronRight,
  FilterX,
  History,
  LayoutGrid,
  Clock,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FavoriteButton } from "@/components/manual/FavoriteButton";
import {
  FAVORITES_COOKIE,
  RECENT_COOKIE,
  readCollectionCookie,
  writeCollectionCookie,
  readSeenEventIds,
  writeSeenEventIds,
  addSeenEventId,
} from "@/lib/manual-cookies";
import type { ProcedureMeta, ProcedureSidebarSection } from "@/lib/content";
import type { ManualSyncMetadata, ManualUpdateEvent } from "@/lib/manual-sync";

const SECTIONS_PRIORITY = ["SVA", "SVB", "Operativos", "DRP", "Intervinientes", "Técnicas", "Comunicaciones", "Psicológicos", "Administrativos"];

const CATEGORY_LABEL: Record<string, string> = {
  procedure: "Procedimientos",
  codigo: "Códigos",
  vademecum: "Vademécum",
};

const CATEGORY_ICON: Record<string, string> = {
  procedure: "📋",
  codigo: "📻",
  vademecum: "💊",
};

const CATEGORY_ORDER = ["procedure", "codigo", "vademecum"];

const KIND_BADGE: Record<string, string> = {
  nuevo: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  actualizado: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  revisado: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  eliminado: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
  sync: "bg-muted text-muted-foreground",
};

const SECTION_META: Record<string, { dot: string; badge: string; card: string }> = {
  DRP: {
    dot: "bg-orange-500",
    badge: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
    card: "border-orange-200/60 dark:border-orange-800/40",
  },
  Intervinientes: {
    dot: "bg-teal-500",
    badge: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300",
    card: "border-teal-200/60 dark:border-teal-800/40",
  },
  Administrativos: {
    dot: "bg-slate-400",
    badge: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    card: "border-slate-200/60 dark:border-slate-700/40",
  },
  Comunicaciones: {
    dot: "bg-violet-500",
    badge: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
    card: "border-violet-200/60 dark:border-violet-800/40",
  },
  Operativos: {
    dot: "bg-amber-500",
    badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
    card: "border-amber-200/60 dark:border-amber-800/40",
  },
  SVA: {
    dot: "bg-red-500",
    badge: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
    card: "border-red-200/60 dark:border-red-800/40",
  },
  SVB: {
    dot: "bg-blue-500",
    badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    card: "border-blue-200/60 dark:border-blue-800/40",
  },
  "Psicológicos": {
    dot: "bg-emerald-500",
    badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
    card: "border-emerald-200/60 dark:border-emerald-800/40",
  },
  Técnicas: {
    dot: "bg-cyan-500",
    badge: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300",
    card: "border-cyan-200/60 dark:border-cyan-800/40",
  },
  General: {
    dot: "bg-slate-400",
    badge: "bg-muted text-muted-foreground",
    card: "border-border/40",
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

function sortSections(sections: ProcedureSidebarSection[]) {
  return [...sections].sort((a, b) => {
    const ai = SECTIONS_PRIORITY.indexOf(a.section);
    const bi = SECTIONS_PRIORITY.indexOf(b.section);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
}

// ─── Mobile: 2-column section card grid ──────────────────────────────────────
function SectionCardGrid({
  sections,
  activeSection,
  onSelect,
}: {
  sections: ProcedureSidebarSection[];
  activeSection?: string;
  onSelect: (section: string | undefined) => void;
}) {
  const sorted = sortSections(sections);
  return (
    <div className="grid grid-cols-2 gap-2 mb-4">
      {sorted.map((section) => {
        const meta = SECTION_META[section.section] ?? FALLBACK;
        const count = section.groups.flatMap((g) => g.subgroups.flatMap((s) => s.procedures)).length;
        const active = activeSection === section.section;
        return (
          <button
            key={section.section}
            onClick={() => onSelect(active ? undefined : section.section)}
            className={`flex items-center gap-3 rounded-xl border px-3 py-3 text-left transition-all ${
              active
                ? `bg-primary/8 border-primary/30 ring-1 ring-primary/15 ${meta.card}`
                : `bg-card/60 ${meta.card} hover:bg-card/80 hover:border-primary/20`
            }`}
          >
            <div className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${meta.dot}`} />
            <div className="min-w-0">
              <div className={`text-xs font-bold tracking-wide truncate ${active ? "text-primary" : "text-foreground"}`}>
                {section.section.toUpperCase()}
              </div>
              <div className="text-[10px] tabular-nums text-muted-foreground mt-0.5">{count} proc.</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ─── Desktop: underline section tabs ─────────────────────────────────────────
function SectionTabs({
  sections,
  activeSection,
  onSelect,
}: {
  sections: ProcedureSidebarSection[];
  activeSection?: string;
  onSelect: (section: string | undefined) => void;
}) {
  const sorted = sortSections(sections);
  return (
    <div className="flex gap-0 mb-0 border-b border-border/50 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
      <button
        onClick={() => onSelect(undefined)}
        className={`flex-shrink-0 px-4 py-2.5 text-xs font-bold tracking-wide border-b-2 -mb-px transition-colors ${
          !activeSection
            ? "border-primary text-primary"
            : "border-transparent text-muted-foreground hover:text-foreground"
        }`}
      >
        TODAS
      </button>
      {sorted.map((section) => {
        const meta = SECTION_META[section.section] ?? FALLBACK;
        const active = activeSection === section.section;
        return (
          <button
            key={section.section}
            onClick={() => onSelect(active ? undefined : section.section)}
            className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold tracking-wide border-b-2 -mb-px transition-colors ${
              active
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <div className={`h-1.5 w-1.5 rounded-full ${meta.dot} opacity-80`} />
            {section.section.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}

// ─── Shared procedure row ─────────────────────────────────────────────────────
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

// ─── Collection section (favorites / recents) ─────────────────────────────────
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
    <section className="rounded-xl border border-border/60 bg-card/60 p-3 md:p-4">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
        <span className="ml-auto text-xs tabular-nums px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{procedures.length}</span>
      </div>
      <div className="grid gap-0.5">
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

// ─── Explorer tree — groups only, no outer section accordion ─────────────────
function gKey(section: string, group: string) { return `g:${section}|${group}`; }
function sgKey(section: string, group: string, subgroup: string) { return `sg:${section}|${group}|${subgroup}`; }

function ExplorerTree({
  sections,
  validIds,
  favoriteIds,
  onFavoritesChange,
}: {
  sections: ProcedureSidebarSection[];
  validIds: string[];
  favoriteIds: string[];
  onFavoritesChange: () => void;
}) {
  const [openKeys, setOpenKeys] = useState<Set<string>>(new Set());

  function toggle(key: string) {
    setOpenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  if (!sections.length) {
    return (
      <div className="rounded-xl border border-border/60 bg-card/40 px-6 py-10 text-center text-sm text-muted-foreground">
        No hay procedimientos que coincidan.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/60 bg-card/40 overflow-hidden">
      {sections.map((section, si) => {
        const meta = SECTION_META[section.section] ?? FALLBACK;
        const isFlatSection = FLAT_SECTIONS.has(section.section);
        const allProcedures = section.groups.flatMap((g) => g.subgroups.flatMap((sg) => sg.procedures))
          .sort((a, b) => a.id.localeCompare(b.id, "es", { numeric: true }));
        const showSectionDivider = sections.length > 1;

        return (
          <div key={section.section} className={si > 0 ? "border-t border-border/40" : ""}>
            {/* Section label — only shown when multiple sections visible (TODAS mode) */}
            {showSectionDivider && (
              <div className="flex items-center gap-2 px-4 py-2 bg-muted/20 border-b border-border/30">
                <div className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                <span className={`text-[10px] font-bold uppercase tracking-widest ${meta.badge} px-1.5 py-0.5 rounded`}>
                  {section.section}
                </span>
                <span className="text-[10px] tabular-nums text-muted-foreground ml-auto">{allProcedures.length}</span>
              </div>
            )}

            <div className="pb-1">
              {isFlatSection ? (
                <div className="px-3 py-1 grid gap-0.5">
                  {allProcedures.map((procedure) => (
                    <ProcedureRow
                      key={procedure.id}
                      procedure={procedure}
                      validIds={validIds}
                      favoriteIds={favoriteIds}
                      onFavoritesChange={onFavoritesChange}
                    />
                  ))}
                </div>
              ) : (
                section.groups.map((group) => {
                  const isGroupOpen = openKeys.has(gKey(section.section, group.name));
                  const groupCount = group.subgroups.flatMap((sg) => sg.procedures).length;

                  return (
                    <div key={group.name}>
                      <button
                        onClick={() => toggle(gKey(section.section, group.name))}
                        className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-muted/30 transition-colors text-left"
                      >
                        {isGroupOpen
                          ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/60 flex-shrink-0" />
                          : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60 flex-shrink-0" />
                        }
                        <span className="text-sm font-semibold text-foreground flex-1">{group.name}</span>
                        <span className="text-[10px] tabular-nums text-muted-foreground/60 font-medium">{groupCount}</span>
                      </button>

                      {isGroupOpen && (
                        <div className="pb-1">
                          {group.subgroups.length === 1 ? (
                            // Single subgroup: skip subgroup header, list procedures directly
                            <div className="pl-9 pr-2 grid gap-0.5">
                              {group.subgroups[0].procedures.map((procedure) => (
                                <ProcedureRow
                                  key={procedure.id}
                                  procedure={procedure}
                                  validIds={validIds}
                                  favoriteIds={favoriteIds}
                                  onFavoritesChange={onFavoritesChange}
                                />
                              ))}
                            </div>
                          ) : (
                            group.subgroups.map((subgroup) => {
                              const isSubgroupOpen = openKeys.has(sgKey(section.section, group.name, subgroup.name));
                              return (
                                <div key={subgroup.name}>
                                  <button
                                    onClick={() => toggle(sgKey(section.section, group.name, subgroup.name))}
                                    className="w-full flex items-center gap-2 pl-9 pr-4 py-1.5 hover:bg-muted/20 transition-colors text-left"
                                  >
                                    {isSubgroupOpen
                                      ? <ChevronDown className="h-2.5 w-2.5 text-muted-foreground/40 flex-shrink-0" />
                                      : <ChevronRight className="h-2.5 w-2.5 text-muted-foreground/40 flex-shrink-0" />
                                    }
                                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex-1">{subgroup.name}</span>
                                    <span className="text-[10px] tabular-nums text-muted-foreground/50">{subgroup.procedures.length}</span>
                                  </button>
                                  {isSubgroupOpen && (
                                    <div className="pl-12 pr-2 pb-1 grid gap-0.5">
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
                            })
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function ManualHomeClient({
  sidebarSections,
  allProcedures,
  syncMetadata,
  updateEvents,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialSection = searchParams.get("section") ?? undefined;
  const initialGroup = searchParams.get("group") ?? undefined;
  const initialSubgroup = searchParams.get("subgroup") ?? undefined;
  const validIds = useMemo(() => allProcedures.map((p) => p.id), [allProcedures]);
  const validIdSet = useMemo(() => new Set(validIds), [validIds]);
  const idToSlug = useMemo(() => new Map(allProcedures.map((p) => [p.id, p.slug])), [allProcedures]);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [seenEventIds, setSeenEventIds] = useState<string[]>([]);
  const [activeSectionFilter, setActiveSectionFilter] = useState<string | undefined>(initialSection);

  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [expandedDiffs, setExpandedDiffs] = useState<Set<string>>(new Set());

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFavoriteIds(readCollectionCookie(FAVORITES_COOKIE, validIdSet));
    setRecentIds(readCollectionCookie(RECENT_COOKIE, validIdSet));
    setSeenEventIds(readSeenEventIds());
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

  const sortedSections = sortSections(sidebarSections);
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



  const sortedUpdateEvents = useMemo(
    () => [...updateEvents].sort((a, b) => `${b.effectiveDate}|${b.approvedAt ?? ""}`.localeCompare(`${a.effectiveDate}|${a.approvedAt ?? ""}`)),
    [updateEvents],
  );
  const newThisWeekEvents = sortedUpdateEvents.filter((e) => e.isNewThisWeek);
  const unseenNewCount = newThisWeekEvents.filter((e) => !seenEventIds.includes(e.eventId)).length;

  const syncGroups = useMemo(() => {
    const groupMap = new Map<string, ManualUpdateEvent[]>();
    for (const event of sortedUpdateEvents.filter((e) => e.isNewThisWeek)) {
      const dateKey = (event.approvedAt ?? event.effectiveDate).slice(0, 10);
      const group = groupMap.get(dateKey) ?? [];
      group.push(event);
      groupMap.set(dateKey, group);
    }
    return [...groupMap.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, events]) => {
        const catMap = new Map<string, ManualUpdateEvent[]>();
        for (const event of events) {
          const cat = event.category ?? "procedure";
          const catEvents = catMap.get(cat) ?? [];
          catEvents.push(event);
          catMap.set(cat, catEvents);
        }
        const categoryGroups = CATEGORY_ORDER
          .filter((cat) => catMap.has(cat))
          .map((cat) => ({ category: cat, events: catMap.get(cat)! }));
        return { date, categoryGroups };
      });
  }, [sortedUpdateEvents]);

  function handleExpandDiff(eventId: string, isNew: boolean) {
    setExpandedDiffs((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
    if (isNew) {
      const next = addSeenEventId(seenEventIds, eventId);
      if (next !== seenEventIds) {
        writeSeenEventIds(next);
        setSeenEventIds(next);
      }
    }
  }

  function openHistoryModal() {
    setHistoryModalOpen(true);
    let updatedSeen = seenEventIds;
    for (const event of newThisWeekEvents) {
      if (!event.diff) updatedSeen = addSeenEventId(updatedSeen, event.eventId);
    }
    if (updatedSeen !== seenEventIds) {
      writeSeenEventIds(updatedSeen);
      setSeenEventIds(updatedSeen);
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-4 md:py-6">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-3 mb-4 md:mb-5">
        <div className="flex items-center gap-2.5">
          <BookOpen className="h-5 w-5 text-primary flex-shrink-0" />
          <div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight leading-tight">Manual Procedimientos</h1>
            <p className="text-[11px] font-medium text-muted-foreground/80 mt-1 uppercase tracking-wider">
              SAMUR - Protección Civil <span className="text-red-500 font-bold opacity-80">(Versión NO Oficial)</span>
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {allProcedures.length} procedimientos · {sidebarSections.length} secciones
            </p>
          </div>
        </div>

        {/* History pill — compact, low prominence */}
        <div className="flex items-center gap-2">
          {sortedUpdateEvents.length > 0 && (
            <button
              onClick={openHistoryModal}
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors border ${
                unseenNewCount > 0
                  ? "bg-red-50 border-red-200/70 text-red-700 dark:bg-red-950/20 dark:border-red-900/40 dark:text-red-300"
                  : "bg-muted/50 border-border/40 text-muted-foreground hover:text-foreground"
              }`}
            >
              <Clock className="h-3 w-3" />
              {unseenNewCount > 0
                ? `${unseenNewCount} nuevo${unseenNewCount > 1 ? "s" : ""}`
                : "Historial"}
            </button>
          )}
        </div>
      </div>

      {/* ── Timeline history modal ── */}
      <Dialog open={historyModalOpen} onOpenChange={setHistoryModalOpen}>
        <DialogContent className="w-[95vw] max-w-7xl h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-5 pt-5 pb-3 border-b border-border/40 flex-shrink-0">
            <DialogTitle className="flex items-center gap-2 text-base">
              <History className="h-4 w-4" />
              Historial de actualizaciones
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto px-5 py-4">
            <div className="relative pl-6">
              {/* vertical timeline line */}
              <div className="absolute left-2 top-2 bottom-2 w-px bg-border/50" />

              <div className="grid gap-6">
                {syncGroups.map((group) => (
                  <div key={group.date}>
                    {/* Sync node */}
                    <div className="flex items-center gap-2 mb-3 -ml-6">
                      <div className="h-4 w-4 rounded-full border-2 border-primary bg-background flex-shrink-0 z-10" />
                      <span className="text-xs font-semibold text-foreground/70">
                        Sync — {formatSyncDate(group.date)}
                      </span>
                    </div>

                    {/* Category sub-groups */}
                    <div className="grid gap-3">
                      {group.categoryGroups.map((catGroup) => (
                        <div key={catGroup.category}>
                          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-1.5 flex items-center gap-1.5">
                            <span>{CATEGORY_ICON[catGroup.category]}</span>
                            {CATEGORY_LABEL[catGroup.category]}
                          </div>
                          <div className="grid gap-1.5 pl-1">
                            {catGroup.events.map((event) => {
                              const isUnseen = event.isNewThisWeek && !seenEventIds.includes(event.eventId);
                              const isExpanded = expandedDiffs.has(event.eventId);
                              return (
                                <div
                                  key={event.eventId}
                                  className={`rounded-lg border overflow-hidden ${
                                    isUnseen
                                      ? "border-red-200/70 bg-red-50/30 dark:border-red-900/40 dark:bg-red-950/10"
                                      : "border-border/40 bg-background/40"
                                  }`}
                                >
                                  <div className="flex items-start gap-2 px-3 py-2.5">
                                    {isUnseen && (
                                      <div className="h-1.5 w-1.5 rounded-full bg-red-500 flex-shrink-0 mt-1" />
                                    )}
                                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold tracking-wide flex-shrink-0 mt-0.5 ${KIND_BADGE[event.changeKind] ?? KIND_BADGE.sync}`}>
                                      {event.changeKind.toUpperCase()}
                                    </span>
                                    {(() => {
                                      const cat = event.category ?? "procedure";
                                      const pid = event.procedureIds[0];
                                      const href = cat === "codigo"
                                        ? "/codigos"
                                        : cat === "vademecum"
                                          ? "/vademecum"
                                          : pid && idToSlug.has(pid)
                                            ? `/manual/${idToSlug.get(pid)}`
                                            : null;
                                      return href ? (
                                        <button
                                          onClick={() => { router.push(href); setHistoryModalOpen(false); }}
                                          className="text-sm flex-1 text-foreground/80 min-w-0 text-left hover:text-primary hover:underline transition-colors leading-snug"
                                        >
                                          {event.summary}
                                        </button>
                                      ) : (
                                        <span className="text-sm flex-1 text-foreground/80 min-w-0 leading-snug">{event.summary}</span>
                                      );
                                    })()}
                                    {event.diff && (
                                      <button
                                        onClick={() => handleExpandDiff(event.eventId, event.isNewThisWeek)}
                                        className="flex-shrink-0 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mt-0.5"
                                      >
                                        {isExpanded ? "Ocultar" : "Ver diff"}
                                        <ChevronDown className={`h-3 w-3 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                                      </button>
                                    )}
                                  </div>
                                  {event.diff && isExpanded && (
                                    <div className="border-t border-border/60 bg-muted/20 px-4 py-3 font-mono text-xs leading-relaxed overflow-x-auto overflow-y-auto" style={{ maxHeight: "min(50vh, 400px)" }}>
                                      {event.diff.split("\n").map((line, i) => (
                                        <div
                                          key={i}
                                          className={`whitespace-pre px-1 rounded-sm ${
                                            line.startsWith("+") && !line.startsWith("+++")
                                              ? "text-emerald-700 dark:text-emerald-400 bg-emerald-50/60 dark:bg-emerald-950/20"
                                              : line.startsWith("-") && !line.startsWith("---")
                                              ? "text-red-700 dark:text-red-400 bg-red-50/60 dark:bg-red-950/20"
                                              : line.startsWith("@@")
                                              ? "text-blue-600 dark:text-blue-400 font-semibold"
                                              : "text-muted-foreground"
                                          }`}
                                        >
                                          {line || " "}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Favorites + Recents ── */}
      {(favorites.length > 0 || recents.length > 0) && (
        <div className="grid gap-2.5 mb-4 md:grid-cols-2">
          <CollectionSection
            icon={<BookMarked className="h-3.5 w-3.5 text-amber-500" />}
            title="Favoritos"
            procedures={favorites}
            validIds={validIds}
            favoriteIds={favoriteIds}
            onFavoritesChange={refreshCollections}
          />
          <CollectionSection
            icon={<History className="h-3.5 w-3.5 text-sky-500" />}
            title="Recientes"
            procedures={recents}
            validIds={validIds}
            favoriteIds={favoriteIds}
            onFavoritesChange={refreshCollections}
          />
        </div>
      )}

      {/* ── Main explorer ── */}
      {/* MOBILE: section card grid */}
      <div className="md:hidden">
        <SectionCardGrid
          sections={sortedSections}
          activeSection={activeSectionFilter}
          onSelect={setActiveSectionFilter}
        />
      </div>

      {/* DESKTOP: underline section tabs */}
      <div className="hidden md:block">
        <SectionTabs
          sections={sortedSections}
          activeSection={activeSectionFilter}
          onSelect={setActiveSectionFilter}
        />
      </div>

      {/* Filter breadcrumb + clear */}
      {(effectiveSection || initialGroup || initialSubgroup) && (
        <div className="flex flex-wrap items-center gap-1.5 mt-3 mb-2">
          {effectiveSection && (
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${SECTION_META[effectiveSection]?.badge ?? "bg-muted text-muted-foreground"}`}>
              {effectiveSection.toUpperCase()}
            </span>
          )}
          {initialGroup && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{initialGroup}</span>
          )}
          <span className="text-[11px] text-muted-foreground tabular-nums">{visibleProcedures.length} resultados</span>
          <Link
            href="/manual"
            onClick={() => setActiveSectionFilter(undefined)}
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors ml-auto"
          >
            <FilterX className="h-3 w-3" />
            Limpiar
          </Link>
        </div>
      )}

      {/* Explorer tree — groups only, no section accordion */}
      <div className={effectiveSection ? "mt-3" : "mt-3 md:mt-0"}>
        {/* On mobile: only show tree when a section is selected */}
        <div className={`md:hidden ${effectiveSection ? "" : "hidden"}`}>
          <ExplorerTree
            sections={visibleSections}
            validIds={validIds}
            favoriteIds={favoriteIds}
            onFavoritesChange={refreshCollections}
          />
        </div>
        {/* On desktop: always show tree */}
        <div className="hidden md:block">
          <ExplorerTree
            sections={visibleSections}
            validIds={validIds}
            favoriteIds={favoriteIds}
            onFavoritesChange={refreshCollections}
          />
        </div>
      </div>

      {/* ── Footer stats ── */}
      <div className="mt-6 flex flex-wrap gap-3 text-[11px] text-muted-foreground border-t border-border/40 pt-3">
        <div className="flex items-center gap-1">
          <LayoutGrid className="h-3 w-3" />
          <span><strong className="text-foreground">{allProcedures.length}</strong> procedimientos</span>
        </div>
        {syncMetadata.manualVersionCurrent && (
          <span>Versión: <strong className="text-foreground">{syncMetadata.manualVersionCurrent}</strong></span>
        )}
        {syncMetadata.lastSyncAt && (
          <span>Sync: <strong className="text-foreground">{formatSyncDate(syncMetadata.lastSyncAt)}</strong></span>
        )}
      </div>


    </div>
  );
}

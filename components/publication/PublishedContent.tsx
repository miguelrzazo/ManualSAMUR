/* eslint-disable @next/next/no-html-link-for-pages -- Published slugs may not have static Next route assets; full navigation uses the Worker shell fallback. */
"use client";

import { useEffect, useState, type ComponentProps } from "react";
import type { MobileContentSnapshot, MobileProcedure } from "@/packages/manual-content/src/schema";
import { CodigosView } from "@/components/codigos/CodigosView";
import { VademecumView } from "@/components/vademecum/VademecumView";
import { AbreviaturasView } from "@/components/abreviaturas/AbreviaturasView";
import { ProcedureVisitTracker } from "@/components/manual/ProcedureVisitTracker";
import { readCollectionCookie, FAVORITES_COOKIE, RECENT_COOKIE } from "@/lib/manual-cookies";
import { FavoriteButton } from "@/components/manual/FavoriteButton";
import { ShareButton } from "@/components/manual/ShareButton";
import { PublishedProcedureBody } from "./PublishedEditorialBlocks";
import { ManualHomeClient } from "@/components/manual/ManualHomeClient";
import { TableOfContents } from "@/components/manual/TableOfContents";
import type { ProcedureNavMeta, ProcedureSidebarSection } from "@/lib/content";
import type { ManualHomeData } from "@/lib/manual-updates-logic";
import { BreakingNewsTicker } from "@/components/shared/BreakingNewsTicker";

/** Preserve the established groups, while taking identities and titles from the active publication. */
export function publicationSections(procedures: MobileProcedure[], original: ProcedureSidebarSection[]): ProcedureSidebarSection[] {
  const byId = new Map(procedures.map(({ id, title, slug, section }) => [id, { id, title, slug, section }]));
  const seen = new Set<string>();
  const sections = original.map(({ section, groups }) => ({ section, groups: groups.map(({ name, subgroups }) => ({ name, subgroups: subgroups.map(({ name, procedures }) => ({ name, procedures: procedures.flatMap((item) => {
    const current = byId.get(item.id);
    if (!current || current.section !== section || seen.has(item.id)) return [];
    seen.add(item.id);
    return [current];
  }) })).filter((group) => group.procedures.length) })).filter((group) => group.subgroups.length) })).filter((section) => section.groups.length);
  for (const item of byId.values()) {
    if (seen.has(item.id)) continue;
    let section = sections.find((entry) => entry.section === item.section);
    if (!section) { section = { section: item.section, groups: [] }; sections.push(section); }
    let group = section.groups.find((entry) => entry.name === "Otros");
    if (!group) { group = { name: "Otros", subgroups: [{ name: "Otros", procedures: [] }] }; section.groups.push(group); }
    group.subgroups[0].procedures.push(item as ProcedureNavMeta);
  }
  return sections;
}

export function PublicationSearch({ snapshot }: { snapshot: MobileContentSnapshot }) {
  const [query, setQuery] = useState("");
  const [section, setSection] = useState("");
  const [collection, setCollection] = useState("all");
  const validIds = new Set(snapshot.content.procedures.map((item) => item.id));
  const savedIds = collection === "all" ? null : new Set(readCollectionCookie(collection === "favorites" ? FAVORITES_COOKIE : RECENT_COOKIE, validIds));
  const text = query.toLocaleLowerCase("es").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const matches = snapshot.content.procedures.filter((procedure) => (!section || procedure.section === section) && (!savedIds || savedIds.has(procedure.id)) && `${procedure.id} ${procedure.title} ${procedure.searchText} ${procedure.tags.join(" ")} ${procedure.synonyms.join(" ")}`.toLocaleLowerCase("es").normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(text));
  return <div><label htmlFor="publication-search" className="block text-sm font-medium">Buscar en el manual publicado</label><input id="publication-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} className="mt-2 min-h-11 w-full rounded-lg border border-border bg-background px-3" placeholder="Procedimiento, código o término…" /><div className="mt-3 flex flex-wrap gap-3"><label className="text-sm">Sección<select value={section} onChange={(event) => setSection(event.target.value)} className="ml-2 min-h-11 rounded-md border border-border bg-background px-2"><option value="">Todas</option>{[...new Set(snapshot.content.procedures.map((item) => item.section))].sort().map((name) => <option key={name}>{name}</option>)}</select></label><label className="text-sm">Colección<select value={collection} onChange={(event) => setCollection(event.target.value)} className="ml-2 min-h-11 rounded-md border border-border bg-background px-2"><option value="all">Todos</option><option value="favorites">Favoritos</option><option value="recent">Recientes</option></select></label></div><p className="my-3 text-sm text-muted-foreground" role="status">{matches.length} procedimientos</p><ul className="divide-y divide-border">{matches.map((procedure) => <li key={procedure.id}><a href={`/manual/${encodeURIComponent(procedure.slug)}`} className="flex gap-3 py-4 hover:text-primary"><span className="font-mono text-sm text-muted-foreground">{procedure.id}</span><span><span className="font-medium">{procedure.title}</span><span className="mt-1 block text-xs text-muted-foreground">{procedure.section}</span></span></a></li>)}</ul></div>;
}

function Procedure({ procedure, snapshot }: { procedure: MobileProcedure; snapshot: MobileContentSnapshot }) {
  const relatedIds = new Set([...procedure.related, ...procedure.backlinks]);
  const related = snapshot.content.procedures.filter((item) => relatedIds.has(item.id));
  return <article className="mx-auto max-w-4xl px-4 py-8"><ProcedureVisitTracker procedureId={procedure.id} validIds={snapshot.content.procedures.map((item) => item.id)} /><a href="/manual" className="text-sm text-primary underline">← Manual</a><p className="mt-6 text-sm text-muted-foreground">{procedure.id} · {procedure.section}</p><h1 className="mt-2 break-words text-3xl font-bold tracking-tight [overflow-wrap:anywhere]">{procedure.title}</h1><div className="my-5 flex items-center gap-3"><FavoriteButton procedureId={procedure.id} validIds={snapshot.content.procedures.map((item) => item.id)} /><ShareButton title={procedure.title} url={typeof window === "undefined" ? `/manual/${encodeURIComponent(procedure.slug)}` : `${window.location.origin}/manual/${encodeURIComponent(procedure.slug)}`} markdown={procedure.content} /><span className="text-xs text-muted-foreground">Actualizado: {procedure.updated || snapshot.generatedAt.slice(0, 10)}</span></div><TableOfContents articleId="published-procedure-content" pageTitle={procedure.title} collapsible /><div id="published-procedure-content"><PublishedProcedureBody procedure={procedure} snapshot={snapshot} /></div>{procedure.attachments.length > 0 && <section className="mt-8 border-t border-border pt-5"><h2 className="font-semibold">Documentos e imágenes</h2><ul>{procedure.attachments.map((attachment) => <li key={attachment.id}><a className="inline-flex min-h-11 items-center text-primary underline" href={attachment.localPath}>{attachment.filename}</a></li>)}</ul></section>}{related.length > 0 && <section className="mt-8 border-t border-border pt-5"><h2 className="font-semibold">Procedimientos relacionados</h2>{related.map((item) => <a key={item.id} className="block py-3 text-primary underline" href={`/manual/${encodeURIComponent(item.slug)}`}>{item.id} · {item.title}</a>)}</section>}</article>;
}

const EMPTY_HOME: ManualHomeData = { syncMetadata: { manualVersionCurrent: "", lastSyncAt: "", ticker: { enabledUntil: "", items: [] }, tickerEnabled: false }, pillEvents: [], historyCount: 0, tickerEventIds: [] };

/** The published home keeps the static page's red banner and update history, read from public/manual-home.json. */
function PublishedHome({ snapshot, sidebarSections }: { snapshot: MobileContentSnapshot; sidebarSections: ProcedureSidebarSection[] }) {
  const [home, setHome] = useState<ManualHomeData>(EMPTY_HOME);
  useEffect(() => {
    let active = true;
    fetch("/manual-home.json").then((response) => response.ok ? response.json() as Promise<ManualHomeData> : null).then((data) => { if (active && data) setHome(data); }).catch((error) => console.error("No se pudo cargar el historial:", error));
    return () => { active = false; };
  }, []);
  const syncMetadata = { ...home.syncMetadata, lastSyncAt: home.syncMetadata.lastSyncAt || snapshot.generatedAt };
  return <>
    <BreakingNewsTicker metadata={syncMetadata} recentEventIds={home.tickerEventIds} />
    <ManualHomeClient sidebarSections={publicationSections(snapshot.content.procedures, sidebarSections)} allProcedures={snapshot.content.procedures} syncMetadata={syncMetadata} pillEvents={home.pillEvents} historyCount={home.historyCount} />
  </>;
}

export function PublishedContent({ snapshot, pathname, sidebarSections }: { snapshot: MobileContentSnapshot; pathname: string; sidebarSections: ProcedureSidebarSection[] }) {
  const content = snapshot.content;
  if (pathname === "/manual" || pathname === "/") return <PublishedHome snapshot={snapshot} sidebarSections={sidebarSections} />;
  if (pathname.startsWith("/manual/")) {
    let slug = pathname.slice("/manual/".length);
    try { slug = decodeURIComponent(slug); } catch { /* Unrecognised URL is handled below. */ }
    const procedure = content.procedures.find((item) => item.slug === slug);
    return procedure ? <Procedure procedure={procedure} snapshot={snapshot} /> : <section className="mx-auto max-w-3xl px-4 py-12"><h1 className="text-2xl font-bold">Procedimiento no disponible</h1><p className="mt-3">Este procedimiento no forma parte de la publicación activa. Puede haber sido archivado o cambiado de dirección.</p><a href="/manual" className="mt-4 inline-flex min-h-11 items-center text-primary underline">Consultar el manual vigente</a></section>;
  }
  if (pathname === "/codigos") {
    const props = { ...content.codes, bases: content.bases, hospitals: content.hospitals, status4: content.status4 } as unknown as ComponentProps<typeof CodigosView>;
    return <CodigosView {...props} />;
  }
  if (pathname === "/vademecum") return <VademecumView {...({ drugs: content.drugs, perfusiones: content.perfusions, fluidos: content.fluids, comerciales: content.commercialNames } as unknown as ComponentProps<typeof VademecumView>)} />;
  if (pathname === "/abreviaturas") return <AbreviaturasView sections={content.abbreviations as unknown as ComponentProps<typeof AbreviaturasView>["sections"]} />;
  return null;
}

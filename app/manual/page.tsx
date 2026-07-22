import { getProcedureNavMeta, getProcedureSidebarSections } from "@/lib/content";
import { ManualHomeClient } from "@/components/manual/ManualHomeClient";
import { readManualHistoryDataset, readManualSyncMetadata, readManualUpdatesDataset } from "@/lib/manual-sync";
import type { ManualSyncClientMetadata, UpdatePillEvent } from "@/lib/manual-updates-logic";
import { BreakingNewsTicker } from "@/components/shared/BreakingNewsTicker";

import { Suspense } from "react";

export default async function ManualPage() {
  const sidebarSections = getProcedureSidebarSections();
  const allProcedures = getProcedureNavMeta();
  const syncMetadata = readManualSyncMetadata();
  const updatesDataset = readManualUpdatesDataset();
  const historyCount = readManualHistoryDataset().entries.length;

  // Los IDs que el banner considera "pendientes de ver" son los de sus propios
  // elementos. Antes se filtraba por isRecent, que ahora se calcula en cliente
  // (en servidor quedaba congelado en tiempo de build), así que aquí siempre saldría
  // vacío y el banner nunca podría descartarse al haberlo visto.
  const tickerEventIds = syncMetadata.ticker.items
    .map((item) => item.eventId)
    .filter((id): id is string => Boolean(id));

  // Solo lo mínimo para decidir la píldora "N nuevos" en cliente. Los eventos
  // completos —con sus diffs— pesaban ~2,5 MB en el HTML de esta página; ahora
  // viven en public/manual-updates.json y se descargan al abrir el diálogo.
  const pillEvents: UpdatePillEvent[] = updatesDataset.events
    .filter((event) => event.approvedAt && event.changeKind !== "revisado")
    .map((event) => ({
      eventId: event.eventId,
      approvedAt: event.approvedAt!,
      changeKind: event.changeKind,
    }));

  // Resolve ticker hrefs to direct procedure pages using the slug map
  const idToSlug = new Map(allProcedures.map((p) => [p.id, p.slug]));
  const resolvedMetadata: ManualSyncClientMetadata = {
    manualVersionCurrent: syncMetadata.manualVersionCurrent,
    lastSyncAt: syncMetadata.lastSyncAt,
    tickerEnabled: syncMetadata.tickerEnabled,
    ticker: {
      ...syncMetadata.ticker,
      items: syncMetadata.ticker.items.map((item) => ({
        ...item,
        href: item.procedureId && idToSlug.has(item.procedureId)
          ? `/manual/${idToSlug.get(item.procedureId)}`
          : item.href,
      })),
    },
  };

  return (
    <>
      <BreakingNewsTicker metadata={resolvedMetadata} recentEventIds={tickerEventIds} />
      <Suspense fallback={<div>Cargando manual...</div>}>
        <ManualHomeClient
          sidebarSections={sidebarSections}
          allProcedures={allProcedures}
          syncMetadata={resolvedMetadata}
          pillEvents={pillEvents}
          historyCount={historyCount}
        />
      </Suspense>
    </>
  );
}

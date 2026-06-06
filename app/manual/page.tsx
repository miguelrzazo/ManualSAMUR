import { getProcedureMeta, getProcedureSidebarSections } from "@/lib/content";
import { ManualHomeClient } from "@/components/manual/ManualHomeClient";
import { readManualSyncMetadata, readManualUpdatesDataset } from "@/lib/manual-sync";
import { BreakingNewsTicker } from "@/components/shared/BreakingNewsTicker";

import { Suspense } from "react";

export default async function ManualPage() {
  const sidebarSections = getProcedureSidebarSections();
  const allProcedures = getProcedureMeta();
  const syncMetadata = readManualSyncMetadata();
  const updatesDataset = readManualUpdatesDataset();

  const newThisWeekEventIds = updatesDataset.events
    .filter((e) => e.isNewThisWeek && e.changeKind !== "revisado")
    .map((e) => e.eventId);

  // Resolve ticker hrefs to direct procedure pages using the slug map
  const idToSlug = new Map(allProcedures.map((p) => [p.id, p.slug]));
  const resolvedMetadata = {
    ...syncMetadata,
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
      <BreakingNewsTicker metadata={resolvedMetadata} newThisWeekEventIds={newThisWeekEventIds} />
      <Suspense fallback={<div>Cargando manual...</div>}>
        <ManualHomeClient
          sidebarSections={sidebarSections}
          allProcedures={allProcedures}
          syncMetadata={syncMetadata}
          updateEvents={updatesDataset.events}
        />
      </Suspense>
    </>
  );
}

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
    .filter((e) => e.isNewThisWeek)
    .map((e) => e.eventId);

  return (
    <>
      <BreakingNewsTicker metadata={syncMetadata} newThisWeekEventIds={newThisWeekEventIds} />
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

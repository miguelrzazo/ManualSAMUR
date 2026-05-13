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

  return (
    <>
      <BreakingNewsTicker metadata={syncMetadata} />
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

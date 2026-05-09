import { getProcedureMeta, getProcedureSidebarSections } from "@/lib/content";
import { ManualHomeClient } from "@/components/manual/ManualHomeClient";
import { readManualSyncMetadata, readManualUpdatesDataset } from "@/lib/manual-sync";

import { Suspense } from "react";

export default async function ManualPage() {
  const sidebarSections = getProcedureSidebarSections();
  const allProcedures = getProcedureMeta();
  const syncMetadata = readManualSyncMetadata();
  const updatesDataset = readManualUpdatesDataset();

  return (
    <Suspense fallback={<div>Cargando manual...</div>}>
      <ManualHomeClient
        sidebarSections={sidebarSections}
        allProcedures={allProcedures}
        syncMetadata={syncMetadata}
        updateEvents={updatesDataset.events}
      />
    </Suspense>
  );
}

import { getProcedureNavMeta, getProcedureSidebarSections } from "@/lib/content";
import { ManualHomeClient } from "@/components/manual/ManualHomeClient";
import { buildManualHomeData } from "@/lib/manual-home-data";
import { BreakingNewsTicker } from "@/components/shared/BreakingNewsTicker";

import { Suspense } from "react";

export default async function ManualPage() {
  const sidebarSections = getProcedureSidebarSections();
  const allProcedures = getProcedureNavMeta();
  const { syncMetadata, pillEvents, historyCount, tickerEventIds } = buildManualHomeData();

  return (
    <>
      <BreakingNewsTicker metadata={syncMetadata} recentEventIds={tickerEventIds} />
      <Suspense fallback={<div>Cargando manual...</div>}>
        <ManualHomeClient
          sidebarSections={sidebarSections}
          allProcedures={allProcedures}
          syncMetadata={syncMetadata}
          pillEvents={pillEvents}
          historyCount={historyCount}
        />
      </Suspense>
    </>
  );
}

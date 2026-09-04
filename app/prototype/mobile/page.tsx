import { Suspense } from "react";
import { getProcedureNavMeta } from "@/lib/content";
import { readManualSyncMetadata } from "@/lib/manual-sync";
import { MobileReferencePrototype } from "@/components/prototype/MobileReferencePrototype";

// PROTOTYPE — three mobile reference layouts, switchable with ?variant=, hosted on this route.
export default function MobilePrototypePage() {
  const allProcedures = getProcedureNavMeta();
  const preferredIds = ["301", "304_01", "603_01", "604_02", "121"];
  const preferred = preferredIds
    .map((id) => allProcedures.find((procedure) => procedure.id === id))
    .filter((procedure): procedure is (typeof allProcedures)[number] => Boolean(procedure));

  return (
    <Suspense fallback={<div className="p-6 text-sm">Cargando prototipo…</div>}>
      <MobileReferencePrototype
        procedures={preferred.length > 0 ? preferred : allProcedures.slice(0, 5)}
        packageVersion={readManualSyncMetadata().manualVersionCurrent || "v2.0"}
      />
    </Suspense>
  );
}

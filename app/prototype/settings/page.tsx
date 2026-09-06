import { Suspense } from "react";
import { SettingsCompliancePrototype } from "@/components/prototype/SettingsCompliancePrototype";

// PROTOTYPE — three Settings layouts, switchable with ?variant=, hosted on this route.
export default function SettingsPrototypePage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm">Cargando prototipo…</div>}>
      <SettingsCompliancePrototype />
    </Suspense>
  );
}

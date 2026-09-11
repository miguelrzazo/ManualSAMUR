import { Suspense } from "react";
import { DiffExperiencePrototype } from "@/components/prototype/DiffExperiencePrototype";

// PROTOTYPE — three non-technical update/diff experiences, switchable with ?variant=A|B|C.
export default function DiffPrototypePage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm">Cargando prototipo…</div>}>
      <DiffExperiencePrototype />
    </Suspense>
  );
}

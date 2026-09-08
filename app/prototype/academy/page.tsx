import { Suspense } from "react";
import { AcademyPromoPrototype } from "@/components/prototype/AcademyPromoPrototype";

// PROTOTYPE — three APTA Academy placements, switchable with ?variant=.
export default function AcademyPrototypePage() {
  return <Suspense fallback={<div className="p-6 text-sm">Cargando prototipo…</div>}><AcademyPromoPrototype /></Suspense>;
}

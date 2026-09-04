import { Suspense } from "react";
import { SamurIconPrototype } from "@/components/prototype/SamurIconPrototype";

// PROTOTYPE — three universal SAMUR icon directions, switchable with ?variant=A|B|C.
export default function IconPrototypePage() {
  return <Suspense fallback={<div className="p-6 text-sm">Cargando prototipo…</div>}><SamurIconPrototype /></Suspense>;
}

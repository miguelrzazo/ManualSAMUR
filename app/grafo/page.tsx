import { Suspense } from "react";
import { GlobalGraphView } from "@/components/graph/GlobalGraphView";
import { GraphPlaceholder } from "@/components/graph/GraphLoader";

export const metadata = {
  title: "Grafo de procedimientos — SAMUR Manual",
  description: "Mapa interactivo de los enlaces entre los procedimientos del Manual SAMUR-Protección Civil",
};

// La página no recibe datos del servidor: el grafo se descarga de /graph.json al
// montarse. useSearchParams (?foco=) exige el límite de Suspense en export estático.
export default function GrafoPage() {
  return (
    <Suspense
      fallback={
        <div className="map-route-shell">
          <GraphPlaceholder label="Cargando grafo…" />
        </div>
      }
    >
      <GlobalGraphView />
    </Suspense>
  );
}

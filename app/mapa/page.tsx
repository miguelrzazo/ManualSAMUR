import { Suspense } from "react";
import { MapaView } from "@/components/mapa/MapaView";
import hospitals from "@/content/data/hospitals.json";
import bases from "@/content/data/bases.json";
import status4 from "@/content/data/status4.json";

export const metadata = {
  title: "Mapa — SAMUR Manual",
};

export default function MapaPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen">Cargando mapa...</div>}>
      <MapaView hospitals={hospitals} bases={bases} status4={status4} />
    </Suspense>
  );
}

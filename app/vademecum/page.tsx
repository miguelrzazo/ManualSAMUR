import { readFileSync } from "fs";
import path from "path";
import { VademecumView } from "@/components/vademecum/VademecumView";
import { resolveVademecumRouteState } from "@/lib/vademecum-utils";

export const metadata = {
  title: "Vademécum — SAMUR Manual",
  description: "Guía rápida de fármacos de emergencia SAMUR-Protección Civil",
};

interface PageProps {
  searchParams: Promise<{ q?: string | string[]; farmaco?: string | string[] }>;
}

export default async function VademecumPage({ searchParams }: PageProps) {
  const drugs = JSON.parse(readFileSync(path.join(process.cwd(), "content/data/vademecum.json"), "utf8"));
  const routeState = resolveVademecumRouteState(await searchParams, drugs);
  const perfusiones = JSON.parse(readFileSync(path.join(process.cwd(), "content/data/perfusiones.json"), "utf8"));
  const fluidos = JSON.parse(readFileSync(path.join(process.cwd(), "content/data/fluidos.json"), "utf8"));
  const comerciales = JSON.parse(readFileSync(path.join(process.cwd(), "content/data/vademecum-comerciales.json"), "utf8"));

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem-4rem)] md:h-[calc(100vh-3.5rem)]">
      <VademecumView
        key={routeState.highlightedDrugId ?? "base"}
        drugs={drugs}
        perfusiones={perfusiones}
        fluidos={fluidos}
        comerciales={comerciales}
        highlightedDrugId={routeState.highlightedDrugId}
      />
    </div>
  );
}

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
      <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900 md:px-6 md:text-sm dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
        Aviso: La informacion esta en revision y desarrollo y puede no corresponderse con el manual oficial.
      </div>
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

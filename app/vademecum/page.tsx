import { readFileSync } from "fs";
import path from "path";
import { VademecumView } from "@/components/vademecum/VademecumView";
import { Suspense } from "react";
import { getAllProcedures } from "@/lib/content";
import { buildManualRelationsIndex } from "@/lib/manual-relations-index";
import { getCodeReferenceSources } from "@/lib/manual-reference-data";

export const metadata = {
  title: "Vademécum — SAMUR Manual",
  description: "Guía rápida de fármacos de emergencia SAMUR-Protección Civil",
};

export default async function VademecumPage() {
  const drugs = JSON.parse(readFileSync(path.join(process.cwd(), "content/data/vademecum.json"), "utf8"));
  const perfusiones = JSON.parse(readFileSync(path.join(process.cwd(), "content/data/perfusiones.json"), "utf8"));
  const fluidos = JSON.parse(readFileSync(path.join(process.cwd(), "content/data/fluidos.json"), "utf8"));
  const comerciales = JSON.parse(readFileSync(path.join(process.cwd(), "content/data/vademecum-comerciales.json"), "utf8"));
  const drugMentions = buildManualRelationsIndex({
    procedures: getAllProcedures(),
    drugs,
    codes: getCodeReferenceSources(),
  }).drugs;

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem-4rem)] md:h-[calc(100vh-3.5rem)]">
      <Suspense fallback={<div>Cargando vademécum...</div>}>
        <VademecumView
          drugs={drugs}
          perfusiones={perfusiones}
          fluidos={fluidos}
          comerciales={comerciales}
          drugMentions={drugMentions}
        />
      </Suspense>
    </div>
  );
}

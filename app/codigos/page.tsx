import { CodigosView } from "@/components/codigos/CodigosView";
import codigosIncidente from "@/content/data/codigos-incidente.json";
import codigosSva from "@/content/data/codigos-sva.json";
import codigosSvb from "@/content/data/codigos-svb.json";
import codigosUpsi from "@/content/data/codigos-upsi.json";
import codigosPc from "@/content/data/codigos-pc.json";
import codigosIcao from "@/content/data/codigos-icao.json";
import status4 from "@/content/data/status4.json";
import hospitals from "@/content/data/hospitals.json";

export const metadata = {
  title: "Códigos — SAMUR Manual",
};

// Build Status 4 codes for the comms tab
const codigosStatus4 = status4.map((entry) => {
  const hospital = entry.hospitalId
    ? hospitals.find((h) => h.id === entry.hospitalId)
    : null;
  return {
    code: `4+${entry.status}`,
    name: hospital ? `${hospital.shortName} (${hospital.id})` : "No operativo",
    category: "Status 4",
    description: entry.description,
  };
});

// Comms tab: Status 4 + any future radio codes
const codigosComms = [...codigosStatus4];

export default function CodigosPage() {
  return (
    <CodigosView
      incidente={codigosIncidente}
      sva={codigosSva}
      svb={codigosSvb}
      upsi={codigosUpsi}
      pc={codigosPc}
      icao={codigosIcao}
      comms={codigosComms}
    />
  );
}

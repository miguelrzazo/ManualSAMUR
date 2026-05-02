import { CodigosView } from "@/components/codigos/CodigosView";
import codigosIncidente from "@/content/data/codigos-incidente.json";
import codigosSva from "@/content/data/codigos-sva.json";
import codigosSvb from "@/content/data/codigos-svb.json";
import codigosUpsi from "@/content/data/codigos-upsi.json";
import codigosIcao from "@/content/data/codigos-icao.json";
import codigosIndicativos from "@/content/data/codigos-indicativos.json";
import codigosClaves from "@/content/data/codigos-pc.json";
import codigosLima from "@/content/data/codigos-lima.json";
import bases from "@/content/data/bases.json";
import hospitals from "@/content/data/hospitals.json";
import status4 from "@/content/data/status4.json";

export const metadata = {
  title: "Códigos — SAMUR Manual",
};

export default function CodigosPage() {
  return (
    <CodigosView
      incidente={codigosIncidente}
      sva={codigosSva}
      svb={codigosSvb}
      upsi={codigosUpsi}
      icao={codigosIcao}
      indicativos={codigosIndicativos}
      claves={codigosClaves}
      bases={bases}
      hospitals={hospitals}
      status4={status4}
      lima={codigosLima}
    />
  );
}

import codigosIncidente from "@/content/data/codigos-incidente.json";
import codigosSva from "@/content/data/codigos-sva.json";
import codigosSvb from "@/content/data/codigos-svb.json";
import codigosUpsi from "@/content/data/codigos-upsi.json";
import codigosUpsq from "@/content/data/codigos-upsq.json";
import codigosIcao from "@/content/data/codigos-icao.json";
import codigosIndicativos from "@/content/data/codigos-indicativos.json";
import codigosClaves from "@/content/data/codigos-pc.json";
import codigosLima from "@/content/data/codigos-lima.json";
import type { CodeReferenceSource } from "./manual-relations-index.ts";

interface CodeLike {
  code: string;
  name: string;
  group?: string;
  category?: string;
}

function mapCodes(items: CodeLike[], tab: string, subtab?: string): CodeReferenceSource[] {
  return items
    .filter((item) => item.code && item.name)
    .map((item) => ({
      code: item.code,
      name: item.name,
      group: item.group,
      category: item.category,
      tab,
      subtab,
    }));
}

export function getCodeReferenceSources(): CodeReferenceSource[] {
  return [
    ...mapCodes(codigosIncidente as CodeLike[], "incidente"),
    ...mapCodes(codigosSva as CodeLike[], "sva"),
    ...mapCodes(codigosSvb as CodeLike[], "svb"),
    ...mapCodes(codigosUpsi as CodeLike[], "upsi"),
    ...mapCodes(codigosUpsq as CodeLike[], "upsq"),
    ...mapCodes(codigosIcao as CodeLike[], "otros", "icao"),
    ...mapCodes(codigosIndicativos as CodeLike[], "otros", "indicativos"),
    ...mapCodes(codigosClaves as CodeLike[], "otros", "claves"),
    ...mapCodes(codigosLima as CodeLike[], "otros", "lima"),
  ];
}

export interface CompactCode {
  code: string;
  name: string;
  group?: string;
  category?: string;
  description?: string;
}

export interface CheatsheetSection {
  key: string;
  title: string;
  kind: "cards" | "table";
  columns?: string[];
  items: Array<Record<string, string | string[]>>;
}

export const CODIGOS_TOP_LEVEL_TABS = [
  { key: "incidente", label: "Incidente" },
  { key: "comunicaciones", label: "Comunicaciones" },
  { key: "icao", label: "ICAO" },
] as const;

export const CODIGOS_COMMUNICATION_SUBTABS = [
  { key: "indicativos", label: "Indicativos" },
  { key: "claves", label: "Claves" },
  { key: "incidentes", label: "Códigos de incidentes" },
  { key: "patologia", label: "Códigos de patología" },
  { key: "cheatsheet", label: "Cheatsheet" },
] as const;

export const CODIGOS_PATHOLOGY_SUBTABS = [
  { key: "sva", label: "SVA" },
  { key: "svb", label: "SVB" },
  { key: "upsi", label: "UPSI" },
] as const;

export type CodigosTopLevelTabKey = (typeof CODIGOS_TOP_LEVEL_TABS)[number]["key"];
export type CodigosCommunicationTabKey = (typeof CODIGOS_COMMUNICATION_SUBTABS)[number]["key"];
export type CodigosPathologyTabKey = (typeof CODIGOS_PATHOLOGY_SUBTABS)[number]["key"];

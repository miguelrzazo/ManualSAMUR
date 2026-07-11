export type Procedure = {
  id: string;
  title: string;
  section: string;
  slug: string;
  tags: string[];
  synonyms: string[];
  related: string[];
  updated: string;
  attachments: Array<{ sourceUrl: string; localPath: string; kind: string }>;
  content: string;
  searchText: string;
};

export type Facility = {
  id: string;
  name: string;
  shortName?: string;
  address: string;
  district: string;
  lat: number;
  lng: number;
  type?: string;
  number?: number;
  code?: number;
  status4?: number;
  emergency?: boolean;
};

export type ContentSnapshot = {
  schema: "samur-manual.mobile-content";
  version: 1;
  generatedAt: string;
  hash: string;
  content: {
    procedures: Procedure[];
    codes: Record<string, Array<Record<string, unknown>>>;
    drugs: Array<Record<string, unknown>>;
    perfusions: Array<Record<string, unknown>>;
    fluids: Array<Record<string, unknown>>;
    commercialNames: Array<Record<string, unknown>>;
    abbreviations: Array<{ letter: string; entries: Array<{ abbreviation: string; meaning: string }> }>;
    hospitals: Facility[];
    bases: Facility[];
    status4: Array<{ status: number; hospitalId: string | null; hospitalName: string | null; description: string }>;
    manual: Record<string, unknown>;
    links: Record<string, unknown>;
  };
};

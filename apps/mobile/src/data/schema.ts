export interface MobileAttachment {
  id: string;
  sourceUrl: string;
  localPath: string;
  filename: string;
  kind: "image" | "pdf" | "other";
}

export interface MobileProcedure {
  id: string;
  title: string;
  section: string;
  slug: string;
  routeKey: string;
  tags: string[];
  synonyms: string[];
  related: string[];
  backlinks: string[];
  relations: Array<{ id: string; direction: string; kind: string; strength: string }>;
  editorialBlocks: unknown[];
  updates: unknown[];
  updated: string;
  sourceUpdated: string;
  source?: string;
  attachments: MobileAttachment[];
  content: string;
  searchText: string;
}

export interface MobileLinks {
  sourceUrl: string;
  updatedAt: string;
  avisoImportanteUrl: string;
  samurEmail: string;
  officialWebUrl: string;
  abbreviationsUrl: string;
  collaboratorsUrl: string;
}

export interface MobileContent {
  procedures: MobileProcedure[];
  codes: Record<string, unknown[]>;
  drugs: Array<Record<string, unknown>>;
  perfusions: Array<Record<string, unknown>>;
  fluids: Array<Record<string, unknown>>;
  commercialNames: Array<Record<string, unknown>>;
  abbreviations: Array<Record<string, unknown>>;
  hospitals: Array<Record<string, unknown>>;
  bases: Array<Record<string, unknown>>;
  status4: Array<Record<string, unknown>>;
  manual: Record<string, unknown>;
  links: MobileLinks;
  updates: unknown[];
}

export interface MobileSnapshot {
  schema: string;
  version: number;
  generatedAt: string;
  hash: string;
  content: MobileContent;
}

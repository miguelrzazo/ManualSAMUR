import Fuse from "fuse.js";
import type { ProcedureMeta } from "@/lib/content";

interface Drug {
  id: string;
  name: string;
  synonyms: string[];
  category: string;
  subcategory: string;
  indication?: string;
  presentation?: string;
}

interface Code {
  code: string;
  name: string;
  group: string;
  category?: string;
  description?: string;
}

interface Hospital {
  id: string;
  name: string;
  shortName: string;
  address: string;
  district: string;
}

export interface SearchResult {
  type: "procedure" | "drug" | "code" | "hospital";
  id: string;
  title: string;
  subtitle?: string;
  badge?: string;
  href: string;
  searchText: string;
}

// Cache for search instances
let proceduresFuse: Fuse<ProcedureMeta> | null = null;
let drugsFuse: Fuse<Drug> | null = null;
let codesFuse: Fuse<Code> | null = null;
let hospitalsFuse: Fuse<Hospital> | null = null;

function buildProceduresFuse(procedures: ProcedureMeta[]): Fuse<ProcedureMeta> {
  proceduresFuse = new Fuse(procedures, {
    keys: [
      { name: "id", weight: 2 },
      { name: "title", weight: 2 },
      { name: "tags", weight: 1.5 },
      { name: "synonyms", weight: 1.5 },
      { name: "backlinks", weight: 0.6 },
      { name: "searchText", weight: 1.2 },
      { name: "section", weight: 0.5 },
    ],
    threshold: 0.32,
    includeScore: true,
    includeMatches: true,
    ignoreLocation: true,
    minMatchCharLength: 2,
  });
  return proceduresFuse;
}

function buildDrugsFuse(drugs: Drug[]): Fuse<Drug> {
  drugsFuse = new Fuse(drugs, {
    keys: [
      { name: "id", weight: 2 },
      { name: "name", weight: 2 },
      { name: "synonyms", weight: 1.5 },
      { name: "category", weight: 1 },
      { name: "subcategory", weight: 1 },
      { name: "indication", weight: 0.8 },
    ],
    threshold: 0.35,
    includeScore: true,
    includeMatches: true,
    ignoreLocation: true,
    minMatchCharLength: 2,
  });
  return drugsFuse;
}

function buildCodesFuse(codes: Code[]): Fuse<Code> {
  codesFuse = new Fuse(codes, {
    keys: [
      { name: "code", weight: 2 },
      { name: "name", weight: 2 },
      { name: "group", weight: 1 },
      { name: "category", weight: 0.8 },
      { name: "description", weight: 0.6 },
    ],
    threshold: 0.35,
    includeScore: true,
    includeMatches: true,
    ignoreLocation: true,
    minMatchCharLength: 2,
  });
  return codesFuse;
}

function buildHospitalsFuse(hospitals: Hospital[]): Fuse<Hospital> {
  hospitalsFuse = new Fuse(hospitals, {
    keys: [
      { name: "id", weight: 2 },
      { name: "name", weight: 2 },
      { name: "shortName", weight: 1.5 },
      { name: "address", weight: 1 },
      { name: "district", weight: 0.8 },
    ],
    threshold: 0.35,
    includeScore: true,
    includeMatches: true,
    ignoreLocation: true,
    minMatchCharLength: 2,
  });
  return hospitalsFuse;
}

export async function globalSearch(
  query: string,
  procedures: ProcedureMeta[],
  drugs: Drug[],
  codes: Code[],
  hospitals: Hospital[]
): Promise<SearchResult[]> {
  if (!query.trim()) return [];

  const results: SearchResult[] = [];

  // Search procedures
  const proceduresFuse = buildProceduresFuse(procedures);
  const procedureResults = proceduresFuse.search(query).slice(0, 5);
  results.push(
    ...procedureResults.map((r) => ({
      type: "procedure" as const,
      id: r.item.id,
      title: r.item.title,
      subtitle: r.item.section,
      badge: r.item.id,
      href: `/manual/${r.item.slug}`,
      searchText: `${r.item.id} ${r.item.title} ${r.item.synonyms.join(" ")} ${r.item.tags.join(" ")}`,
    }))
  );

  // Search drugs
  const drugsFuse = buildDrugsFuse(drugs);
  const drugResults = drugsFuse.search(query).slice(0, 5);
  results.push(
    ...drugResults.map((r) => ({
      type: "drug" as const,
      id: r.item.id,
      title: r.item.name,
      subtitle: `${r.item.category} • ${r.item.subcategory}`,
      badge: r.item.presentation,
      href: `/vademecum?farmaco=${r.item.id}`,
      searchText: `${r.item.id} ${r.item.name} ${r.item.synonyms.join(" ")} ${r.item.category} ${r.item.subcategory}`,
    }))
  );

  // Search codes
  const codesFuse = buildCodesFuse(codes);
  const codeResults = codesFuse.search(query).slice(0, 5);
  results.push(
    ...codeResults.map((r) => ({
      type: "code" as const,
      id: r.item.code,
      title: r.item.name,
      subtitle: r.item.group,
      badge: r.item.code,
      href: `/codigos`,
      searchText: `${r.item.code} ${r.item.name} ${r.item.group}`,
    }))
  );

  // Search hospitals
  const hospitalsFuse = buildHospitalsFuse(hospitals);
  const hospitalResults = hospitalsFuse.search(query).slice(0, 5);
  results.push(
    ...hospitalResults.map((r) => ({
      type: "hospital" as const,
      id: r.item.id,
      title: r.item.name,
      subtitle: `${r.item.district} • ${r.item.address}`,
      badge: r.item.id,
      href: `/mapa?hospital=${r.item.id}`,
      searchText: `${r.item.id} ${r.item.name} ${r.item.shortName} ${r.item.address} ${r.item.district}`,
    }))
  );

  return results;
}
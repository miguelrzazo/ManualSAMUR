import Fuse from "fuse.js";
import type { ProcedureMeta } from "@/lib/content";

let fuseInstance: Fuse<ProcedureMeta> | null = null;

export function buildSearchIndex(procedures: ProcedureMeta[]): Fuse<ProcedureMeta> {
  fuseInstance = new Fuse(procedures, {
    keys: [
      { name: "title", weight: 2 },
      { name: "tags", weight: 1.5 },
      { name: "synonyms", weight: 1.5 },
      { name: "section", weight: 0.5 },
    ],
    threshold: 0.35,
    includeScore: true,
    includeMatches: true,
    minMatchCharLength: 2,
  });
  return fuseInstance;
}

export function search(query: string, procedures: ProcedureMeta[]): ProcedureMeta[] {
  if (!query.trim()) return [];
  const fuse = buildSearchIndex(procedures);
  return fuse.search(query).map((r) => r.item);
}

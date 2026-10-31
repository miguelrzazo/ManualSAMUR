import type { MobileSnapshot } from "../../../packages/manual-content/src/index.ts";

/**
 * Reduce a full snapshot to the bundled first-launch seed.
 *
 * Kept: everything a clinician needs offline on day one (procedures' readable
 * markdown, codes, vademecum, perfusions, hospitals…). Dropped:
 * - `procedures[].searchText`: a flattened copy of `content` (~1.7 MB); the
 *   search index already concatenates `searchText` and `content`.
 * - `updates`: the "novedades" feed, meaningful only next to a live release.
 * - `manual` beyond the edition fields: the repo's manual-sync.json carries
 *   ~2.3 MB of scrape bookkeeping (runs, approved changes) the app never
 *   reads. The public API publishes the same three fields.
 */
export const SEED_MANUAL_FIELDS = ["manualVersion", "manualVersionCurrent", "lastApprovedAt"] as const;

export function buildSeedSnapshot(snapshot: MobileSnapshot): MobileSnapshot {
  const manual = Object.fromEntries(Object.entries(snapshot.content.manual ?? {})
    .filter(([key]) => (SEED_MANUAL_FIELDS as readonly string[]).includes(key)));
  return {
    ...snapshot,
    content: {
      ...snapshot.content,
      procedures: snapshot.content.procedures.map((procedure) => ({ ...procedure, searchText: "" })),
      manual,
      updates: [],
    },
  };
}

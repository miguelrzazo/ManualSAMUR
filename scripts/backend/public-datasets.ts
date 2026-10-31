import type { MobileContentSnapshot } from '../../packages/manual-content/src/index.ts';
import { codeFiles, hash } from './core.ts';

/**
 * Public data API for the mobile and Watch apps (docs/backend/public-api.md).
 * Each dataset is published as its own artifact so clients can refresh only
 * what changed: the manifest lists the SHA-256 of the exact bytes served.
 */
export const PUBLIC_MANIFEST_SCHEMA = 'samur-manual.public-manifest';
export const PUBLIC_MANIFEST_VERSION = 1;

export interface PublicDatasetEntry {
  url: string;
  immutableUrl: string;
  sha256: string;
  bytes: number;
  count: number | null;
}

export interface PublicManifest {
  schema: typeof PUBLIC_MANIFEST_SCHEMA;
  version: typeof PUBLIC_MANIFEST_VERSION;
  releaseId: string;
  /** Filled in by the Worker from the release row; the pointer switch sets it. */
  publishedAt: string | null;
  generatedAt: string;
  contentHash: string;
  packageHash: string | null;
  manualVersion: string | null;
  snapshot: { url: string; immutableUrl: string };
  datasets: Record<string, PublicDatasetEntry>;
}

/** Stable public dataset names. They match content/data/*.json where one exists. */
export function publicDatasets(snapshot: MobileContentSnapshot): Record<string, unknown> {
  const content = snapshot.content;
  const datasets: Record<string, unknown> = {
    procedures: content.procedures,
    vademecum: content.drugs,
    'vademecum-comerciales': content.commercialNames,
    perfusiones: content.perfusions,
    fluidos: content.fluids,
    abreviaturas: content.abbreviations,
    hospitals: content.hospitals,
    bases: content.bases,
    status4: content.status4,
    'manual-updates': content.updates,
    'main-links': content.links,
    // Only the edition fields: scrape bookkeeping is neither public nor stable.
    manual: Object.fromEntries(Object.entries(content.manual ?? {})
      .filter(([key]) => ['manualVersion', 'manualVersionCurrent', 'lastApprovedAt'].includes(key))),
  };
  for (const [group, file] of Object.entries(codeFiles)) datasets[file] = content.codes?.[group] ?? [];
  return datasets;
}

export const PUBLIC_DATASET_NAME = /^[a-z0-9-]{1,64}$/;

export function buildPublicDatasetArtifacts(snapshot: MobileContentSnapshot, releaseId: string) {
  const files: Array<[string, string]> = [];
  const entries: Record<string, PublicDatasetEntry> = {};
  for (const [name, value] of Object.entries(publicDatasets(snapshot))) {
    if (!PUBLIC_DATASET_NAME.test(name)) throw new Error(`Invalid public dataset name: ${name}`);
    const body = JSON.stringify(value);
    files.push([`datasets/${name}.json`, body]);
    entries[name] = {
      url: `/api/public/datasets/${name}.json`,
      immutableUrl: `/api/public/releases/${releaseId}/datasets/${name}.json`,
      sha256: hash(body), bytes: Buffer.byteLength(body), count: Array.isArray(value) ? value.length : null,
    };
  }
  const manual = snapshot.content.manual as Record<string, unknown> | undefined;
  const version = manual?.manualVersionCurrent ?? manual?.manualVersion;
  const manifest: PublicManifest = {
    schema: PUBLIC_MANIFEST_SCHEMA, version: PUBLIC_MANIFEST_VERSION, releaseId, publishedAt: null,
    generatedAt: snapshot.generatedAt, contentHash: snapshot.hash, packageHash: snapshot.packageHash ?? null,
    manualVersion: typeof version === 'string' ? version : null,
    snapshot: { url: '/api/public/content', immutableUrl: `/api/public/releases/${releaseId}/snapshot` },
    datasets: entries,
  };
  files.push(['manifest.json', JSON.stringify(manifest)]);
  return { files, manifest };
}

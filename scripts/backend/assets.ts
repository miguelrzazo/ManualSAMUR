import fs from 'node:fs';
import path from 'node:path';
import { hash } from './core.ts';

export async function retainFrozenAsset(localPath: string, expectedHash: string, expectedSize: number | undefined,
  options: { cwd: string; assetRoot: string; origin?: string; fetch?: typeof fetch }) {
  if (!/^\/(docs|images)\//.test(localPath) || localPath.includes('..') || localPath.includes('\\')
    || !/^[a-f0-9]{64}$/.test(expectedHash)) throw new Error('Unsafe attachment path or integrity hash.');
  const immutablePath = `/${localPath.split('/')[1]}/_versions/${expectedHash}/${path.basename(localPath)}`;
  const destination = path.join(options.assetRoot, immutablePath.slice(1));
  if (fs.existsSync(destination) && hash(fs.readFileSync(destination)) === expectedHash) return immutablePath;
  const original = path.join(options.cwd, 'public', localPath.slice(1));
  let bytes = fs.existsSync(original) ? fs.readFileSync(original) : undefined;
  if (!bytes || hash(bytes) !== expectedHash) {
    if (!options.origin || !/^https:\/\//.test(options.origin)) throw new Error(`Attachment unavailable: ${path.basename(localPath)}. Configure PUBLICATION_ORIGIN to recover a previous immutable copy.`);
    const response = await (options.fetch || fetch)(new URL(immutablePath, options.origin), { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`Attachment download failed: HTTP ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
  }
  if (hash(bytes) !== expectedHash || (expectedSize !== undefined && bytes.byteLength !== expectedSize)) throw new Error('Attachment integrity mismatch.');
  fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.writeFileSync(destination, bytes);
  return immutablePath;
}

export function rewriteAssetPaths(value: unknown, before: string, after: string): unknown {
  if (typeof value === 'string') return value.replaceAll(before, after);
  if (Array.isArray(value)) return value.map((item) => rewriteAssetPaths(item, before, after));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rewriteAssetPaths(item, before, after)]));
  return value;
}

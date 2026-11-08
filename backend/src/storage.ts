import type { D1Database, KVNamespace } from '@cloudflare/workers-types';
import { HttpError } from './model.ts';

export interface StorageEnv { DB: D1Database; CONTENT_ASSETS?: KVNamespace }
export const ASSET_BUDGET = 750 * 1024 * 1024;
export const FILE_BUDGET = 25 * 1024 * 1024;
export async function digest(bytes: Uint8Array | string): Promise<string> {
  const value = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes;
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', value as Uint8Array<ArrayBuffer>)), n => n.toString(16).padStart(2, '0')).join('');
}
export async function boundedBody(response: Response, limit: number): Promise<Uint8Array<ArrayBuffer>> {
  if (Number(response.headers.get('Content-Length')) > limit) throw new Error('Archivo demasiado grande para el presupuesto gratuito.');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Respuesta vacía de la fuente.');
  const parts: Uint8Array[] = []; let length = 0;
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    length += value.byteLength;
    if (length > limit) { await reader.cancel(); throw new Error('Archivo demasiado grande para el presupuesto gratuito.'); }
    parts.push(value);
  }
  const bytes = new Uint8Array(length); let at = 0;
  for (const part of parts) { bytes.set(part, at); at += part.length; }
  return bytes;
}
export function officialUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.hostname !== 'servpub.madrid.es' || url.port || url.username || url.password || !url.pathname.startsWith('/manualsamur/'))
    throw new Error('Origen de contenido no autorizado.');
  return url;
}
export async function officialFetch(value: string): Promise<Response> {
  let url = officialUrl(value);
  for (let redirect = 0; redirect < 4; redirect++) {
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(25000), headers: { 'User-Agent': 'ManualSAMUR-editorial/3.0', Accept: '*/*' } });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('Location'); await response.body?.cancel();
      if (!location) throw new Error('Redirección de origen incompleta.');
      url = officialUrl(new URL(location, url).href); continue;
    }
    if (!response.ok) { await response.body?.cancel(); throw new Error(`La fuente respondió HTTP ${response.status}.`); }
    return response;
  }
  throw new Error('Demasiadas redirecciones de origen.');
}
export async function retainAsset(env: StorageEnv, url: string, filename: string, documentId: string) {
  if (!env.CONTENT_ASSETS) throw new Error('El almacén de adjuntos no está configurado.');
  const response = await officialFetch(url);
  const bytes = await boundedBody(response, FILE_BUDGET);
  const hash = await digest(bytes);
  const magic = new TextDecoder().decode(bytes.subarray(0, 5));
  const mime = magic === '%PDF-' ? 'application/pdf' : bytes[0] === 137 && bytes[1] === 80 ? 'image/png' : bytes[0] === 255 && bytes[1] === 216 ? 'image/jpeg' : new TextDecoder().decode(bytes.subarray(0, 3)) === 'GIF' ? 'image/gif' : new TextDecoder().decode(bytes.subarray(8, 12)) === 'WEBP' ? 'image/webp' : '';
  // Active SVG/HTML content is never served as a trusted inline attachment.
  if (!mime) throw new Error('Tipo de adjunto no soportado: revisión manual necesaria.');
  const existing = await env.DB.prepare('SELECT verified FROM content_assets WHERE hash=?').bind(hash).first<{ verified: number }>();
  if (!existing?.verified) {
    const day = new Date().toISOString().slice(0, 10);
    await env.DB.prepare('INSERT OR IGNORE INTO content_usage(day) VALUES(?)').bind(day).run();
    const reserved = await env.DB.prepare('INSERT OR IGNORE INTO content_assets(hash,bytes,mime,created_at) SELECT ?,?,?,? WHERE COALESCE((SELECT SUM(bytes) FROM content_assets),0)+?<=?').bind(hash, bytes.length, mime, new Date().toISOString(), bytes.length, ASSET_BUDGET).run();
    if (!reserved.meta.changes && !existing) throw new Error('Presupuesto de almacenamiento alcanzado.');
    const usage = await env.DB.prepare('UPDATE content_usage SET writes=writes+1 WHERE day=? AND writes<800').bind(day).run();
    if (!usage.meta.changes) throw new Error('Presupuesto diario de escrituras alcanzado. Reintenta mañana.');
    await env.CONTENT_ASSETS.put(hash, bytes, { metadata: { mime } });
    const stored = await env.CONTENT_ASSETS.get(hash, 'arrayBuffer');
    if (!stored || await digest(new Uint8Array(stored)) !== hash) throw new Error('El adjunto aún no se puede verificar. Reintenta más tarde.');
    await env.DB.prepare('UPDATE content_assets SET verified=1 WHERE hash=?').bind(hash).run();
  }
  await env.DB.prepare("INSERT OR IGNORE INTO content_asset_refs(hash,document_id,release_id) VALUES(?,?,'')").bind(hash, documentId).run();
  const safeName = filename.normalize('NFC').replace(/[^\p{L}\p{N}._-]/gu, '_').slice(-180) || (mime === 'application/pdf' ? 'adjunto.pdf' : 'imagen');
  return { sha256: hash, byteLength: bytes.length, localPath: `/docs/_cloud/${hash}/${safeName}`, filename: safeName, kind: mime === 'application/pdf' ? 'pdf' as const : 'image' as const };
}
export async function assetResponse(request: Request, env: StorageEnv, hash: string, editorial: boolean): Promise<Response> {
  if (!['GET','HEAD'].includes(request.method)) return new Response(null, { status: 405 });
  if (!env.CONTENT_ASSETS) throw new HttpError(503, 'Adjunto temporalmente no disponible.');
  const ref = await env.DB.prepare(editorial
    ? 'SELECT 1 FROM content_asset_refs WHERE hash=? LIMIT 1'
    : "SELECT 1 FROM content_asset_refs a JOIN releases r ON r.id=a.release_id WHERE a.hash=? AND r.status='published' LIMIT 1").bind(hash).first();
  if (!ref) return new Response(null, { status: 404 });
  const row = await env.DB.prepare('SELECT bytes,mime FROM content_assets WHERE hash=? AND verified=1').bind(hash).first<{ bytes: number; mime: string }>();
  if (!row) return new Response(null, { status: 404 });
  const body = await env.CONTENT_ASSETS.get(hash, 'arrayBuffer');
  if (!body) return new Response('El adjunto se está propagando. Reintenta más tarde.', { status: 503, headers: { 'Retry-After': '60', 'Cache-Control': 'no-store' } });
  const headers = new Headers({ 'Content-Type': row.mime, 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline', 'Cache-Control': editorial ? 'no-store' : 'public, max-age=31536000, immutable', ETag: `"${hash}"`, 'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*' });
  if (request.headers.get('If-None-Match') === `"${hash}"`) return new Response(null, { status: 304, headers });
  let start = 0, end = body.byteLength - 1, status = 200;
  const range = request.headers.get('Range');
  if (range && (!request.headers.get('If-Range') || request.headers.get('If-Range') === `"${hash}"`)) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || (!match[1] && !match[2])) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${body.byteLength}` } });
    start = match[1] ? Number(match[1]) : Math.max(0, body.byteLength - Number(match[2]));
    end = match[1] && match[2] ? Math.min(Number(match[2]), end) : end;
    if (start > end || start >= body.byteLength) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${body.byteLength}` } });
    status = 206; headers.set('Content-Range', `bytes ${start}-${end}/${body.byteLength}`);
  }
  headers.set('Content-Length', String(end-start+1));
  return new Response(request.method === 'HEAD' ? null : body.slice(start, end+1), { status, headers });
}

import { verifyAccessIdentity, type AccessConfig } from './auth.ts';
import type { D1Database, D1Result } from '@cloudflare/workers-types';
import { documentView, HttpError, transitions, validateSave, type DocumentRow } from './model.ts';

export interface Env extends AccessConfig {
  DB: D1Database;
  ASSETS: { fetch(request: Request): Promise<Response> };
  FILES?: { fetch(request: Request): Promise<Response> };
  PUBLICATION_GITHUB_TOKEN?: string;
  PUBLICATION_REPOSITORY?: string;
  PUBLICATION_REF?: string;
}

function json(body: unknown, status = 200, publicResponse = false): Response {
  return Response.json(body, { status, headers: {
    'Cache-Control': publicResponse ? 'public, max-age=0, must-revalidate' : 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...(publicResponse ? { 'Access-Control-Allow-Origin': '*' } : { 'X-Robots-Tag': 'noindex, nofollow, noarchive' }),
  } });
}

async function input(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) throw new HttpError(415, 'Se requiere JSON.');
  // Stream the bounded body: do not trust Content-Length or allocate an unbounded request.
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, 'Falta el contenido.');
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 1000000) { await reader.cancel(); throw new HttpError(413, 'Solicitud demasiado grande.'); }
    parts.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
  try {
    const body: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    return body as Record<string, unknown>;
  } catch { throw new HttpError(400, 'JSON no válido.'); }
}

export interface Editor { email: string; name: string; role: 'admin' | 'editor' }

/** Access proves who it is; the bootstrap admin or the editors table decides what they may do. */
async function resolveEditor(request: Request, env: Env): Promise<Editor | null> {
  const email = await verifyAccessIdentity(request, env);
  if (!email) return null;
  if (env.EDITOR_EMAIL && email.toLowerCase() === env.EDITOR_EMAIL.toLowerCase()) return { email, name: '', role: 'admin' };
  const row = await env.DB.prepare('SELECT email,name,role FROM editors WHERE email=? AND active=1').bind(email).first<Editor>();
  return row ? { email, name: row.name, role: row.role } : null;
}

function audit(env: Env, actor: string, action: string, target: string, detail = '') {
  return env.DB.prepare('INSERT INTO audit_log(at,actor,action,target,detail) VALUES(?,?,?,?,?)')
    .bind(new Date().toISOString(), actor, action, target, detail.slice(0, 500));
}

async function getDocument(env: Env, id: string) {
  const row = await env.DB.prepare('SELECT * FROM documents WHERE id=?').bind(id).first<DocumentRow>();
  if (!row) throw new HttpError(404, 'Documento no encontrado.');
  return row;
}

function checkRevision(body: Record<string, unknown>, row: DocumentRow) {
  if (!Number.isInteger(body.expectedRevision) || body.expectedRevision !== row.revision)
    throw new HttpError(409, 'Ha cambiado el documento. Recarga y compara antes de guardar.');
}

function checkChanged(result: D1Result) {
  if (result.meta.changes !== 1) throw new HttpError(409, 'El documento cambió durante el guardado. Recarga y compara.');
}

async function dispatchPublication(env: Env, releaseId: string) {
  const repo = env.PUBLICATION_REPOSITORY;
  if (!env.PUBLICATION_GITHUB_TOKEN || !repo || !/^[\w.-]+\/[\w.-]+$/.test(repo))
    throw new HttpError(503, 'La publicación todavía no está configurada. Los cambios permanecen guardados.');
  const response = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/publish-content.yml/dispatches`, {
    method: 'POST', headers: {
      Authorization: `Bearer ${env.PUBLICATION_GITHUB_TOKEN}`, 'Content-Type': 'application/json',
      Accept: 'application/vnd.github+json', 'User-Agent': 'ManualSAMUR-Publisher', 'X-GitHub-Api-Version': '2022-11-28',
    }, body: JSON.stringify({ ref: env.PUBLICATION_REF || 'main', inputs: { release_id: releaseId } }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new HttpError(502, 'No se pudo iniciar la publicación. Los cambios permanecen guardados.');
}

async function createRelease(env: Env, actor: string, summary: string, restoreId?: string) {
  if (!env.PUBLICATION_GITHUB_TOKEN || !env.PUBLICATION_REPOSITORY)
    throw new HttpError(503, 'La publicación todavía no está configurada. Los cambios permanecen guardados.');
  const pending = await env.DB.prepare("SELECT id FROM releases WHERE status='preparing'").first();
  if (pending) throw new HttpError(409, 'Ya hay una publicación en preparación.');
  const parent = await env.DB.prepare('SELECT release_id FROM publication_pointer WHERE singleton=1').first<{ release_id: string }>();
  if (restoreId) {
    const previous = await env.DB.prepare("SELECT id FROM releases WHERE id=? AND status='published'").bind(restoreId).first();
    if (!previous) throw new HttpError(404, 'Publicación no encontrada.');
  } else {
    const ready = await env.DB.prepare("SELECT id FROM documents WHERE status='ready' OR (status='archived' AND id IN (SELECT document_id FROM release_documents WHERE release_id=?)) LIMIT 1").bind(parent?.release_id ?? '').first();
    if (!ready) throw new HttpError(409, 'No hay cambios listos para publicar.');
    const conflicts = await env.DB.prepare("SELECT id FROM documents WHERE status='ready' AND incoming_source_json IS NOT NULL LIMIT 1").first();
    if (conflicts) throw new HttpError(409, 'Resuelve los cambios de origen antes de publicar.');
  }
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const statements = [env.DB.prepare("INSERT INTO releases(id,status,summary,created_at,parent_id,created_by) VALUES(?,'preparing',?,?,?,?)").bind(id, summary, createdAt, parent?.release_id ?? null, actor),
    audit(env, actor, restoreId ? 'release.restore' : 'release.request', id, restoreId ? `Restaura ${restoreId}` : summary)];
  if (restoreId) {
    statements.push(env.DB.prepare('INSERT INTO release_documents SELECT ?,document_id,revision FROM release_documents WHERE release_id=?').bind(id, restoreId));
  } else {
    if (parent) statements.push(env.DB.prepare('INSERT INTO release_documents SELECT ?,document_id,revision FROM release_documents WHERE release_id=?').bind(id, parent.release_id));
    statements.push(env.DB.prepare("DELETE FROM release_documents WHERE release_id=? AND document_id IN (SELECT id FROM documents WHERE status='archived')").bind(id));
    statements.push(env.DB.prepare("INSERT OR REPLACE INTO release_documents SELECT ?,id,revision FROM documents WHERE status='ready'").bind(id));
  }
  try { await env.DB.batch(statements); }
  catch (error) {
    if (String(error).includes('UNIQUE')) throw new HttpError(409, 'Ya hay una publicación en preparación.');
    throw error;
  }
  try { await dispatchPublication(env, id); }
  catch (error) {
    await env.DB.prepare("UPDATE releases SET status='failed',error=? WHERE id=? AND status='preparing'")
      .bind('No se pudo iniciar el proceso de publicación.', id).run();
    throw error;
  }
  return { id, status: 'preparing', summary, createdAt, publishedAt: null };
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function users(request: Request, env: Env, pathname: string, me: Editor): Promise<Response> {
  if (me.role !== 'admin') throw new HttpError(403, 'Solo las personas administradoras pueden gestionar usuarios.');
  if (pathname === '/api/editor/users' && request.method === 'GET') {
    const { results } = await env.DB.prepare('SELECT email,name,role,active,created_at AS createdAt,created_by AS createdBy,updated_at AS updatedAt FROM editors ORDER BY role,email').all();
    return json({ users: results, owner: env.EDITOR_EMAIL ?? null });
  }
  const body = await input(request);
  const now = new Date().toISOString();
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 120) : '';
  const role = body.role === 'admin' ? 'admin' : body.role === 'editor' ? 'editor' : null;
  if (pathname === '/api/editor/users' && request.method === 'POST') {
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!emailPattern.test(email) || email.length > 254 || !role) throw new HttpError(400, 'Indica un correo válido y un rol (administración o edición).');
    if (env.EDITOR_EMAIL && email === env.EDITOR_EMAIL.toLowerCase()) throw new HttpError(409, 'La persona propietaria ya es administradora.');
    const existing = await env.DB.prepare('SELECT 1 FROM editors WHERE email=?').bind(email).first();
    if (existing) throw new HttpError(409, 'Ya existe un usuario con ese correo.');
    await env.DB.batch([
      env.DB.prepare('INSERT INTO editors(email,name,role,active,created_at,created_by,updated_at) VALUES(?,?,?,1,?,?,?)').bind(email, name, role, now, me.email, now),
      audit(env, me.email, 'user.create', email, `Rol: ${role}`),
    ]);
    return json({ ok: true }, 201);
  }
  const match = pathname.match(/^\/api\/editor\/users\/([^/]+)$/);
  if (match && request.method === 'PUT') {
    const email = decodeURIComponent(match[1]).toLowerCase();
    if (email === me.email.toLowerCase()) throw new HttpError(409, 'No puedes cambiar tu propio rol ni desactivarte.');
    const active = body.active === false ? 0 : 1;
    if (!role) throw new HttpError(400, 'Rol no válido.');
    const existing = await env.DB.prepare('SELECT 1 FROM editors WHERE email=?').bind(email).first();
    if (!existing) throw new HttpError(404, 'Usuario no encontrado.');
    await env.DB.batch([
      env.DB.prepare('UPDATE editors SET name=?,role=?,active=?,updated_at=? WHERE email=?').bind(name, role, active, now, email),
      audit(env, me.email, active ? 'user.update' : 'user.deactivate', email, `Rol: ${role}${active ? '' : ' · desactivado'}`),
    ]);
    return json({ ok: true });
  }
  throw new HttpError(405, 'Método no permitido.');
}

async function editor(request: Request, env: Env, pathname: string): Promise<Response> {
  const me = await resolveEditor(request, env);
  if (!me) return json({ error: 'Acceso restringido.' }, 401);
  const email = me.email;
  if (!['GET', 'HEAD'].includes(request.method)) {
    const origin = request.headers.get('Origin');
    if (!origin || origin !== new URL(request.url).origin || request.headers.get('Sec-Fetch-Site') === 'cross-site')
      throw new HttpError(403, 'Origen no autorizado.');
  }
  if (pathname === '/api/editor/session' && request.method === 'GET') return json({ email, name: me.name, role: me.role });
  if (pathname === '/api/editor/users' || pathname.startsWith('/api/editor/users/')) return users(request, env, pathname, me);
  if (pathname === '/api/editor/audit' && request.method === 'GET') {
    if (me.role !== 'admin') throw new HttpError(403, 'Solo las personas administradoras pueden ver el registro.');
    const { results } = await env.DB.prepare('SELECT id,at,actor,action,target,detail FROM audit_log ORDER BY id DESC LIMIT 300').all();
    return json({ entries: results });
  }
  if (pathname === '/api/editor/documents' && request.method === 'GET') {
    const { results } = await env.DB.prepare('SELECT id,category,title,status,revision,updated_at AS updatedAt FROM documents ORDER BY category,title').all();
    return json({ documents: results });
  }
  if (pathname === '/api/editor/documents' && request.method === 'POST') {
    const body = await input(request);
    if (typeof body.id !== 'string' || !/^procedure:[A-Za-z0-9_-]+$/.test(body.id) || body.category !== 'procedure')
      throw new HttpError(400, 'Usa un identificador estable para la nueva ficha.');
    const data = body.data as Record<string, unknown> | undefined;
    if (data?.id !== body.id.slice('procedure:'.length)) throw new HttpError(400, 'El identificador de la ficha no coincide.');
    const baseline = { id: body.id, category: 'procedure', data_json: JSON.stringify({ id: data.id }), revision: 0 } as DocumentRow;
    const saved = validateSave({ ...body, expectedRevision: 0 }, baseline);
    const result = await env.DB.prepare("INSERT OR IGNORE INTO documents(id,category,title,data_json,private_notes,references_json,status,updated_at,updated_by) VALUES(?,'procedure',?,?,?,?,'draft',?,?)")
      .bind(body.id, saved.title, saved.json, saved.notes, saved.references, new Date().toISOString(), email).run();
    if (result.meta.changes !== 1) throw new HttpError(409, 'Ya existe una ficha con ese identificador.');
    await audit(env, email, 'document.create', body.id, saved.title).run();
    return json({ document: documentView(await getDocument(env, body.id)) }, 201);
  }
  if (pathname === '/api/editor/releases' && request.method === 'GET') {
    const { results } = await env.DB.prepare('SELECT id,status,summary,created_at AS createdAt,published_at AS publishedAt,error,created_by AS createdBy FROM releases ORDER BY created_at DESC LIMIT 50').all();
    return json({ releases: results });
  }
  if (pathname === '/api/editor/releases' && request.method === 'POST') {
    const body = await input(request);
    if (typeof body.summary !== 'string' || !body.summary.trim() || body.summary.length > 2000)
      throw new HttpError(400, 'Escribe un resumen público de la publicación.');
    return json({ release: await createRelease(env, email, body.summary.trim()) }, 202);
  }
  const restoreRelease = pathname.match(/^\/api\/editor\/releases\/([^/]+)\/restore$/);
  if (restoreRelease && request.method === 'POST')
    return json({ release: await createRelease(env, email, 'Restauración de una publicación anterior.', decodeURIComponent(restoreRelease[1])) }, 202);
  const cancelRelease = pathname.match(/^\/api\/editor\/releases\/([^/]+)\/cancel$/);
  if (cancelRelease && request.method === 'POST') {
    const id = decodeURIComponent(cancelRelease[1]);
    const result = await env.DB.prepare("UPDATE releases SET status='failed',error='Preparación cancelada desde el editor.' WHERE id=? AND status='preparing'").bind(id).run();
    if (result.meta.changes !== 1) throw new HttpError(409, 'La publicación ya ha terminado o no está en preparación.');
    await audit(env, email, 'release.cancel', id).run();
    const release = await env.DB.prepare('SELECT id,status,summary,created_at AS createdAt,published_at AS publishedAt,error FROM releases WHERE id=?').bind(id).first();
    return json({ release });
  }
  const match = pathname.match(/^\/api\/editor\/documents\/([^/]+)(?:\/(history|transition|restore|resolve))?$/);
  if (!match) throw new HttpError(404, 'Ruta no encontrada.');
  const id = decodeURIComponent(match[1]); const action = match[2];
  const row = await getDocument(env, id);
  if (!action && request.method === 'GET') return json({ document: documentView(row) });
  if (action === 'history' && request.method === 'GET') {
    const { results } = await env.DB.prepare('SELECT revision,title,data_json,status,created_at AS createdAt,author FROM revisions WHERE document_id=? ORDER BY revision DESC LIMIT 100').bind(id).all<{ revision: number; title: string; data_json: string; status: string; createdAt: string; author: string | null }>();
    return json({ revisions: results.map(({ data_json, ...revision }) => ({ ...revision, data: JSON.parse(data_json) })) });
  }
  const body = await input(request); checkRevision(body, row);
  const now = new Date().toISOString();
  if ((!action && request.method === 'PUT') || (action === 'resolve' && request.method === 'POST')) {
    const saved = validateSave(body, row);
    if (action === 'resolve' && !row.incoming_source_json) throw new HttpError(409, 'No hay un cambio de origen pendiente.');
    const source = action === 'resolve' ? row.incoming_source_json : row.source_json;
    const sourceHash = action === 'resolve'
      ? Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source!))), (v) => v.toString(16).padStart(2, '0')).join('')
      : row.source_hash;
    const result = await env.DB.prepare("UPDATE documents SET title=?,data_json=?,private_notes=?,references_json=?,status='draft',source_json=?,source_hash=?,incoming_source_json=?,revision=revision+1,updated_at=?,updated_by=? WHERE id=? AND revision=?")
      .bind(saved.title, saved.json, saved.notes, saved.references, source, sourceHash, action === 'resolve' ? null : row.incoming_source_json, now, email, id, row.revision).run();
    checkChanged(result);
    await audit(env, email, action === 'resolve' ? 'document.resolve' : 'document.save', id, `Revisión ${row.revision + 1}`).run();
  } else if (action === 'transition' && request.method === 'POST') {
    if (typeof body.status !== 'string' || !transitions[row.status]?.includes(body.status)) throw new HttpError(400, 'Transición de estado no válida.');
    if (body.status === 'ready' && row.incoming_source_json) throw new HttpError(409, 'Resuelve primero el cambio de origen pendiente.');
    const result = await env.DB.prepare('UPDATE documents SET status=?,revision=revision+1,updated_at=?,updated_by=? WHERE id=? AND revision=?')
      .bind(body.status, now, email, id, row.revision).run();
    checkChanged(result);
    await audit(env, email, 'document.status', id, `${row.status} → ${body.status}`).run();
  } else if (action === 'restore' && request.method === 'POST') {
    if (!Number.isInteger(body.revision)) throw new HttpError(400, 'Revisión no válida.');
    const previous = await env.DB.prepare('SELECT * FROM revisions WHERE document_id=? AND revision=?').bind(id, body.revision).first<DocumentRow>();
    if (!previous) throw new HttpError(404, 'Revisión no encontrada.');
    const result = await env.DB.prepare("UPDATE documents SET title=?,data_json=?,private_notes=?,references_json=?,status='draft',revision=revision+1,updated_at=?,updated_by=? WHERE id=? AND revision=?")
      .bind(previous.title, previous.data_json, previous.private_notes, previous.references_json, now, email, id, row.revision).run();
    checkChanged(result);
    await audit(env, email, 'document.restore', id, `Desde la revisión ${body.revision}`).run();
  } else throw new HttpError(405, 'Método no permitido.');
  return json({ document: documentView(await getDocument(env, id)) });
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'If-None-Match, If-Modified-Since',
  'Access-Control-Expose-Headers': 'ETag, Last-Modified, X-Manual-Release, X-Manual-Content-Hash',
  'Access-Control-Max-Age': '86400',
};

/** Weak validators are enough: every public body is derived from an immutable release. */
function notModified(request: Request, etag: string): boolean {
  const header = request.headers.get('If-None-Match');
  if (!header) return false;
  return header.split(',').map((value) => value.trim().replace(/^W\//, '')).some((value) => value === etag || value === '*');
}

function publicHeaders(extra: Record<string, string>): Headers {
  return new Headers({ ...CORS_HEADERS, 'X-Content-Type-Options': 'nosniff', ...extra });
}

async function artifactBody(env: Env, releaseId: string, name: string): Promise<string[] | null> {
  const { results } = await env.DB.prepare("SELECT a.body FROM release_artifacts a JOIN releases r ON r.id=a.release_id WHERE a.release_id=? AND a.name=? AND r.status='published' ORDER BY a.part").bind(releaseId, name).all<{ body: string }>();
  return results.length ? results.map((part) => part.body) : null;
}

interface PublicManifestBody { releaseId: string; publishedAt: string | null; datasets: Record<string, { sha256: string }> }

async function manifestFor(env: Env, releaseId: string, publishedAt: string | null): Promise<PublicManifestBody | null> {
  const parts = await artifactBody(env, releaseId, 'manifest.json');
  if (!parts) return null;
  const manifest = JSON.parse(parts.join('')) as PublicManifestBody;
  return { ...manifest, publishedAt };
}

async function publicApi(request: Request, env: Env, pathname: string): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: publicHeaders({}) });
  if (request.method !== 'GET' && request.method !== 'HEAD') return json({ error: 'Método no permitido.' }, 405, true);
  if (pathname === '/api/health') {
    await env.DB.prepare('SELECT 1').first();
    return json({ ok: true }, 200, true);
  }
  const pointer = await env.DB.prepare('SELECT r.* FROM publication_pointer p JOIN releases r ON r.id=p.release_id WHERE p.singleton=1').first<{
    id: string; metadata_json: string; hash: string; published_at: string | null;
  }>();
  if (!pointer) return json({ error: 'La primera publicación todavía está en preparación.' }, 503, true);
  const releaseHeaders = { 'X-Manual-Release': pointer.id, 'X-Manual-Content-Hash': pointer.hash, ...(pointer.published_at ? { 'Last-Modified': new Date(pointer.published_at).toUTCString() } : {}) };
  if (pathname.startsWith('/procedures/') && pathname.endsWith('.md')) {
    const slug = decodeURIComponent(pathname.slice('/procedures/'.length, -3));
    const row = await env.DB.prepare('SELECT data_json FROM public_documents WHERE release_id=? AND slug=?').bind(pointer.id, slug).first<{ data_json: string }>();
    if (!row) return json({ error: 'Documento no encontrado.' }, 404, true);
    const procedure = JSON.parse(row.data_json) as { title: string; content: string };
    return new Response(`# ${procedure.title}\n\n${procedure.content}`, { headers: publicHeaders({ 'Content-Type': 'text/markdown; charset=utf-8', 'Cache-Control': 'no-cache' }) });
  }

  // Manifest: the one small document clients poll. ETag = active content hash.
  if (pathname === '/api/public/manifest' || pathname === '/api/public/manifest.json') {
    const etag = `"${pointer.hash}"`;
    const headers = publicHeaders({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=0, must-revalidate', ETag: etag, ...releaseHeaders });
    if (notModified(request, etag)) return new Response(null, { status: 304, headers });
    const manifest = await manifestFor(env, pointer.id, pointer.published_at);
    if (!manifest) return json({ error: 'La publicación activa todavía no tiene manifiesto de datos.' }, 503, true);
    return new Response(request.method === 'HEAD' ? null : JSON.stringify(manifest), { headers });
  }

  // Per-dataset bodies: current (/api/public/datasets/x.json) or pinned to a release.
  const currentDataset = pathname.match(/^\/api\/public\/datasets\/([a-z0-9-]{1,64})\.json$/);
  const pinnedDataset = pathname.match(/^\/api\/public\/releases\/([a-zA-Z0-9-]+)\/datasets\/([a-z0-9-]{1,64})\.json$/);
  if (currentDataset || pinnedDataset) {
    const releaseId = pinnedDataset ? pinnedDataset[1] : pointer.id;
    const name = pinnedDataset ? pinnedDataset[2] : currentDataset![1];
    const release = releaseId === pointer.id ? pointer : await env.DB.prepare("SELECT id,published_at FROM releases WHERE id=? AND status='published'").bind(releaseId).first<{ published_at: string | null }>();
    if (!release) return json({ error: 'Publicación no encontrada.' }, 404, true);
    const manifest = await manifestFor(env, releaseId, release.published_at);
    const entry = manifest?.datasets[name];
    if (!entry) return json({ error: 'Conjunto de datos no encontrado.' }, 404, true);
    const etag = `"${entry.sha256}"`;
    const headers = publicHeaders({ 'Content-Type': 'application/json; charset=utf-8', ETag: etag, 'X-Manual-Release': releaseId,
      'Cache-Control': pinnedDataset ? 'public, max-age=31536000, immutable' : 'public, max-age=0, must-revalidate' });
    if (notModified(request, etag)) return new Response(null, { status: 304, headers });
    const parts = await artifactBody(env, releaseId, `datasets/${name}.json`);
    if (!parts) return json({ error: 'Conjunto de datos no encontrado.' }, 404, true);
    return new Response(request.method === 'HEAD' ? null : parts.join(''), { headers });
  }

  if (pathname === '/api/mobile/content/metadata') {
    const etag = `"${pointer.hash}"`;
    const headers = publicHeaders({ 'Content-Type': 'application/json', 'Cache-Control': 'no-cache', ETag: etag, ...releaseHeaders });
    if (notModified(request, etag)) return new Response(null, { status: 304, headers });
    return new Response(request.method === 'HEAD' ? null : pointer.metadata_json, { headers });
  }
  if (pathname === '/api/public/releases') {
    const { results } = await env.DB.prepare("SELECT id,summary,published_at AS publishedAt,changelog_json FROM releases WHERE status='published' ORDER BY published_at DESC LIMIT 50").all<{ changelog_json: string }>();
    return json({ releases: results.map(({ changelog_json, ...release }) => ({ ...release, changes: JSON.parse(changelog_json || '[]') })) }, 200, true);
  }
  const pdf = pathname.match(/^\/api\/public\/releases\/([^/]+)\/changelog\.pdf$/);
  const immutable = pathname.match(/^\/api\/public\/releases\/([^/]+)\/snapshot$/);
  const historyPage = pathname.match(/^\/mobile-history\/([a-f0-9]{64})\/(page-\d{4}\.json)$/);
  const historyIndex = pathname === '/mobile-history/index.json';
  const llms = pathname === '/llms.txt' || pathname === '/llms-full.txt';
  if (pathname === '/api/mobile/content/v3' || pathname === '/api/public/content' || pdf || immutable || historyPage || historyIndex || llms) {
    let releaseId = pdf || immutable ? decodeURIComponent((pdf || immutable)![1]) : pointer.id;
    if (historyPage) {
      const release = await env.DB.prepare("SELECT id FROM releases WHERE package_hash=? AND status='published' LIMIT 1").bind(historyPage[1]).first<{ id: string }>();
      if (!release) return json({ error: 'Historial no encontrado.' }, 404, true);
      releaseId = release.id;
    }
    const pinned = !!(pdf || immutable || historyPage);
    // Pinned bodies never change; current ones change exactly when the active hash does.
    const etag = pdf ? null : pinned ? `"${releaseId}:${historyPage ? historyPage[2] : 'snapshot'}"` : `"${pointer.hash}${llms ? `:${pathname.slice(1)}` : historyIndex ? ':history' : ''}"`;
    const headers = publicHeaders({
      'Content-Type': pdf ? 'application/pdf' : llms ? 'text/plain; charset=utf-8' : 'application/json',
      'Cache-Control': pinned ? 'public, max-age=31536000, immutable' : 'no-cache',
      ...(pdf ? { 'Content-Disposition': 'attachment; filename="cambios-manual-samur.pdf"' } : {}),
      ...(etag ? { ETag: etag } : {}),
      ...(pinned ? {} : releaseHeaders),
    });
    if (etag && notModified(request, etag)) return new Response(null, { status: 304, headers });
    const name = pdf ? 'changelog.pdf' : historyIndex ? 'history/index.json' : historyPage ? `history/${historyPage[2]}` : llms ? pathname.slice(1) : 'snapshot.json';
    const results = await artifactBody(env, releaseId, name);
    if (!results) return json({ error: 'Publicación no encontrada.' }, 404, true);
    const stream = new ReadableStream<Uint8Array>({ start(controller) {
      for (const part of results) controller.enqueue(pdf ? Uint8Array.from(atob(part), (character) => character.charCodeAt(0)) : new TextEncoder().encode(part));
      controller.close();
    } });
    return new Response(request.method === 'HEAD' ? null : stream, { headers });
  }
  const document = pathname.match(/^\/api\/public\/documents\/([^/]+)$/);
  if (document) {
    const row = await env.DB.prepare('SELECT data_json FROM public_documents WHERE release_id=? AND (id=? OR slug=?)')
      .bind(pointer.id, decodeURIComponent(document[1]), decodeURIComponent(document[1])).first<{ data_json: string }>();
    return row ? json({ document: JSON.parse(row.data_json), releaseId: pointer.id }, 200, true) : json({ error: 'Documento no encontrado.' }, 404, true);
  }
  return json({ error: 'Ruta no encontrada.' }, 404, true);
}

/** Canonical public origin. The workers.dev host keeps serving data for installed apps. */
export const CANONICAL_ORIGIN = 'https://manualsamur.apta-academy.com';
const LEGACY_HOST = 'manualsamur.miguelrzazo13.workers.dev';
// Apps and the Watch built before the move fetch these from the legacy host; never redirect them.
const LEGACY_KEPT_PREFIXES = ['/api/', '/.well-known/', '/mobile-history/', '/procedures/', '/docs/', '/images/', '/_next/', '/assets/', '/gestion-editorial'];

/** 301 for page navigations on the legacy host; `null` when the request must be served as is. */
export function legacyHostRedirect(request: Request): Response | null {
  const url = new URL(request.url);
  if (url.hostname !== LEGACY_HOST || (request.method !== 'GET' && request.method !== 'HEAD')) return null;
  if (LEGACY_KEPT_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) return null;
  // Pages have no extension; files (llms.txt, RSC payloads, icons) stay on the legacy host.
  if (/\.[a-z0-9]+$/i.test(url.pathname)) return null;
  return Response.redirect(`${CANONICAL_ORIGIN}${url.pathname}${url.search}`, 301);
}

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const redirect = legacyHostRedirect(request);
      if (redirect) return redirect;
      const url = new URL(request.url); const pathname = url.pathname.replace(/\/$/, '') || '/';
      if (pathname.startsWith('/api/editor/')) return await editor(request, env, pathname);
      if (pathname.startsWith('/api/')) return await publicApi(request, env, pathname);
      if (pathname.startsWith('/mobile-history/') || pathname.startsWith('/procedures/') || pathname === '/llms.txt' || pathname === '/llms-full.txt') return await publicApi(request, env, pathname);
      if (/^\/(docs|images)\/_versions\//.test(pathname) && env.FILES) return env.FILES.fetch(request);
      if (pathname.startsWith('/gestion-editorial')) {
        if (!await resolveEditor(request, env)) return new Response('Acceso restringido.', { status: 401, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' } });
        const asset = await env.ASSETS.fetch(request);
        const headers = new Headers(asset.headers); headers.set('Cache-Control', 'no-store'); headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
        return new Response(asset.body, { status: asset.status, headers });
      }
      let response = await env.ASSETS.fetch(request);
      // Static Next shell supports newly published slugs without a frontend rebuild.
      if (response.status === 404 && pathname.startsWith('/manual/')) {
        const slug = pathname.slice('/manual/'.length);
        const exists = await env.DB.prepare('SELECT 1 FROM public_documents d JOIN publication_pointer p ON p.release_id=d.release_id WHERE p.singleton=1 AND d.slug=?').bind(slug).first();
        if (exists) { url.pathname = '/manual'; response = await env.ASSETS.fetch(new Request(url, request)); }
      }
      if (pathname.endsWith('.pdf')) {
        const headers = new Headers(response.headers); headers.set('Content-Type', 'application/pdf'); headers.set('Content-Disposition', 'inline');
        return new Response(response.body, { status: response.status, headers });
      }
      return response;
    } catch (error) {
      if (error instanceof HttpError) return json({ error: error.message }, error.status);
      // Do not log body, drafts, private notes, credentials or provider responses.
      console.error('Request failed', error instanceof Error ? error.name : 'UnknownError');
      return json({ error: 'No se pudo completar la operación. Inténtalo de nuevo.' }, 500);
    }
  },
};
export default worker;

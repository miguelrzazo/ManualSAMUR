import { authenticate, type AccessConfig } from './auth.ts';
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

async function createRelease(env: Env, summary: string, restoreId?: string) {
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
  const statements = [env.DB.prepare("INSERT INTO releases(id,status,summary,created_at,parent_id) VALUES(?,'preparing',?,?,?)").bind(id, summary, createdAt, parent?.release_id ?? null)];
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

async function editor(request: Request, env: Env, pathname: string): Promise<Response> {
  const email = await authenticate(request, env);
  if (!email) return json({ error: 'Acceso restringido.' }, 401);
  if (!['GET', 'HEAD'].includes(request.method)) {
    const origin = request.headers.get('Origin');
    if (!origin || origin !== new URL(request.url).origin || request.headers.get('Sec-Fetch-Site') === 'cross-site')
      throw new HttpError(403, 'Origen no autorizado.');
  }
  if (pathname === '/api/editor/session' && request.method === 'GET') return json({ email });
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
    const result = await env.DB.prepare("INSERT OR IGNORE INTO documents(id,category,title,data_json,private_notes,references_json,status,updated_at) VALUES(?,'procedure',?,?,?,?,'draft',?)")
      .bind(body.id, saved.title, saved.json, saved.notes, saved.references, new Date().toISOString()).run();
    if (result.meta.changes !== 1) throw new HttpError(409, 'Ya existe una ficha con ese identificador.');
    return json({ document: documentView(await getDocument(env, body.id)) }, 201);
  }
  if (pathname === '/api/editor/releases' && request.method === 'GET') {
    const { results } = await env.DB.prepare('SELECT id,status,summary,created_at AS createdAt,published_at AS publishedAt,error FROM releases ORDER BY created_at DESC LIMIT 50').all();
    return json({ releases: results });
  }
  if (pathname === '/api/editor/releases' && request.method === 'POST') {
    const body = await input(request);
    if (typeof body.summary !== 'string' || !body.summary.trim() || body.summary.length > 2000)
      throw new HttpError(400, 'Escribe un resumen público de la publicación.');
    return json({ release: await createRelease(env, body.summary.trim()) }, 202);
  }
  const restoreRelease = pathname.match(/^\/api\/editor\/releases\/([^/]+)\/restore$/);
  if (restoreRelease && request.method === 'POST')
    return json({ release: await createRelease(env, 'Restauración de una publicación anterior.', decodeURIComponent(restoreRelease[1])) }, 202);
  const cancelRelease = pathname.match(/^\/api\/editor\/releases\/([^/]+)\/cancel$/);
  if (cancelRelease && request.method === 'POST') {
    const id = decodeURIComponent(cancelRelease[1]);
    const result = await env.DB.prepare("UPDATE releases SET status='failed',error='Preparación cancelada desde el editor.' WHERE id=? AND status='preparing'").bind(id).run();
    if (result.meta.changes !== 1) throw new HttpError(409, 'La publicación ya ha terminado o no está en preparación.');
    const release = await env.DB.prepare('SELECT id,status,summary,created_at AS createdAt,published_at AS publishedAt,error FROM releases WHERE id=?').bind(id).first();
    return json({ release });
  }
  const match = pathname.match(/^\/api\/editor\/documents\/([^/]+)(?:\/(history|transition|restore|resolve))?$/);
  if (!match) throw new HttpError(404, 'Ruta no encontrada.');
  const id = decodeURIComponent(match[1]); const action = match[2];
  const row = await getDocument(env, id);
  if (!action && request.method === 'GET') return json({ document: documentView(row) });
  if (action === 'history' && request.method === 'GET') {
    const { results } = await env.DB.prepare('SELECT revision,title,data_json,status,created_at AS createdAt FROM revisions WHERE document_id=? ORDER BY revision DESC LIMIT 100').bind(id).all<{ revision: number; title: string; data_json: string; status: string; createdAt: string }>();
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
    const result = await env.DB.prepare("UPDATE documents SET title=?,data_json=?,private_notes=?,references_json=?,status='draft',source_json=?,source_hash=?,incoming_source_json=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?")
      .bind(saved.title, saved.json, saved.notes, saved.references, source, sourceHash, action === 'resolve' ? null : row.incoming_source_json, now, id, row.revision).run();
    checkChanged(result);
  } else if (action === 'transition' && request.method === 'POST') {
    if (typeof body.status !== 'string' || !transitions[row.status]?.includes(body.status)) throw new HttpError(400, 'Transición de estado no válida.');
    if (body.status === 'ready' && row.incoming_source_json) throw new HttpError(409, 'Resuelve primero el cambio de origen pendiente.');
    const result = await env.DB.prepare('UPDATE documents SET status=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?')
      .bind(body.status, now, id, row.revision).run();
    checkChanged(result);
  } else if (action === 'restore' && request.method === 'POST') {
    if (!Number.isInteger(body.revision)) throw new HttpError(400, 'Revisión no válida.');
    const previous = await env.DB.prepare('SELECT * FROM revisions WHERE document_id=? AND revision=?').bind(id, body.revision).first<DocumentRow>();
    if (!previous) throw new HttpError(404, 'Revisión no encontrada.');
    const result = await env.DB.prepare("UPDATE documents SET title=?,data_json=?,private_notes=?,references_json=?,status='draft',revision=revision+1,updated_at=? WHERE id=? AND revision=?")
      .bind(previous.title, previous.data_json, previous.private_notes, previous.references_json, now, id, row.revision).run();
    checkChanged(result);
  } else throw new HttpError(405, 'Método no permitido.');
  return json({ document: documentView(await getDocument(env, id)) });
}

async function publicApi(request: Request, env: Env, pathname: string): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') return json({ error: 'Método no permitido.' }, 405, true);
  if (pathname === '/api/health') {
    await env.DB.prepare('SELECT 1').first();
    return json({ ok: true }, 200, true);
  }
  const pointer = await env.DB.prepare('SELECT r.* FROM publication_pointer p JOIN releases r ON r.id=p.release_id WHERE p.singleton=1').first<{
    id: string; metadata_json: string; hash: string;
  }>();
  if (!pointer) return json({ error: 'La primera publicación todavía está en preparación.' }, 503, true);
  if (pathname.startsWith('/procedures/') && pathname.endsWith('.md')) {
    const slug = decodeURIComponent(pathname.slice('/procedures/'.length, -3));
    const row = await env.DB.prepare('SELECT data_json FROM public_documents WHERE release_id=? AND slug=?').bind(pointer.id, slug).first<{ data_json: string }>();
    if (!row) return json({ error: 'Documento no encontrado.' }, 404, true);
    const procedure = JSON.parse(row.data_json) as { title: string; content: string };
    return new Response(`# ${procedure.title}\n\n${procedure.content}`, { headers: { 'Content-Type': 'text/markdown; charset=utf-8', 'Cache-Control': 'no-cache' } });
  }
  if (pathname === '/api/mobile/content/metadata') return new Response(pointer.metadata_json, { headers: {
    'Content-Type': 'application/json', 'Cache-Control': 'no-cache', 'Access-Control-Allow-Origin': '*',
  } });
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
    const name = pdf ? 'changelog.pdf' : historyIndex ? 'history/index.json' : historyPage ? `history/${historyPage[2]}` : llms ? pathname.slice(1) : 'snapshot.json';
    const { results } = await env.DB.prepare("SELECT a.body FROM release_artifacts a JOIN releases r ON r.id=a.release_id WHERE a.release_id=? AND a.name=? AND r.status='published' ORDER BY a.part").bind(releaseId, name).all<{ body: string }>();
    if (!results.length) return json({ error: 'Publicación no encontrada.' }, 404, true);
    const stream = new ReadableStream<Uint8Array>({ start(controller) {
      for (const part of results) controller.enqueue(pdf ? Uint8Array.from(atob(part.body), (character) => character.charCodeAt(0)) : new TextEncoder().encode(part.body));
      controller.close();
    } });
    return new Response(request.method === 'HEAD' ? null : stream, { headers: {
      'Content-Type': pdf ? 'application/pdf' : llms ? 'text/plain; charset=utf-8' : 'application/json', 'X-Content-Type-Options': 'nosniff',
      'Access-Control-Allow-Origin': '*', 'Cache-Control': pdf || immutable || historyPage ? 'public, max-age=31536000, immutable' : 'no-cache',
      ...(pdf ? { 'Content-Disposition': 'attachment; filename="cambios-manual-samur.pdf"' } : { ETag: `"${pointer.hash}"` }),
    } });
  }
  const document = pathname.match(/^\/api\/public\/documents\/([^/]+)$/);
  if (document) {
    const row = await env.DB.prepare('SELECT data_json FROM public_documents WHERE release_id=? AND (id=? OR slug=?)')
      .bind(pointer.id, decodeURIComponent(document[1]), decodeURIComponent(document[1])).first<{ data_json: string }>();
    return row ? json({ document: JSON.parse(row.data_json), releaseId: pointer.id }, 200, true) : json({ error: 'Documento no encontrado.' }, 404, true);
  }
  return json({ error: 'Ruta no encontrada.' }, 404, true);
}

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url); const pathname = url.pathname.replace(/\/$/, '') || '/';
      if (pathname.startsWith('/api/editor/')) return await editor(request, env, pathname);
      if (pathname.startsWith('/api/')) return await publicApi(request, env, pathname);
      if (pathname.startsWith('/mobile-history/') || pathname.startsWith('/procedures/') || pathname === '/llms.txt' || pathname === '/llms-full.txt') return await publicApi(request, env, pathname);
      if (/^\/(docs|images)\/_versions\//.test(pathname) && env.FILES) return env.FILES.fetch(request);
      if (pathname.startsWith('/gestion-editorial')) {
        if (!await authenticate(request, env)) return new Response('Acceso restringido.', { status: 401, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' } });
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

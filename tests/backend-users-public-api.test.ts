import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import type { D1Database } from '@cloudflare/workers-types';
import worker, { type Env } from '../backend/src/worker.ts';
import { chunks } from '../scripts/backend/core.ts';
import { buildPublicDatasetArtifacts } from '../scripts/backend/public-datasets.ts';
import { canonicalJson } from '../packages/manual-content/src/index.ts';

interface SqlStatement { run(...values: unknown[]): { changes: number }; get(...values: unknown[]): Record<string, unknown> | undefined; all(...values: unknown[]): Array<Record<string, unknown>> }
interface SqlDatabase { exec(sql: string): void; prepare(sql: string): SqlStatement; close(): void }
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as { DatabaseSync: new (file: string) => SqlDatabase };

function database() {
  const sqlite = new DatabaseSync(':memory:');
  for (const migration of fs.readdirSync(new URL('../backend/migrations/', import.meta.url)).filter((name) => name.endsWith('.sql')).sort())
    sqlite.exec(fs.readFileSync(new URL(`../backend/migrations/${migration}`, import.meta.url), 'utf8'));
  const prepare = (sql: string) => {
    let bindings: unknown[] = [];
    const statement = {
      bind(...values: unknown[]) { bindings = values; return statement; },
      async first() { return sqlite.prepare(sql).get(...bindings) || null; },
      async all() { return { results: sqlite.prepare(sql).all(...bindings), success: true }; },
      async run() { return { success: true, meta: { changes: Number(sqlite.prepare(sql).run(...bindings).changes) } }; },
    };
    return statement;
  };
  const db = { prepare, async batch(statements: Array<{ run(): Promise<unknown> }>) {
    sqlite.exec('BEGIN');
    try { const results = []; for (const statement of statements) results.push(await statement.run()); sqlite.exec('COMMIT'); return results; }
    catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  } } as unknown as D1Database;
  return { sqlite, db };
}

const fixture = { id: '301', title: 'Ficha publicada', slug: '301-ficha', content: 'Texto público', section: 'SVA', attachments: [], related: [] };
const privateNotes = 'NOTA PRIVADA QUE NUNCA DEBE SER PUBLICA';

async function accessFixture() {
  const keys = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', keys.publicKey);
  const config = { ACCESS_TEAM_DOMAIN: 'fixture.cloudflareaccess.com', ACCESS_AUD: 'editor', EDITOR_EMAIL: 'owner@example.test' };
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const token = async (email: string) => {
    const payload = `${encode({ alg: 'RS256', kid: 'fixture' })}.${encode({ iss: 'https://fixture.cloudflareaccess.com', aud: ['editor'], exp: Date.now() / 1000 + 600, email })}`;
    return `${payload}.${Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keys.privateKey, new TextEncoder().encode(payload))).toString('base64url')}`;
  };
  return { jwk, config, token };
}

test('#27: admins manage editor users; editors cannot; every change is attributed and logged', async () => {
  const { jwk, config, token } = await accessFixture();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ keys: [{ ...jwk, kid: 'fixture' }] });
  try {
    const { sqlite, db } = database();
    sqlite.prepare("INSERT INTO documents(id,category,title,data_json,private_notes,status,updated_at) VALUES('procedure:301','procedure','Ficha publicada',?,?,'draft','2026-10-27')")
      .run(canonicalJson(fixture), privateNotes);
    const env = { ...config, DB: db, ASSETS: { fetch: async () => new Response('shell') } } as Env;
    const call = async (email: string, pathname: string, method = 'GET', body?: unknown) => worker.fetch(new Request(`https://manual.test${pathname}`, {
      method, headers: { 'Cf-Access-Jwt-Assertion': await token(email), Origin: 'https://manual.test', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    }), env);
    // An Access-verified identity that is not on the list is still rejected at the origin.
    assert.equal((await call('editor@example.test', '/api/editor/session')).status, 401);
    assert.equal((await call('editor@example.test', '/gestion-editorial')).status, 401);
    assert.equal((await (await call(config.EDITOR_EMAIL, '/api/editor/session')).json() as { role: string }).role, 'admin');
    assert.equal((await call(config.EDITOR_EMAIL, '/api/editor/users', 'POST', { email: 'Editor@Example.test', name: 'Ana', role: 'editor' })).status, 201);
    assert.equal((await call(config.EDITOR_EMAIL, '/api/editor/users', 'POST', { email: 'editor@example.test', role: 'editor' })).status, 409);
    const session = await call('editor@example.test', '/api/editor/session');
    assert.equal(session.status, 200); assert.equal((await session.json() as { role: string }).role, 'editor');
    assert.equal((await call('editor@example.test', '/api/editor/users')).status, 403);
    assert.equal((await call('editor@example.test', '/api/editor/audit')).status, 403);
    const saved = await call('editor@example.test', '/api/editor/documents/procedure%3A301', 'PUT', { expectedRevision: 1, title: 'Edición de Ana', data: fixture, privateNotes, references: [] });
    assert.equal(saved.status, 200);
    const history = await (await call('editor@example.test', '/api/editor/documents/procedure%3A301/history')).json() as { revisions: Array<{ author: string | null }> };
    assert.equal(history.revisions[0].author, 'editor@example.test');
    assert.equal(history.revisions.at(-1)?.author, null);
    // Deactivation is immediate; nobody can change their own role.
    assert.equal((await call(config.EDITOR_EMAIL, '/api/editor/users/editor%40example.test', 'PUT', { role: 'editor', active: false })).status, 200);
    assert.equal((await call('editor@example.test', '/api/editor/session')).status, 401);
    assert.equal((await call(config.EDITOR_EMAIL, `/api/editor/users/${encodeURIComponent(config.EDITOR_EMAIL)}`, 'PUT', { role: 'editor' })).status, 409);
    const log = await (await call(config.EDITOR_EMAIL, '/api/editor/audit')).json() as { entries: Array<{ actor: string; action: string; detail: string }> };
    assert.deepEqual(log.entries.map((entry) => entry.action), ['user.deactivate', 'document.save', 'user.create']);
    assert.equal(log.entries[1].actor, 'editor@example.test');
    assert.ok(log.entries.every((entry) => !entry.detail.includes(privateNotes)));
    assert.throws(() => sqlite.exec('DELETE FROM audit_log'), /append-only/);
    sqlite.close();
  } finally { globalThis.fetch = originalFetch; }
});

test('public data API: manifest, per-dataset bodies, ETag/304 and CORS', async () => {
  const snapshot = { schema: 'samur-manual.mobile-content', version: 3, generatedAt: '2026-10-28T00:00:00.000Z', hash: 'abc', packageHash: 'def',
    content: { procedures: [fixture], codes: { sva: [{ code: 'X' }] }, drugs: [{ name: 'Adrenalina' }], perfusions: [], fluids: [], commercialNames: [], abbreviations: [],
      hospitals: [{ name: 'H' }], bases: [], status4: [], manual: { manualVersion: 'v2.0 junio 2026', runs: [1, 2, 3] }, links: {}, relationsIndex: {}, updates: [] } };
  const { files, manifest } = buildPublicDatasetArtifacts(snapshot as never, 'first');
  assert.equal(manifest.manualVersion, 'v2.0 junio 2026');
  for (const name of ['procedures', 'vademecum', 'vademecum-comerciales', 'codigos-sva', 'codigos-incidente', 'codigos-pc', 'status4', 'hospitals', 'bases'])
    assert.ok(manifest.datasets[name], name);
  assert.equal(manifest.datasets['codigos-sva'].count, 1);
  assert.ok(!files.find(([name]) => name === 'datasets/manual.json')![1].includes('runs'));
  const { sqlite, db } = database();
  sqlite.exec("INSERT INTO releases(id,status,summary,created_at,hash,metadata_json) VALUES('first','preparing','Resumen','2026-10-27','abc','{\"hash\":\"abc\"}'); INSERT INTO release_artifacts VALUES('first','snapshot.json',0,'{}'); INSERT INTO release_artifacts VALUES('first','changelog.pdf',0,'cGRm'); INSERT INTO public_documents VALUES('first','procedure:301','301-ficha','Ficha','{}')");
  for (const [name, body] of files) for (const [part, chunk] of chunks(body).entries())
    sqlite.prepare('INSERT INTO release_artifacts VALUES(?,?,?,?)').run('first', name, part, chunk);
  sqlite.exec("INSERT INTO publication_pointer VALUES(1,'first')");
  const env = { DB: db, ASSETS: { fetch: async () => new Response('shell') } } as Env;
  const get = (pathname: string, headers: Record<string, string> = {}) => worker.fetch(new Request(`https://manual.test${pathname}`, { headers }), env);
  const response = await get('/api/public/manifest');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('ETag'), '"abc"');
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*');
  assert.match(response.headers.get('Access-Control-Expose-Headers') || '', /ETag/);
  const body = await response.json() as { publishedAt: string; releaseId: string; datasets: Record<string, { url: string; sha256: string }> };
  assert.ok(body.publishedAt); assert.equal(body.releaseId, 'first');
  assert.equal((await get('/api/public/manifest', { 'If-None-Match': '"abc"' })).status, 304);
  const dataset = await get(body.datasets.vademecum.url);
  assert.equal(dataset.status, 200);
  assert.deepEqual(await dataset.json(), [{ name: 'Adrenalina' }]);
  assert.equal(dataset.headers.get('ETag'), `"${body.datasets.vademecum.sha256}"`);
  assert.equal((await get(body.datasets.vademecum.url, { 'If-None-Match': `"${body.datasets.vademecum.sha256}"` })).status, 304);
  const pinned = await get('/api/public/releases/first/datasets/hospitals.json');
  assert.equal(pinned.status, 200); assert.match(pinned.headers.get('Cache-Control') || '', /immutable/);
  assert.equal((await get('/api/public/datasets/unknown.json')).status, 404);
  assert.equal((await get('/api/public/content', { 'If-None-Match': '"abc"' })).status, 304);
  const preflight = await worker.fetch(new Request('https://manual.test/api/public/manifest', { method: 'OPTIONS' }), env);
  assert.equal(preflight.status, 204); assert.match(preflight.headers.get('Access-Control-Allow-Headers') || '', /If-None-Match/);
  sqlite.close();
});

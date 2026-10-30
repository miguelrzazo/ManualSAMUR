import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import type { D1Database } from '@cloudflare/workers-types';
import worker, { type Env } from '../backend/src/worker.ts';
import { authenticate } from '../backend/src/auth.ts';
import { hash, proposalSql, chunks } from '../scripts/backend/core.ts';
import { canonicalJson } from '../packages/manual-content/src/index.ts';
import { retainFrozenAsset, rewriteAssetPaths } from '../scripts/backend/assets.ts';

interface SqlStatement {
  run(...values: unknown[]): { changes: number };
  get(...values: unknown[]): Record<string, unknown> | undefined;
  all(...values: unknown[]): Array<Record<string, unknown>>;
}
interface SqlDatabase { exec(sql: string): void; prepare(sql: string): SqlStatement; close(): void }
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as { DatabaseSync: new (file: string) => SqlDatabase };

function database() {
  const sqlite = new DatabaseSync(':memory:');
  for (const migration of ['0001_editorial.sql', '0002_editors_audit.sql'])
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
function insert(sqlite: SqlDatabase) {
  sqlite.prepare("INSERT INTO documents(id,category,title,data_json,private_notes,status,source_json,source_hash,updated_at) VALUES('procedure:301','procedure','Ficha publicada',?,?,'draft',?,?,'2026-10-27')")
    .run(canonicalJson(fixture), privateNotes, canonicalJson(fixture), hash(canonicalJson(fixture)));
}

test('D1 revision guard and immutable history protect optimistic saves', () => {
  const { sqlite } = database(); insert(sqlite);
  assert.throws(() => sqlite.exec("UPDATE documents SET title='Sin historial' WHERE id='procedure:301'"), /revision/);
  assert.equal(sqlite.prepare("UPDATE documents SET title='Primera edición',revision=revision+1 WHERE id='procedure:301' AND revision=1").run().changes, 1);
  assert.equal(sqlite.prepare("UPDATE documents SET title='Guardado concurrente',revision=revision+1 WHERE id='procedure:301' AND revision=1").run().changes, 0);
  assert.equal(sqlite.prepare("SELECT count(*) AS n FROM revisions").get()?.n, 2);
  assert.equal(sqlite.prepare("SELECT title FROM revisions WHERE revision=1").get()?.title, 'Ficha publicada');
  sqlite.close();
});

test('upstream proposals are idempotent, preserve edits and track removals separately', () => {
  const { sqlite } = database(); insert(sqlite);
  sqlite.exec("UPDATE documents SET title='Mi título',revision=revision+1 WHERE id='procedure:301'");
  const upstream = { ...fixture, content: 'Nuevo texto oficial' };
  const document = { id: 'procedure:301', category: 'procedure' as const, title: upstream.title, data: upstream };
  sqlite.exec(proposalSql([document], ['procedure:301'], '2026-10-27', 'batch1'));
  const row = sqlite.prepare('SELECT * FROM documents').get()!;
  assert.equal(row.title, 'Mi título'); assert.equal(row.private_notes, privateNotes);
  assert.equal(JSON.parse(String(row.data_json)).content, 'Texto público');
  assert.equal(JSON.parse(String(row.incoming_source_json)).content, 'Nuevo texto oficial');
  sqlite.exec(proposalSql([document], ['procedure:301'], '2026-10-27', 'batch2'));
  assert.equal(sqlite.prepare('SELECT revision FROM documents').get()?.revision, row.revision);
  sqlite.exec(proposalSql([], ['procedure:301'], '2026-10-27', 'batch3'));
  assert.deepEqual(JSON.parse(String(sqlite.prepare('SELECT incoming_source_json FROM documents').get()?.incoming_source_json)), { $removed: true });
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM publication_pointer').get()?.n, 0);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM ingest_parts').get()?.n, 0);
  sqlite.close();
});

test('publication pointer rejects unverified and stale releases and preserves active content on failure', () => {
  const { sqlite } = database(); insert(sqlite);
  sqlite.exec("UPDATE documents SET status='ready',revision=revision+1 WHERE id='procedure:301'");
  sqlite.exec("INSERT INTO releases(id,status,summary,created_at) VALUES('first','preparing','Primera','2026-10-27')");
  assert.throws(() => sqlite.exec("INSERT INTO publication_pointer VALUES(1,'first')"), /unverified/);
  sqlite.exec("INSERT INTO release_documents VALUES('first','procedure:301',2)");
  sqlite.exec("INSERT INTO release_artifacts VALUES('first','snapshot.json',0,'{}'); INSERT INTO release_artifacts VALUES('first','changelog.pdf',0,'cGRm'); INSERT INTO public_documents VALUES('first','procedure:301','301-ficha','Ficha','{}'); UPDATE releases SET hash='verified',metadata_json='{}' WHERE id='first'; INSERT INTO publication_pointer VALUES(1,'first')");
  assert.equal(sqlite.prepare("SELECT status FROM releases WHERE id='first'").get()?.status, 'published');
  assert.equal(sqlite.prepare('SELECT status FROM documents').get()?.status, 'published');
  sqlite.exec("INSERT INTO releases(id,status,summary,created_at,parent_id,hash,metadata_json) VALUES('stale','preparing','Vieja','2026-10-27',NULL,'verified','{}'); INSERT INTO release_artifacts VALUES('stale','snapshot.json',0,'{}'); INSERT INTO release_artifacts VALUES('stale','changelog.pdf',0,'cGRm'); INSERT INTO public_documents VALUES('stale','procedure:301','301-ficha','Ficha','{}')");
  assert.throws(() => sqlite.exec("UPDATE publication_pointer SET release_id='stale'"), /stale/);
  assert.equal(sqlite.prepare('SELECT release_id FROM publication_pointer').get()?.release_id, 'first');
  assert.throws(() => sqlite.exec("INSERT INTO releases(id,status,summary,created_at) VALUES('parallel','preparing','Otra','2026-10-27')"), /UNIQUE/);
  sqlite.close();
});

test('public artifact projection never includes draft, private notes or editor identity', async () => {
  const { sqlite, db } = database(); insert(sqlite);
  sqlite.exec("INSERT INTO releases(id,status,summary,created_at,hash,metadata_json) VALUES('first','preparing','Resumen público','2026-10-27','hash','{\"hash\":\"hash\"}'); INSERT INTO release_artifacts VALUES('first','snapshot.json',0,'{\"public\":true}'); INSERT INTO release_artifacts VALUES('first','changelog.pdf',0,'cGRm'); INSERT INTO public_documents VALUES('first','procedure:301','301-ficha','Ficha','{\"content\":\"Texto público\"}'); INSERT INTO publication_pointer VALUES(1,'first')");
  const env = { DB: db, ASSETS: { fetch: async () => new Response('shell') } } as Env;
  for (const pathname of ['/api/public/content', '/api/public/releases', '/api/public/documents/301-ficha', '/api/mobile/content/metadata']) {
    const response = await worker.fetch(new Request(`https://manual.test${pathname}`), env);
    assert.equal(response.status, 200);
    const body = await response.text(); assert.ok(!body.includes(privateNotes)); assert.ok(!body.includes('privateNotes')); assert.ok(!body.includes('email'));
  }
  const rejected = await worker.fetch(new Request('https://manual.test/api/editor/documents'), env);
  assert.equal(rejected.status, 401); assert.equal(rejected.headers.get('Cache-Control'), 'no-store');
  assert.equal((await worker.fetch(new Request('https://manual.test/gestion-editorial'), env)).status, 401);
  sqlite.exec("INSERT INTO release_artifacts VALUES('first','llms.txt',0,'Manual vigente'); INSERT INTO release_artifacts VALUES('first','history/index.json',0,'{\"totalEvents\":1}')");
  assert.equal(await (await worker.fetch(new Request('https://manual.test/llms.txt'), env)).text(), 'Manual vigente');
  assert.equal((await worker.fetch(new Request('https://manual.test/mobile-history/index.json'), env)).status, 200);
  env.ASSETS.fetch = async (request) => new URL(request.url).pathname === '/manual' ? new Response('new published route shell') : new Response('missing', { status: 404 });
  assert.equal(await (await worker.fetch(new Request('https://manual.test/manual/301-ficha'), env)).text(), 'new published route shell');
  assert.equal((await worker.fetch(new Request('https://manual.test/manual/nonexistent'), env)).status, 404);
  sqlite.close();
});

test('Cloudflare Access origin validation checks signature, owner, audience, expiry and CSRF', async () => {
  const keys = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', keys.publicKey);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ keys: [{ ...jwk, kid: 'fixture' }] });
  const config = { ACCESS_TEAM_DOMAIN: 'fixture.cloudflareaccess.com', ACCESS_AUD: 'editor', EDITOR_EMAIL: 'owner@example.test' };
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const signed = async (overrides = {}) => {
    const payload = `${encode({ alg: 'RS256', kid: 'fixture' })}.${encode({ iss: 'https://fixture.cloudflareaccess.com', aud: ['editor'], exp: Date.now() / 1000 + 600, email: config.EDITOR_EMAIL, ...overrides })}`;
    return `${payload}.${Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keys.privateKey, new TextEncoder().encode(payload))).toString('base64url')}`;
  };
  try {
    const token = await signed();
    const request = (jwt: string) => new Request('https://manual.test/api/editor/session', { headers: { 'Cf-Access-Jwt-Assertion': jwt } });
    assert.equal(await authenticate(request(token), config), config.EDITOR_EMAIL);
    for (const overrides of [{ aud: ['other'] }, { email: 'stranger@example.test' }, { exp: 1 }, { iss: 'https://attacker.test' }])
      assert.equal(await authenticate(request(await signed(overrides)), config), null);
    const parts = token.split('.'); parts[1] = encode({ email: config.EDITOR_EMAIL, aud: ['editor'], iss: 'https://fixture.cloudflareaccess.com', exp: Date.now() / 1000 + 9999 });
    assert.equal(await authenticate(request(parts.join('.')), config), null);
    const { sqlite, db } = database(); insert(sqlite);
    const env = { ...config, DB: db, ASSETS: { fetch: async () => new Response('shell') } } as Env;
    const response = await worker.fetch(new Request('https://manual.test/api/editor/documents/procedure%3A301', {
      method: 'PUT', headers: { 'Cf-Access-Jwt-Assertion': token, 'Content-Type': 'application/json', Origin: 'https://attacker.test' }, body: '{}',
    }), env);
    assert.equal(response.status, 403);
    const saved = await worker.fetch(new Request('https://manual.test/api/editor/documents/procedure%3A301', {
      method: 'PUT', headers: { 'Cf-Access-Jwt-Assertion': token, 'Content-Type': 'application/json', Origin: 'https://manual.test' },
      body: JSON.stringify({ expectedRevision: 1, title: 'Edición', data: fixture, privateNotes, references: [] }),
    }), env);
    assert.equal(saved.status, 200); assert.equal((await saved.json() as { document: { revision: number } }).document.revision, 2);
    sqlite.exec("INSERT INTO releases(id,status,summary,created_at) VALUES('stuck','preparing','Pendiente','2026-10-27')");
    const cancel = await worker.fetch(new Request('https://manual.test/api/editor/releases/stuck/cancel', {
      method: 'POST', headers: { 'Cf-Access-Jwt-Assertion': token, Origin: 'https://manual.test' },
    }), env);
    assert.equal(cancel.status, 200); assert.equal(sqlite.prepare("SELECT status FROM releases WHERE id='stuck'").get()?.status, 'failed');
    sqlite.close();
  } finally { globalThis.fetch = originalFetch; }
});

test('Unicode artifact chunks roundtrip without damaging multi-byte characters', () => {
  const input = 'Atención 😀 — '.repeat(10000);
  assert.equal(chunks(input).join(''), input);
  assert.ok(chunks(input).every((part) => Buffer.byteLength(part) < 100000));
});

test('upstream returning to the accepted baseline clears obsolete proposals; local-only documents are not removed', () => {
  const { sqlite } = database(); insert(sqlite);
  const source = { id: 'procedure:301', category: 'procedure' as const, title: fixture.title, data: fixture };
  sqlite.exec(proposalSql([{ ...source, data: { ...fixture, content: 'Temporal upstream change' } }], ['procedure:301'], '2026-10-27', 'first'));
  assert.notEqual(sqlite.prepare('SELECT incoming_source_json FROM documents').get()?.incoming_source_json, null);
  sqlite.exec(proposalSql([source], ['procedure:301'], '2026-10-27', 'revert'));
  assert.equal(sqlite.prepare('SELECT incoming_source_json FROM documents').get()?.incoming_source_json, null);
  sqlite.exec("INSERT INTO documents(id,category,title,data_json,updated_at) VALUES('procedure:local','procedure','Editorial propia','{}','2026-10-27')");
  sqlite.exec(proposalSql([source], ['procedure:301', 'procedure:local'], '2026-10-27', 'local'));
  assert.equal(sqlite.prepare("SELECT incoming_source_json FROM documents WHERE id='procedure:local'").get()?.incoming_source_json, null);
  sqlite.close();
});

test('historical attachments recover frozen bytes and rewrite nested editorial links', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'manual-frozen-'));
  const original = Buffer.from('Frozen reviewed clinical PDF'); const newer = Buffer.from('Different unreviewed PDF');
  fs.mkdirSync(path.join(directory, 'public/docs'), { recursive: true });
  fs.writeFileSync(path.join(directory, 'public/docs/example.pdf'), newer);
  let recovered = false;
  const options = { cwd: directory, assetRoot: path.join(directory, 'assets'), origin: 'https://manual.test', fetch: async (url: string | URL | Request) => {
    recovered = true; assert.match(String(url), new RegExp(hash(original))); return new Response(original);
  } };
  try {
    const result = await retainFrozenAsset('/docs/example.pdf', hash(original), original.byteLength, options);
    assert.ok(recovered); assert.deepEqual(fs.readFileSync(path.join(options.assetRoot, result)), original);
    assert.deepEqual(fs.readFileSync(path.join(directory, 'public/docs/example.pdf')), newer);
    const blocks = [{ items: [{ href: '/docs/example.pdf', localPath: '/docs/example.pdf' }] }];
    assert.deepEqual(rewriteAssetPaths(blocks, '/docs/example.pdf', result), [{ items: [{ href: result, localPath: result }] }]);
    await assert.rejects(retainFrozenAsset('/docs/missing.pdf', hash(original), original.byteLength, { ...options, assetRoot: path.join(directory, 'other'), fetch: async () => new Response(newer) }), /integrity/);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

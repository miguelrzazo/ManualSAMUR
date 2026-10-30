import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import matter from 'gray-matter';
import { jsPDF } from 'jspdf';
import { buildMobileContentSnapshot } from '../../lib/mobile-snapshot.ts';
import { loadProcedureSources } from '../../lib/procedure-compiler.ts';
import { canonicalJson, contentHash, isMobileContentSnapshot, mobileAttachmentEntries, packageHash, type MobileContentSnapshot, type MobileProcedure, type MobileUpdateEvent } from '../../packages/manual-content/src/index.ts';
import { chunks, codeFiles, datasetFiles, hash, importDocuments, proposalSql, sql, stageText } from './core.ts';
import { retainFrozenAsset, rewriteAssetPaths as rewritePaths } from './assets.ts';
import { buildPublicDatasetArtifacts } from './public-datasets.ts';

const args = process.argv.slice(2);
const command = args[0];
const remote = args.includes('--remote');
const envIndex = args.indexOf('--env');
const environment = envIndex >= 0 ? args[envIndex + 1] : remote ? 'production' : undefined;
if (environment && !['staging', 'production'].includes(environment)) throw new Error('Environment must be staging or production.');
const cwd = process.cwd();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'manualsamur-backend-'));
const wrangler = path.join(cwd, 'node_modules/wrangler/bin/wrangler.js');
const environmentArgs = environment ? ['--env', environment] : [];

function runWrangler(argv: string[], capture = false): string {
  const result = spawnSync(process.execPath, [wrangler, ...argv], {
    cwd, env: { ...process.env, WRANGLER_LOG_PATH: process.env.WRANGLER_LOG_PATH || path.join(tmp, 'wrangler.log') },
    encoding: 'utf8', maxBuffer: 100 * 1024 * 1024, stdio: capture ? 'pipe' : 'inherit',
  });
  // SQL and draft data are never echoed on failure.
  if (result.status !== 0) {
    const diagnostics = path.join(cwd, '.cloudflare/last-error.log'); fs.mkdirSync(path.dirname(diagnostics), { recursive: true });
    fs.writeFileSync(diagnostics, `${result.error?.message || ''}\n${result.stderr || ''}\n${result.stdout || ''}`, { mode: 0o600 });
    throw new Error('Wrangler failed. Inspect the private .cloudflare/last-error.log; do not upload it to public artifacts.');
  }
  return result.stdout || '';
}

function execute<T = Record<string, unknown>>(text: string, read = false): T[] {
  const base = ['d1', 'execute', 'DB', ...environmentArgs, remote ? '--remote' : '--local'];
  if (read) {
    // Remote --file uses the SQL-import API: it emits progress even with --json
    // and returns import statistics, not SELECT rows. Queries must use --command.
    // These are fixed SELECT statements containing only non-secret identifiers.
    const output = runWrangler([...base, '--command', text, '--json'], true);
    const results = JSON.parse(output) as Array<{ results?: T[]; success?: boolean }>;
    if (results.some((result) => result.success === false)) throw new Error('D1 rejected the query.');
    return results.flatMap((result) => result.results || []);
  }
  const file = path.join(tmp, `${randomUUID()}.sql`); fs.writeFileSync(file, text, { mode: 0o600 });
  // Mutation bodies stay in private files rather than process arguments. Wrangler
  // exits nonzero on import failure; do not parse the human progress stream.
  runWrangler([...base, '--file', file, '--yes', '--json'], true);
  return [];
}

function seed() {
  const existing = execute<{ id: string }>('SELECT id FROM documents LIMIT 1;', true);
  if (existing.length) throw new Error('Seed is only allowed on an empty database; use propose for existing editorial data.');
  const snapshot = buildMobileContentSnapshot();
  const documents = importDocuments(structuredClone(snapshot));
  const statements: string[] = []; const batch = randomUUID(); const now = new Date().toISOString();
  for (const document of documents) {
    const staged = stageText(batch, document.id, canonicalJson(document.data)); statements.push(...staged.statements);
    statements.push(`INSERT INTO documents(id,category,title,data_json,status,source_json,source_hash,updated_at) VALUES(${sql(document.id)},${sql(document.category)},${sql(document.title)},${staged.expression},'ready',${staged.expression},${sql(hash(canonicalJson(document.data)))},${sql(now)});`);
  }
  statements.push(`DELETE FROM ingest_parts WHERE batch=${sql(batch)};`);
  execute(statements.join('\n'));
  console.log(`Imported ${documents.length} reviewed candidates. Nothing is public until a verified release is activated.`);
}

async function propose() {
  const existing = execute<{ id: string }>('SELECT id FROM documents;', true);
  if (!existing.length) throw new Error('Seed the editorial database before proposing automatic changes.');
  const snapshot = buildMobileContentSnapshot();
  const sourceMetadata = new Map(loadProcedureSources().map((source) => [source.id, matter.read(source.filePath).data]));
  for (const procedure of snapshot.content.procedures) {
    const metadata = sourceMetadata.get(procedure.id);
    if (typeof metadata?.sourceTitle === 'string') procedure.title = metadata.sourceTitle;
    if (typeof metadata?.sourceSection === 'string') procedure.section = metadata.sourceSection;
  }
  const documents = importDocuments(structuredClone(snapshot));
  // Reject broad unexplained withdrawals before touching D1.
  const previousCount = existing.filter((document) => document.id.startsWith('procedure:')).length;
  if (documents.filter((document) => document.category === 'procedure').length < previousCount * 0.8)
    throw new Error('Candidate removes more than 20% of procedures. Manual investigation required.');
  // Preserve source attachment bytes before the CI candidate workspace disappears.
  // A later editorial publication must not depend on a new upstream download.
  await prepareAssets(snapshot);
  if (remote) runWrangler(['deploy', '--config', 'backend/attachments.wrangler.jsonc', ...environmentArgs]);
  execute(proposalSql(documents, existing.map((document) => document.id), new Date().toISOString(), randomUUID()));
  console.log(`Checked ${documents.length} source candidates. Existing reviewed content and active publication were preserved.`);
}

interface FrozenRow { document_id: string; revision: number; title: string; category: string; data_json: string }
interface Release { id: string; status: string; summary: string; parent_id: string | null; created_at: string }


function freezeInitial(): string {
  const preparing = execute<{ id: string }>("SELECT id FROM releases WHERE status='preparing';", true);
  if (preparing.length) throw new Error('A publication is already in progress.');
  const pointer = execute('SELECT * FROM publication_pointer;', true);
  if (pointer.length) throw new Error('Use the editor to prepare subsequent publications.');
  const id = randomUUID();
  execute(`INSERT INTO releases(id,status,summary,created_at) VALUES(${sql(id)},'preparing','Primera publicación del manual.',${sql(new Date().toISOString())});
    INSERT INTO release_documents SELECT ${sql(id)},id,revision FROM documents WHERE status='ready';`);
  return id;
}

function jsonFile(root: string, name: string, value: unknown) {
  const destination = path.join(root, 'content/data', `${name}.json`);
  fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.writeFileSync(destination, JSON.stringify(value));
}

async function compileRelease(rows: FrozenRow[], release: Release, oldSnapshot?: MobileContentSnapshot): Promise<MobileContentSnapshot> {
  const root = path.join(tmp, 'compile'); fs.mkdirSync(path.join(root, 'content/procedures'), { recursive: true });
  fs.mkdirSync(path.join(root, 'public'), { recursive: true });
  const seen = new Set<string>();
  for (const row of rows) {
    const data = JSON.parse(row.data_json);
    if (row.category === 'procedure') {
      const procedure = data as MobileProcedure;
      // Rebuild from frozen bytes, never from whichever files happen to be in
      // the checkout. This also makes historical releases restorable.
      for (const attachment of procedure.attachments) {
        if (!attachment.sha256 || attachment.byteLength === undefined) continue;
        const before = attachment.localPath;
        const immutable = await retainAsset(before, attachment.sha256, attachment.byteLength);
        const destination = path.join(root, 'public', immutable.slice(1));
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.copyFileSync(path.join(assetRoot, immutable.slice(1)), destination);
        attachment.localPath = immutable;
        procedure.content = procedure.content.replaceAll(before, immutable);
        procedure.editorialBlocks = rewritePaths(procedure.editorialBlocks, before, immutable) as unknown[];
      }
      if (!/^[A-Za-z0-9_-]+$/.test(procedure.id)) throw new Error(`Invalid stable procedure identifier: ${procedure.id}`);
      const { content, editorialBlocks, ...metadata } = procedure;
      fs.writeFileSync(path.join(root, 'content/procedures', `${procedure.id}.md`), matter.stringify(content, { ...metadata, title: row.title }));
      fs.writeFileSync(path.join(root, 'content/procedures', `${procedure.id}.blocks.json`), JSON.stringify(editorialBlocks || []));
    } else {
      const key = row.document_id.replace(/^dataset:/, ''); seen.add(key);
      if (key === 'codes') {
        for (const [group, file] of Object.entries(codeFiles)) jsonFile(root, file, data.value[group] ?? []);
      } else if (datasetFiles[key]) jsonFile(root, datasetFiles[key], key === 'manual' ? { ...data.value, lastApprovedAt: release.created_at } : data.value);
    }
  }
  for (const required of ['codes', ...Object.keys(datasetFiles).filter((key) => key !== 'updates')])
    if (!seen.has(required)) throw new Error(`Missing required dataset: ${required}`);
  const previous = oldSnapshot?.content.procedures || [];
  const previousRows = release.parent_id ? execute<FrozenRow>(`SELECT rd.document_id,r.data_json,r.title FROM release_documents rd JOIN revisions r ON r.document_id=rd.document_id AND r.revision=rd.revision WHERE rd.release_id=${sql(release.parent_id)};`, true) : [];
  const previousById = new Map(previousRows.map((row) => [row.document_id, row]));
  const events: MobileUpdateEvent[] = [];
  for (const row of rows.filter((row) => row.category === 'procedure')) {
    const procedure = JSON.parse(row.data_json) as MobileProcedure;
    const before = previous.find((candidate) => candidate.id === procedure.id);
    const previousRow = previousById.get(row.document_id);
    if (previousRow?.data_json === row.data_json && previousRow.title === row.title) continue;
    events.push({ eventId: `${release.id}:${procedure.id}`, procedureIds: [procedure.id], changeKind: before ? 'actualizado' : 'nuevo',
      summary: `${row.title}`, effectiveDate: release.created_at, approvedAt: release.created_at,
      category: 'procedure', routeKey: `procedure:${procedure.id}`, scope: 'procedimiento',
      diff: before ? `Antes: ${before.content.slice(0, 4000)}\n\nDespués: ${procedure.content.slice(0, 4000)}` : undefined });
  }
  for (const before of previous.filter((procedure) => !rows.some((row) => row.document_id === `procedure:${procedure.id}`)))
    events.push({ eventId: `${release.id}:${before.id}`, procedureIds: [before.id], changeKind: 'eliminado', summary: before.title,
      effectiveDate: release.created_at, approvedAt: release.created_at, category: 'procedure', scope: 'procedimiento' });
  for (const row of rows.filter((row) => row.category === 'dataset')) {
    const before = previousById.get(row.document_id);
    if (before?.data_json === row.data_json) continue;
    if (row.document_id !== 'dataset:codes' && row.document_id !== 'dataset:drugs') continue;
    events.push({ eventId: `${release.id}:${row.document_id}`, procedureIds: [], changeKind: before ? 'actualizado' : 'nuevo',
      summary: row.document_id === 'dataset:codes' ? 'Códigos del manual' : 'Vademécum', effectiveDate: release.created_at,
      approvedAt: release.created_at, category: row.document_id === 'dataset:codes' ? 'codigo' : 'vademecum',
      diff: before ? 'Se ha publicado una revisión de este conjunto de datos.' : undefined });
  }
  jsonFile(root, 'manual-updates', { events });
  const snapshot = buildMobileContentSnapshot(root, release.created_at);
  if (!snapshot.content.procedures.length) throw new Error('Cannot publish an empty manual.');
  if (new Set(snapshot.content.procedures.map((procedure) => procedure.slug)).size !== snapshot.content.procedures.length)
    throw new Error('Duplicate procedure slugs.');
  return snapshot;
}

function readSnapshot(releaseId: string): MobileContentSnapshot | undefined {
  const parts = execute<{ body: string }>(`SELECT body FROM release_artifacts WHERE release_id=${sql(releaseId)} AND name='snapshot.json' ORDER BY part;`, true);
  return parts.length ? JSON.parse(parts.map((part) => part.body).join('')) : undefined;
}

const assetRoot = path.join(cwd, '.cloudflare/attachments');
async function retainAsset(localPath: string, expectedHash: string, expectedSize?: number) {
  return retainFrozenAsset(localPath, expectedHash, expectedSize, { cwd, assetRoot, origin: process.env.PUBLICATION_ORIGIN });
}

async function prepareAssets(snapshot: MobileContentSnapshot) {
  fs.mkdirSync(assetRoot, { recursive: true });
  // Retain all published assets so rollback and installed offline packages remain valid.
  const previous = execute<{ id: string }>("SELECT id FROM releases WHERE status='published';", true);
  for (const publication of previous) {
    const old = readSnapshot(publication.id);
    for (const attachment of old ? mobileAttachmentEntries(old.content) : []) {
      if (!attachment.sha256) continue; // Explicitly unavailable upstream; not an offline file.
      await retainAsset(attachment.localPath, attachment.sha256, attachment.byteLength);
    }
  }
  // Include unpublished/reviewed historical attachments too: drafts and their
  // revision restores can outlive the disposable monthly extraction workspace.
  const history = execute<{ localPath: string; sha256: string; byteLength: number }>(`SELECT DISTINCT
    json_extract(a.value,'$.localPath') AS localPath,json_extract(a.value,'$.sha256') AS sha256,json_extract(a.value,'$.byteLength') AS byteLength
    FROM (SELECT data_json AS body FROM revisions UNION ALL SELECT source_json FROM revisions WHERE source_json IS NOT NULL
      UNION ALL SELECT incoming_source_json FROM revisions WHERE incoming_source_json IS NOT NULL) h,
      json_each(h.body,'$.attachments') a WHERE json_extract(a.value,'$.sha256') IS NOT NULL;`, true);
  for (const attachment of history) await retainAsset(attachment.localPath, attachment.sha256, attachment.byteLength);
  for (const procedure of snapshot.content.procedures) {
    for (const attachment of procedure.attachments) {
      if (!attachment.sha256 || attachment.byteLength === undefined) continue;
      const before = attachment.localPath;
      attachment.localPath = await retainAsset(before, attachment.sha256, attachment.byteLength);
      procedure.content = procedure.content.replaceAll(before, attachment.localPath);
      procedure.editorialBlocks = rewritePaths(procedure.editorialBlocks, before, attachment.localPath) as unknown[];
    }
  }
  // Keep attachments on a hard, free static-assets budget; no billing-enabled R2.
  let total = 0; let count = 0;
  function measure(directory: string) { for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) measure(file); else { const size = fs.statSync(file).size; if (size > 25 * 1024 * 1024) throw new Error('Attachment exceeds static asset size limit.'); total += size; count++; }
  } }
  measure(assetRoot);
  if (count > 19000 || total > 400 * 1024 * 1024) throw new Error('Static attachment retention budget reached. Archive/export before adding more assets.');
  snapshot.hash = contentHash(snapshot.content); snapshot.contentHash = snapshot.hash;
  snapshot.packageHash = packageHash(snapshot.content, mobileAttachmentEntries(snapshot.content));
  if (!isMobileContentSnapshot(snapshot)) throw new Error('Generated publication failed the native snapshot contract.');
}

function artifactsSql(release: Release, snapshot: MobileContentSnapshot, rows: FrozenRow[]) {
  const statements = [`DELETE FROM release_artifacts WHERE release_id=${sql(release.id)};`, `DELETE FROM public_documents WHERE release_id=${sql(release.id)};`];
  const pdf = new jsPDF();
  pdf.setFontSize(18); pdf.text('Manual SAMUR - Cambios', 15, 20); pdf.setFontSize(11);
  let y = 30;
  for (const line of [release.summary, ...snapshot.content.updates.map((event) => `${event.changeKind}: ${event.summary}`)]) {
    for (const part of pdf.splitTextToSize(line, 180)) { if (y > 280) { pdf.addPage(); y = 20; } pdf.text(String(part), 15, y); y += 6; }
    y += 4;
  }
  const pdfBytes = Buffer.from(pdf.output('arraybuffer'));
  const artifacts: Array<[string, string[]]> = [
    ['snapshot.json', chunks(JSON.stringify(snapshot))],
    ['changelog.pdf', Array.from({ length: Math.ceil(pdfBytes.byteLength / 12000) }, (_, index) => pdfBytes.subarray(index * 12000, (index + 1) * 12000).toString('base64'))],
    ['llms.txt', chunks(`# Manual SAMUR\n\nAdaptación no oficial.\n\n${snapshot.content.procedures.map((procedure) => `- [${procedure.id}: ${procedure.title}](/procedures/${procedure.slug}.md)`).join('\n')}`)],
    ['llms-full.txt', chunks(snapshot.content.procedures.map((procedure) => `# ${procedure.id}: ${procedure.title}\n\n${procedure.content}`).join('\n\n---\n\n'))],
  ];
  for (const [name, body] of buildPublicDatasetArtifacts(snapshot, release.id).files) artifacts.push([name, chunks(body)]);
  const history = new Map(snapshot.content.updates.map((event) => [event.eventId, event]));
  for (const prior of execute<{ id: string }>("SELECT id FROM releases WHERE status='published';", true))
    for (const event of readSnapshot(prior.id)?.content.updates || []) history.set(event.eventId, event);
  const historyEvents = [...history.values()].sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));
  const pageSize = 100; const totalPages = Math.max(1, Math.ceil(historyEvents.length / pageSize));
  const historyBase = { schema: 'samur-manual.mobile-history', version: 1, publicationIdentity: snapshot.packageHash,
    pageSize, totalEvents: historyEvents.length, totalPages };
  artifacts.push(['history/index.json', chunks(JSON.stringify({ ...historyBase, generatedAt: snapshot.generatedAt,
    pages: Array.from({ length: totalPages }, (_, page) => ({ page, path: `/mobile-history/${snapshot.packageHash}/page-${String(page).padStart(4, '0')}.json` })) }))]);
  for (let page = 0; page < totalPages; page++) artifacts.push([`history/page-${String(page).padStart(4, '0')}.json`,
    chunks(JSON.stringify({ ...historyBase, page, events: historyEvents.slice(page * pageSize, (page + 1) * pageSize) }))]);
  for (const [name, parts] of artifacts) parts.forEach((part, index) => statements.push(`INSERT INTO release_artifacts VALUES(${sql(release.id)},${sql(name)},${index},${sql(part)});`));
  const batch = randomUUID();
  for (const procedure of snapshot.content.procedures) {
    const staged = stageText(batch, procedure.id, JSON.stringify(procedure)); statements.push(...staged.statements);
    statements.push(`INSERT INTO public_documents VALUES(${sql(release.id)},${sql(`procedure:${procedure.id}`)},${sql(procedure.slug)},${sql(procedure.title)},${staged.expression});`);
  }
  statements.push(`DELETE FROM ingest_parts WHERE batch=${sql(batch)};`);
  const metadata = JSON.stringify({ schema: snapshot.schema, version: snapshot.version, hash: snapshot.hash, packageHash: snapshot.packageHash,
    generatedAt: snapshot.generatedAt, releaseId: release.id, contentUrl: `/api/public/releases/${release.id}/snapshot` });
  const changes = JSON.stringify(snapshot.content.updates.map((event) => ({ kind: event.changeKind, title: event.summary, procedureIds: event.procedureIds })));
  const stagedChanges = stageText(batch, 'changes', changes); statements.push(...stagedChanges.statements);
  statements.push(`UPDATE releases SET hash=${sql(snapshot.hash)},package_hash=${sql(snapshot.packageHash)},metadata_json=${sql(metadata)},changelog_json=${stagedChanges.expression} WHERE id=${sql(release.id)} AND status='preparing';`);
  statements.push(`DELETE FROM ingest_parts WHERE batch=${sql(batch)};`);
  // Revision IDs have been frozen by the editor. The activation below does not read mutable drafts.
  void rows;
  return statements.join('\n');
}

async function publish() {
  const index = args.indexOf('--release');
  const id = index >= 0 ? args[index + 1] : freezeInitial();
  if (!id || !/^[a-zA-Z0-9-]+$/.test(id)) throw new Error('Invalid release id.');
  const release = execute<Release>(`SELECT * FROM releases WHERE id=${sql(id)};`, true)[0];
  if (!release || release.status !== 'preparing') throw new Error('Release is not preparing.');
  try {
    const rows = execute<FrozenRow>(`SELECT rd.document_id,rd.revision,r.title,d.category,r.data_json FROM release_documents rd JOIN revisions r ON r.document_id=rd.document_id AND r.revision=rd.revision JOIN documents d ON d.id=rd.document_id WHERE rd.release_id=${sql(id)};`, true);
    const old = release.parent_id ? readSnapshot(release.parent_id) : undefined;
    const snapshot = await compileRelease(rows, release, old);
    await prepareAssets(snapshot);
    if (remote) runWrangler(['deploy', '--config', 'backend/attachments.wrangler.jsonc', ...environmentArgs]);
    else {
      // Local main Worker serves the same versioned files from its asset binding.
      fs.mkdirSync(path.join(cwd, 'out'), { recursive: true }); fs.cpSync(assetRoot, path.join(cwd, 'out'), { recursive: true });
    }
    execute(artifactsSql(release, snapshot, rows));
    // A transactional conditional pointer update is the only visibility switch.
    // A trigger enforces the parent comparison and prevents stale jobs publishing.
    const active = execute('SELECT release_id FROM publication_pointer WHERE singleton=1;', true);
    execute(active.length ? `UPDATE publication_pointer SET release_id=${sql(id)} WHERE singleton=1;`
      : `INSERT INTO publication_pointer(singleton,release_id) VALUES(1,${sql(id)});`);
    console.log(`Published verified release ${id} (${snapshot.hash}).`);
  } catch (error) {
    execute(`UPDATE releases SET status='failed',error='No se pudo verificar o publicar el paquete. Consulta el proceso de publicación.' WHERE id=${sql(id)} AND status='preparing';`);
    throw error;
  }
}

/**
 * Adds the per-dataset artifacts and manifest.json to an already published
 * release, derived from its own frozen snapshot (no content changes). Used once
 * for releases activated before the public data API existed.
 */
function backfillDatasets() {
  const index = args.indexOf('--release');
  const pointer = execute<{ release_id: string }>('SELECT release_id FROM publication_pointer WHERE singleton=1;', true)[0];
  const id = index >= 0 ? args[index + 1] : pointer?.release_id;
  if (!id || !/^[a-zA-Z0-9-]+$/.test(id)) throw new Error('No active release to backfill.');
  const existing = execute(`SELECT 1 FROM release_artifacts WHERE release_id=${sql(id)} AND name='manifest.json' LIMIT 1;`, true);
  if (existing.length) { console.log(`Release ${id} already has a public manifest.`); return; }
  const snapshot = readSnapshot(id);
  if (!snapshot || !isMobileContentSnapshot(snapshot)) throw new Error('Release snapshot missing or invalid.');
  const statements: string[] = [];
  for (const [name, body] of buildPublicDatasetArtifacts(snapshot, id).files)
    chunks(body).forEach((part, part_) => statements.push(`INSERT OR REPLACE INTO release_artifacts VALUES(${sql(id)},${sql(name)},${part_},${sql(part)});`));
  execute(statements.join('\n'));
  console.log(`Public datasets and manifest added to release ${id}.`);
}

try {
  if (command === 'seed') seed();
  else if (command === 'backfill-datasets') backfillDatasets();
  else if (command === 'propose') await propose();
  else if (command === 'publish') await publish();
  else throw new Error('Usage: cli.ts seed|propose|publish|backfill-datasets [--remote] [--env staging|production] [--release id]');
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
